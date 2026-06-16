import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("benchmark GitHub workflow", () => {
  test("can be manually dispatched and commits current-run results", async () => {
    const workflow = await readFile(
      join(process.cwd(), ".github", "workflows", "benchmarks.yml"),
      "utf8",
    );

    expect(workflow).toContain("actions: write");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("pnpm bench:primitive");
    expect(workflow).toContain("pnpm bench:js-framework");
    expect(workflow).toContain("pnpm bench:router");
    expect(workflow).toContain("NODE_OPTIONS: --max-old-space-size=6144");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("benchmarks/results");
    expect(workflow).toContain("MREACT_BENCHMARK_RESULTS_DIR");
    expect(workflow).toContain("js_frameworks:");
    expect(workflow).toContain("js_benchmarks:");
    expect(workflow).toContain("MREACT_JS_FRAMEWORKS: ${{ inputs.js_frameworks }}");
    expect(workflow).toContain("MREACT_JS_FRAMEWORK_BENCHMARKS: ${{ inputs.js_benchmarks }}");
    expect(workflow).toContain("BENCH_CASES:");
    expect(workflow).toContain(
      "source write with subscriber 1k,text binding update 1k,computed fan-out 1k,computed fan-in 1k,source write 1k,keyed reverse 1k rows,create 1k event targets,repeated create update clear memory",
    );
    expect(workflow).toContain(
      "Run primitive browser benchmarks\n        if: ${{ inputs.suite == 'primitive-browser' }}",
    );
    expect(workflow).toContain('files+=("${{ steps.results.outputs.dir }}/primitive.md")');
    expect(workflow).toContain(
      'if [ "${{ inputs.suite }}" = "primitive-browser" ]; then\n            files+=("${{ steps.results.outputs.dir }}/primitive-browser.md")',
    );
    expect(workflow).toContain('files+=("${{ steps.results.outputs.dir }}/js-framework-benchmark.md")');
    expect(workflow).toContain('files+=("${{ steps.results.outputs.dir }}/router.md")');
    expect(workflow).toContain("Commit benchmark results");
    expect(workflow).toContain("Upload benchmark results");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).toContain("benchmark-results-${{ steps.results.outputs.date }}-${{ steps.results.outputs.run }}");
    expect(workflow).toContain("path: ${{ steps.results.outputs.dir }}");
    expect(workflow).toContain("if: ${{ github.ref_type == 'branch' && github.ref_name == 'main' }}");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("git add -f benchmarks/results");
    expect(workflow).toContain('git commit -m "Update benchmark results');
    expect(workflow).toContain('git push origin "HEAD:$GITHUB_REF_NAME"');
    expect(workflow).toContain('gh workflow run docs-pages.yml --ref "$GITHUB_REF_NAME"');
    expect(workflow).not.toContain("request-fastpaths");
  });
});
