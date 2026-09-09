import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createStringSink, renderToReadableStream } from "../src/index.js";

test("string sink assimilates a successful thenable only once across drains", async () => {
  const sink = createStringSink();
  let executions = 0;
  sink.defer({
    then(onFulfilled, onRejected) {
      return Promise.resolve().then(() => {
        executions++;
        sink.append("<b>result</b>");
      }).then(onFulfilled, onRejected);
    },
  });
  await sink.drain();
  await sink.drain();
  expect(executions).toBe(1);
  expect(sink.toString()).toBe("<b>result</b>");
});

test("string sink preserves the first thenable rejection before drain", async () => {
  const sink = createStringSink();
  const failure = new Error("first execution failed");
  let executions = 0;
  sink.defer({
    then(onFulfilled, onRejected) {
      return Promise.resolve().then(() => {
        if (++executions === 1) throw failure;
      }).then(onFulfilled, onRejected);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await expect(sink.drain()).rejects.toBe(failure);
  await expect(sink.drain()).rejects.toBe(failure);
  expect(executions).toBe(1);
});

test("shell overflow observes a later render rejection and preserves the abort reason", async () => {
  let signal: AbortSignal | undefined;
  const stream = renderToReadableStream(async (sink) => {
    signal = sink.signal;
    sink.append("overflow");
    await new Promise((resolve) => setTimeout(resolve, 5));
    throw new Error("late render rejection");
  }, { maxQueuedBytes: 1 });
  const reader = stream.getReader();
  try {
    await expect(reader.read()).rejects.toBe(signal?.reason);
    expect(signal?.reason).toBeInstanceOf(RangeError);
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    reader.releaseLock();
  }
});

for (const mode of ["throw", "strict"] as const) {
  for (const limit of ["explicit", "default"] as const) {
    test.each([false, true])(`Node ${mode} survives ${limit} shell overflow with render rejection=%s`, (rejectRender) => {
      const entry = pathToFileURL(fileURLToPath(new URL("../dist/index.js", import.meta.url))).href;
      const script = `
import assert from "node:assert/strict";
import { renderToReadableStream } from ${JSON.stringify(entry)};
let signal;
let finished = false;
const stream = renderToReadableStream(async (sink) => {
  signal = sink.signal;
  sink.append("x".repeat(${limit === "explicit" ? 8 : 16 * 1024 * 1024 + 1}));
  await new Promise(resolve => setTimeout(resolve, 5));
  finished = true;
  if (${rejectRender}) throw new Error("late render rejection");
}, ${limit === "explicit" ? "{ maxQueuedBytes: 1 }" : "{}"});
const reader = stream.getReader();
try {
  await assert.rejects(reader.read(), error => {
    assert(error instanceof RangeError);
    assert.match(error.message, /maximum queued byte limit/);
    assert.equal(error, signal.reason);
    return true;
  });
} finally {
  reader.releaseLock();
}
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(finished, true);
console.log("handled overflow");
`;
      const result = spawnSync(process.execPath, [`--unhandled-rejections=${mode}`, "--input-type=module", "--eval", script], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("handled overflow");
    });
  }
}
