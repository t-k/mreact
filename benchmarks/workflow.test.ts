import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("benchmark GitHub workflow", () => {
  test("can be manually dispatched and uploads current-run results", async () => {
    const workflow = await readFile(
      join(process.cwd(), ".github", "workflows", "benchmarks.yml"),
      "utf8",
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("pnpm bench:primitive");
    expect(workflow).toContain("pnpm bench:router");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("benchmarks/results");
  });
});
