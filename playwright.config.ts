import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testIgnore: [".worktrees/**", "node_modules/**", "test-results/**"],
  testMatch: ["packages/router/e2e/**/*.spec.ts", "examples/e2e/**/*.spec.ts"],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
