import { describe, expect, test } from "vitest";
import { parseMultipartStream } from "../src/index.js";
import {
  defaultMultipartMaxBytes,
  sanitizeMultipartFilename,
} from "../src/multipart.js";

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

  test("can pipe a part through a Cloudflare-style FixedLengthStream when length is known", async () => {
    const boundary = "mreact-boundary";
    const request = multipartRequest(boundary, [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="note.txt"\r\n`,
      `Content-Length: 11\r\n\r\n`,
      `hello world`,
      `\r\n--${boundary}--\r\n`,
    ]);
    const previous = (globalThis as { FixedLengthStream?: unknown }).FixedLengthStream;
    (globalThis as { FixedLengthStream?: unknown }).FixedLengthStream = class extends TransformStream {
      constructor(_length: number | bigint) {
        super();
      }
    };

    try {
      const seen: string[] = [];

      for await (const part of parseMultipartStream(request)) {
        const fixed = part.fixedLengthStream();
        seen.push(await streamText(fixed.readable));
        await fixed.done;
      }

      expect(seen).toEqual(["hello world"]);
    } finally {
      if (previous === undefined) {
        delete (globalThis as { FixedLengthStream?: unknown }).FixedLengthStream;
      } else {
        (globalThis as { FixedLengthStream?: unknown }).FixedLengthStream = previous;
      }
    }
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

  test("applies a default total byte cap when maxBytes is omitted", async () => {
    const boundary = "mreact-boundary";
    const request = multipartRequest(boundary, [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="large.txt"\r\n\r\n`,
      "x".repeat(defaultMultipartMaxBytes + 1),
      `\r\n--${boundary}--\r\n`,
    ]);

    await expect(async () => {
      for await (const part of parseMultipartStream(request)) {
        await streamText(part.body);
      }
    }).rejects.toThrow(`multipart request exceeded ${defaultMultipartMaxBytes} bytes`);
  });

  test("rejects multipart requests that exceed maxParts", async () => {
    const boundary = "mreact-boundary";
    const request = multipartRequest(boundary, [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="a"\r\n\r\n`,
      `1\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="b"\r\n\r\n`,
      `2\r\n`,
      `--${boundary}--\r\n`,
    ]);

    await expect(async () => {
      for await (const part of parseMultipartStream(request, { maxParts: 1 })) {
        await part.text();
      }
    }).rejects.toThrow("multipart request exceeded 1 parts");
  });

  test("exposes a sanitized filename helper while preserving the raw filename", async () => {
    const boundary = "mreact-boundary";
    const request = multipartRequest(boundary, [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="../../secret.txt"\r\n\r\n`,
      `payload`,
      `\r\n--${boundary}--\r\n`,
    ]);
    const iterator = parseMultipartStream(request)[Symbol.asyncIterator]();
    const first = await iterator.next();

    expect(first.done).toBe(false);
    expect(first.value.filename).toBe("../../secret.txt");
    expect(first.value.safeFilename).toBe("secret.txt");
    expect(sanitizeMultipartFilename("../../secret\u0000.txt")).toBe("secret_.txt");
    expect(sanitizeMultipartFilename("..\\..\\avatar.png")).toBe("avatar.png");
  });

  test("parses Buffer-backed multipart chunks", async () => {
    const boundary = "mreact-buffer-boundary";
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\npayload\r\n--${boundary}--\r\n`;
    const bytes = Buffer.from(body);
    const request = multipartByteRequest(boundary, [bytes.subarray(0, 17), bytes.subarray(17)]);

    await expect(readMultipartParts(request)).resolves.toEqual(["file:payload"]);
  });

  test("parses the closing search delimiter split at every byte boundary", async () => {
    const boundary = "mreact-split-boundary";
    const encoder = new TextEncoder();
    const source = `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--${boundary}--\r\n`;
    const body = encoder.encode(source);
    const delimiter = encoder.encode(`\r\n--${boundary}`);
    const closingBoundary = encoder.encode(`\r\n--${boundary}--\r\n`);
    const closingDelimiterStart = body.length - closingBoundary.length;

    for (let offset = 1; offset < delimiter.length; offset += 1) {
      const split = closingDelimiterStart + offset;
      const request = multipartByteRequest(boundary, [
        body.subarray(0, split),
        body.subarray(split),
      ]);

      let parts: string[];

      try {
        parts = await readMultipartParts(request);
      } catch (error) {
        throw new Error(`offset=${offset}, split=${split}`, { cause: error });
      }

      expect(parts, `split=${split}`).toEqual(["field:value"]);
    }
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

function multipartByteRequest(
  boundary: string,
  chunks: readonly Uint8Array<ArrayBufferLike>[],
): Request {
  return new Request("https://app.test/upload", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: new ReadableStream<Uint8Array<ArrayBufferLike>>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function readMultipartParts(request: Request): Promise<string[]> {
  const parts: string[] = [];

  for await (const part of parseMultipartStream(request)) {
    parts.push(`${part.name}:${await streamText(part.body)}`);
  }

  return parts;
}
