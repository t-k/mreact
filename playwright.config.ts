import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "packages/app-router/e2e",
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
