import { defineConfig, devices } from "@playwright/test";

export function playwrightTestIgnoreForCwd(cwd = process.cwd()): string[] {
  const ignores = ["node_modules/**", "test-results/**"];

  return cwd.split(/[\\/]+/).includes(".worktrees")
    ? ignores
    : [".worktrees/**", ".claude/worktrees/**", ...ignores];
}

export default defineConfig({
  testDir: ".",
  testIgnore: playwrightTestIgnoreForCwd(),
  testMatch: ["packages/router/e2e/**/*.spec.ts", "examples/e2e/**/*.spec.ts"],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
