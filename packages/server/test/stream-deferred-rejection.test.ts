import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createStringSink, renderToReadableStream } from "../src/index.js";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return text;
    }
    text += new TextDecoder().decode(value);
  }
}

function collectUnhandledRejections(): { rejections: unknown[]; stop: () => void } {
  const rejections: unknown[] = [];
  const listener = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", listener);
  return {
    rejections,
    stop: () => {
      process.off("unhandledRejection", listener);
    },
  };
}

describe("deferred task rejection during async render", () => {
  test("deferred failure before async render completes errors the stream without an unhandled rejection", async () => {
    const collector = collectUnhandledRejections();
    try {
      let signalAbortedAtFailure: boolean | undefined;
      let renderFinished = false;
      const stream = renderToReadableStream(async (sink) => {
        sink.append("shell");
        sink.defer(
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              signalAbortedAtFailure = sink.signal?.aborted;
              reject(new Error("deferred failure"));
            }, 5);
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        renderFinished = true;
      });

      await expect(readAll(stream)).rejects.toThrow("deferred failure");
      // The failure must reach the reader as soon as the deferred task
      // fails, not only after the async render settles.
      expect(renderFinished).toBe(false);
      // Let any stray rejection surface before asserting.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(signalAbortedAtFailure).toBe(false);
      expect(collector.rejections).toEqual([]);
    } finally {
      collector.stop();
    }
  });

  test("createStringSink does not leak deferred rejections before drain is awaited", async () => {
    const collector = collectUnhandledRejections();
    try {
      const sink = createStringSink();
      sink.defer(Promise.reject(new Error("string sink deferred failure")));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(collector.rejections).toEqual([]);
      await expect(sink.drain()).rejects.toThrow("string sink deferred failure");
    } finally {
      collector.stop();
    }
  });

  test("a strict Node child process survives a deferred failure during async render", () => {
    const dir = mkdtempSync(join(tmpdir(), "mreact-stream-strict-"));
    const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
    const script = join(dir, "main.mjs");
    writeFileSync(
      script,
      `
import { renderToReadableStream } from ${JSON.stringify(entry)};
const stream = renderToReadableStream(async (sink) => {
  sink.append("shell");
  sink.defer(new Promise((_, reject) => setTimeout(() => reject(new Error("deferred failure")), 5)));
  await new Promise((resolve) => setTimeout(resolve, 30));
});
const reader = stream.getReader();
try {
  while (!(await reader.read()).done) {}
  console.log("completed");
} catch (error) {
  console.log("stream error: " + error.message);
}
`,
    );
    const result = spawnSync(process.execPath, ["--unhandled-rejections=strict", script], {
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("stream error: deferred failure");
  });
});
