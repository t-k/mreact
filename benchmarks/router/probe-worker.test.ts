import { describe, expect, it } from "vitest";
import { startProbeWorker } from "./probe-worker.js";

describe("owned probe worker cleanup", () => {
  it("does not report nonzero shutdown as success", async () => {
    const worker = startProbeWorker(
      new URL("./fixtures/probe-lifecycle-worker.ts", import.meta.url),
      { exitCode: 7 },
    );
    await worker.receive();
    await expect(worker.close()).rejects.toThrow(/exited/);
    expect(() => process.kill(worker.pid, 0)).toThrow();
  });
  it("accepts normal shutdown and waits for actual exit", async () => {
    const worker = startProbeWorker(
      new URL("./fixtures/probe-lifecycle-worker.ts", import.meta.url),
      { exitCode: 0 },
    );
    await worker.receive();
    await worker.close();
    expect(() => process.kill(worker.pid, 0)).toThrow();
  });
});
