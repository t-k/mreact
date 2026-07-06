import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterPath = join(process.cwd(), "benchmarks/router/adapters/tanstack-start-solid.ts");

describe("tanstack-start-solid benchmark fixture", () => {
  it("keeps bundle byte phase probes independent from hydration click timing", async () => {
    const source = await readFile(adapterPath, "utf8");
    const beforeBytesSource = source.slice(
      source.indexOf("async measureInteractiveClientBundleBeforeInteractionBytes()"),
      source.indexOf("async measureInteractiveClientBundleAfterIdleBytes()"),
    );
    const afterBytesSource = source.slice(
      source.indexOf("async measureInteractiveClientBundleAfterIdleBytes()"),
      source.indexOf("async measureInteractiveClientBundleBytes()"),
    );

    expect(beforeBytesSource).toContain("measureRouteJavaScriptGzipBytePhases(url)");
    expect(afterBytesSource).toContain("measureRouteJavaScriptGzipBytePhases(url)");
    expect(beforeBytesSource).not.toContain("assertInteractive");
    expect(afterBytesSource).not.toContain("assertInteractive");
  });
});
