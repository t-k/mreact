import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const readWorkflow = (name: string) =>
  readFile(join(process.cwd(), ".github", "workflows", name), "utf8");

describe("GitHub workflows", () => {
  test("builds before parallel CI verify steps that consume workspace dist", async () => {
    const workflow = await readWorkflow("ci.yml");
    const buildIndex = workflow.indexOf("      - name: Build\n        run: pnpm build");
    const firstParallelIndex = workflow.indexOf("      - parallel:");

    expect(buildIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeLessThan(firstParallelIndex);
    expect(workflow).toContain("- parallel:\n          - name: Lint");
    expect(workflow).not.toContain("Cache TypeScript build info");
    expect(workflow).not.toContain("tsbuildinfo");
    expect(workflow).not.toContain("          - name: Build\n            run: pnpm build");
    expect(workflow).toContain("          - name: Install Playwright Chromium");
    expect(workflow).toContain("          - name: Format\n            run: pnpm format");
    expect(workflow).toContain("- parallel:\n          - name: Test router client build");
    expect(workflow).toContain(
      "          - name: Typecheck package tests\n            run: node scripts/typecheck-package-tests.mjs",
    );
    expect(workflow).not.toContain("\n      - name: Test\n        run: pnpm exec vitest run");
    expect(workflow).toContain("  test-shard:\n    name: Test shard ${{ matrix.shard }}/3");
    expect(workflow).toContain("shard: [1, 2, 3]");
    expect(workflow).toContain("--shard=${{ matrix.shard }}/3");
    expect(workflow).toContain(
      "      - name: Build\n        run: pnpm build\n\n      - name: Install Playwright Chromium\n        run: pnpm exec playwright install --with-deps chromium\n\n      - name: Test shard",
    );
    expect(workflow).toContain(
      "          - name: E2E smoke\n            run: pnpm exec playwright test packages/router/e2e/navigation.spec.ts",
    );
    expect(workflow).toContain(
      "          - name: API reports\n            run: node scripts/generate-api-reports.mjs --check",
    );
    expect(workflow).toContain(
      "          - name: API reference\n            run: pnpm docs:api:check",
    );
    expect(workflow).toContain("          - name: Test router build");
  });

  test("runs independent publish verify and artifact download steps in parallel groups", async () => {
    const workflow = await readWorkflow("publish.yml");

    expect(workflow).toContain("- parallel:\n          - name: Lint");
    expect(workflow).toContain("          - name: Build\n            run: pnpm build");
    expect(workflow).toContain("          - name: Format\n            run: pnpm format");
    expect(workflow).toContain("- parallel:\n          - name: Test router client build");
    expect(workflow).not.toContain("\n      - name: Test\n        run: pnpm exec vitest run");
    expect(workflow).toContain("  test-shard:\n    name: Test shard ${{ matrix.shard }}/3");
    expect(workflow).toContain("shard: [1, 2, 3]");
    expect(workflow).toContain("--shard=${{ matrix.shard }}/3");
    expect(workflow).toContain(
      "      - name: Build\n        run: pnpm build\n\n      - name: Install Playwright Chromium\n        run: pnpm exec playwright install --with-deps chromium\n\n      - name: Test shard",
    );
    expect(workflow).toContain("      - test-shard");
    expect(workflow).toContain(
      "          - name: API reports\n            run: node scripts/generate-api-reports.mjs --check",
    );
    expect(workflow).toContain(
      "          - name: API reference\n            run: pnpm docs:api:check",
    );
    expect(workflow).toContain("- parallel:\n          - name: Download Linux native artifact");
    expect(workflow).toContain("          - name: Download macOS native artifact");
    expect(workflow).toContain("          - name: Download Windows native artifact");
  });

  test("runs Pages configuration while installing docs dependencies", async () => {
    const workflow = await readWorkflow("docs-pages.yml");

    expect(workflow).toContain("- parallel:\n          - id: pages");
    expect(workflow).toContain("          - run: pnpm install --frozen-lockfile");
    expect(workflow).toContain("MREACT_DOCS_BASE_PATH: ${{ steps.pages.outputs.base_path }}");
  });

  test("runs cargo-deny with root-relative policy paths and global options before check", async () => {
    const workflow = await readWorkflow("ci.yml");

    expect(workflow).toContain(
      "cargo deny --manifest-path packages/router-native/Cargo.toml --config packages/router-native/deny.toml check bans licenses sources",
    );
    expect(workflow).toContain(
      "cargo deny --manifest-path packages/router-native/fuzz/Cargo.toml --config packages/router-native/deny.toml check bans licenses sources",
    );
    expect(workflow).not.toContain("check --config deny.toml");
    expect(workflow).not.toContain("check --config ../deny.toml");
  });
});
