import { defineConfig, devices } from "@playwright/test";

export function playwrightTestIgnoreForCwd(cwd = process.cwd()): string[] {
  const ignores = ["node_modules/**", "test-results/**"];
  const segments = cwd.split(/[\\/]+/);
  const inProjectWorktree = segments.includes(".worktrees");
  const inClaudeWorktree = segments.some(
    (segment, index) => segment === ".claude" && segments[index + 1] === "worktrees",
  );

  return inProjectWorktree || inClaudeWorktree
    ? ignores
    : [".worktrees/**", ".claude/worktrees/**", ...ignores];
}

export default defineConfig({
  testDir: ".",
  testIgnore: playwrightTestIgnoreForCwd(),
  testMatch: [
    "packages/create-mreact-app/e2e/**/*.spec.ts",
    "packages/router/e2e/**/*.spec.ts",
    "examples/e2e/**/*.spec.ts",
  ],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
