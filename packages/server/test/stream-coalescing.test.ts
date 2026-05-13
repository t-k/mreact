// Tests for issue 084: renderToReadableStream coalesces multiple
// sink.append calls into a single enqueue per flush boundary.
//
// Invariants we want to preserve:
// - Output bytes (UTF-8 decoded) are byte-identical to the previous
//   per-append-enqueue implementation.
// - When the render function returns synchronously and there are no
//   deferred tasks, the consumer observes a single chunk (was: N).
// - When the render function defers async work, the consumer observes
//   the synchronous "shell" prefix as one chunk and each deferred
//   task contributes its own chunk(s). The shell must arrive before
//   any deferred task body, even if the deferred work resolves on a
//   later microtask.
// - Empty appends are no-ops and do not produce empty chunks.
// - Errors thrown synchronously inside the render callback propagate
//   to the stream consumer and do not emit any partial chunk that was
//   already enqueued before the throw.
import { describe, expect, test } from "vitest";
import { renderToReadableStream } from "../src/index.js";

interface ChunkLog {
  chunks: string[];
  bytes: number;
}

async function collectChunks(stream: ReadableStream<Uint8Array>): Promise<ChunkLog> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) {
      // Flush any trailing multi-byte sequence (none in our fixtures).
      const tail = decoder.decode();
      if (tail !== "") chunks.push(tail);
      return { chunks, bytes };
    }
    chunks.push(decoder.decode(result.value, { stream: true }));
    bytes += result.value.length;
  }
}

describe("renderToReadableStream coalescing (issue 084)", () => {
  test("sync render: all appends coalesce into a single chunk", async () => {
    const stream = renderToReadableStream((sink) => {
      sink.append("<!DOCTYPE html>");
      sink.append("<html><body>");
      sink.append("<p>Hello</p>");
      sink.append("</body></html>");
    });

    const log = await collectChunks(stream);
    expect(log.chunks.join("")).toBe(
      "<!DOCTYPE html><html><body><p>Hello</p></body></html>",
    );
    expect(log.chunks.length).toBe(1);
  });

  test("UTF-8 byte content matches direct encoding", async () => {
    // Verify the encode path is correct for multibyte characters and HTML
    // entities — the same source string must produce the same bytes.
    const html = "<p>日本語 &amp; <world></p>";
    const stream = renderToReadableStream((sink) => {
      sink.append(html);
    });
    const log = await collectChunks(stream);
    expect(log.chunks.join("")).toBe(html);
    expect(log.bytes).toBe(new TextEncoder().encode(html).length);
  });

  test("empty appends are skipped (no empty chunks emitted)", async () => {
    const stream = renderToReadableStream((sink) => {
      sink.append("");
      sink.append("X");
      sink.append("");
      sink.append("Y");
      sink.append("");
    });
    const log = await collectChunks(stream);
    expect(log.chunks.join("")).toBe("XY");
    // The single coalesced chunk carries only "XY" — no internal empties.
    expect(log.chunks.length).toBe(1);
  });

  test("deferred task produces a distinct chunk after the shell", async () => {
    // Simulates the streaming-OOB pattern: sink.defer schedules work
    // that calls sink.append once it completes. The shell must arrive
    // first, then the deferred body as a separate chunk.
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      sink.defer!(
        Promise.resolve().then(() => {
          sink.append("BODY");
        }),
      );
    });
    const log = await collectChunks(stream);
    expect(log.chunks.join("")).toBe("SHELLBODY");
    expect(log.chunks.length).toBe(2);
    expect(log.chunks[0]).toBe("SHELL");
    expect(log.chunks[1]).toBe("BODY");
  });

  test("multiple deferred tasks each contribute their own chunk", async () => {
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      sink.defer!(
        Promise.resolve().then(() => {
          sink.append("A");
        }),
      );
      sink.defer!(
        Promise.resolve().then(() => {
          sink.append("B");
        }),
      );
    });
    const log = await collectChunks(stream);
    expect(log.chunks.join("")).toBe("SHELLAB");
    // Order between A and B is not guaranteed (both resolve in same
    // microtask round), but each must arrive in its own chunk after the
    // shell.
    expect(log.chunks.length).toBe(3);
    expect(log.chunks[0]).toBe("SHELL");
    expect(new Set(log.chunks.slice(1))).toEqual(new Set(["A", "B"]));
  });

  test("very large appends are not truncated by the flush threshold", async () => {
    // The internal buffer auto-flushes when it crosses a size threshold,
    // but a single oversized append must still arrive intact.
    const big = "x".repeat(64 * 1024); // 64 KiB ASCII
    const stream = renderToReadableStream((sink) => {
      sink.append("<pre>");
      sink.append(big);
      sink.append("</pre>");
    });
    const log = await collectChunks(stream);
    expect(log.chunks.join("")).toBe(`<pre>${big}</pre>`);
    expect(log.bytes).toBe(big.length + "<pre></pre>".length);
  });

  test("throw inside the render callback propagates as a stream error", async () => {
    const stream = renderToReadableStream(() => {
      throw new Error("boom");
    });
    const reader = stream.getReader();
    await expect(reader.read()).rejects.toThrow(/boom/);
  });

  test("throw inside a deferred task propagates as a stream error", async () => {
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      sink.defer!(Promise.resolve().then(() => {
        throw new Error("deferred boom");
      }));
    });
    const log: string[] = [];
    const reader = stream.getReader();
    // The shell may arrive before the error surfaces — that is OK,
    // it is already on the wire. The error must arrive after.
    for (;;) {
      try {
        const r = await reader.read();
        if (r.done) {
          // If we got "done" cleanly the error was swallowed — fail.
          throw new Error("stream completed without surfacing deferred error");
        }
        log.push(new TextDecoder().decode(r.value));
      } catch (error) {
        expect((error as Error).message).toMatch(/deferred boom/);
        expect(log.join("")).toBe("SHELL");
        return;
      }
    }
  });
});
