import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("benchmark GitHub workflow", () => {
  test("can be manually dispatched and commits current-run results", async () => {
    const workflow = await readFile(
      join(process.cwd(), ".github", "workflows", "benchmarks.yml"),
      "utf8",
    );

    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("pnpm bench:primitive");
    expect(workflow).toContain("pnpm bench:router");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("benchmarks/results");
    expect(workflow).toContain("Commit benchmark results");
    expect(workflow).toContain("git add benchmarks/results");
    expect(workflow).toContain('git commit -m "Update benchmark results');
    expect(workflow).toContain('git push origin "HEAD:$GITHUB_REF_NAME"');
    expect(workflow).not.toContain("actions/upload-artifact");
  });
});
