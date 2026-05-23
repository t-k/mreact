import { describe, expect, test } from "vitest";
import { parseMultipartStream } from "../src/index.js";

describe("parseMultipartStream", () => {
  test("streams multipart text and file parts without request.formData", async () => {
    const boundary = "mreact-boundary";
    const request = multipartRequest(boundary, [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="__mreact_csrf"\r\n\r\n`,
      `token-123\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="note.txt"\r\n`,
      `Content-Type: text/plain\r\n\r\n`,
      `hello `,
      `stream`,
      `\r\n--${boundary}--\r\n`,
    ]);
    const parts = parseMultipartStream(request, {
      fields: {
        __mreact_csrf: { type: "text", maxBytes: 32 },
        file: { type: "stream", maxBytes: 64 },
      },
      maxBytes: 256,
    });

    const seen: string[] = [];

    for await (const part of parts) {
      if (part.name === "__mreact_csrf") {
        seen.push(`csrf:${await part.text()}`);
      } else if (part.name === "file") {
        seen.push(`${part.filename}:${part.contentType}:${await streamText(part.body)}`);
      }
    }

    expect(seen).toEqual([
      "csrf:token-123",
      "note.txt:text/plain:hello stream",
    ]);
  });

  test("rejects multipart requests without a boundary before reading the body", async () => {
    const request = new Request("https://app.test/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "not parsed",
    });

    await expect(async () => {
      for await (const _part of parseMultipartStream(request)) {
        // The parser should fail before yielding any parts.
      }
    }).rejects.toThrow(/boundary/i);
  });

  test("enforces per-part byte limits while streaming", async () => {
    const boundary = "mreact-boundary";
    const request = multipartRequest(boundary, [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="large.txt"\r\n\r\n`,
      `too-large`,
      `\r\n--${boundary}--\r\n`,
    ]);

    await expect(async () => {
      for await (const part of parseMultipartStream(request, {
        fields: { file: { type: "stream", maxBytes: 4 } },
      })) {
        await streamText(part.body);
      }
    }).rejects.toThrow(/file.*4 bytes/i);
  });

  test("cancels the request body when iteration stops before a file part is consumed", async () => {
    const boundary = "mreact-boundary";
    let cancelled = false;
    const encoder = new TextEncoder();
    const request = new Request("https://app.test/upload", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`--${boundary}\r\n`));
          controller.enqueue(encoder.encode(`Content-Disposition: form-data; name="file"; filename="large.txt"\r\n\r\n`));
          controller.enqueue(encoder.encode("chunk"));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    for await (const part of parseMultipartStream(request)) {
      expect(part.name).toBe("file");
      break;
    }

    expect(cancelled).toBe(true);
  });
});

function multipartRequest(boundary: string, chunks: readonly string[]): Request {
  const encoder = new TextEncoder();

  return new Request("https://app.test/upload", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function streamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        return text;
      }

      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    text += decoder.decode();
    reader.releaseLock();
  }
}
