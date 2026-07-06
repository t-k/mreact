import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterPath = join(process.cwd(), "benchmarks/router/adapters/production-app-adapter.ts");

describe("production app adapter server RSS probes", () => {
  it("exposes command server child pid and measures RSS from that child", async () => {
    const source = await readFile(adapterPath, "utf8");

    expect(source).toContain("pid?: number");
    expect(source).toContain("pid: child.pid");
    expect(source).toContain("measureConcurrentRequestsWithServerRss");
    expect(source).toContain("measureServerChildRss");
    expect(source).toContain("server?.pid");
  });
});
