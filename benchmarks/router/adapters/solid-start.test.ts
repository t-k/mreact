import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterPath = join(process.cwd(), "benchmarks/router/adapters/solid-start.ts");

describe("solid-start benchmark fixture", () => {
  it("uses the same relaxed last-node validation for concurrent RSS as concurrent latency", async () => {
    const source = await readFile(adapterPath, "utf8");
    const rssSource = source.slice(
      source.indexOf("async measureConcurrentRequestRssDeltaBytes()"),
      source.indexOf("async measureClientNavigationMs()"),
    );

    expect(rssSource).toContain("html.includes(`>999<`)");
    expect(rssSource).not.toContain("html.includes(`<span>999</span>`)");
  });
});
