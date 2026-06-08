import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createMreactApp } from "../dist/index.js";
import { startDevServer } from "../../router/dist/dev-server.js";

test("generated basic app hydrates the counter in dev", async ({ page }) => {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-create-app-e2e-"));
  const projectRoot = join(rootDir, "counter-app");
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));

  await createMreactApp({
    directory: projectRoot,
    name: "counter-app",
    packageManager: "pnpm",
    template: "basic",
  });

  const server = await startDevServer({
    allowedSourceDirs: ["app"],
    projectRoot,
    publicDir: "public",
    routesDir: "app",
    port: 0,
  });

  try {
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "mreact counter" })).toBeVisible();
    await expect(page.locator("main")).toContainText("Count: 0");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.mreactHydrated))
      .toBe("true");

    await page.getByRole("button", { name: "+1" }).click();

    await expect(page.locator("main")).toContainText("Count: 1");
    expect(pageErrors).toEqual([]);
  } finally {
    await server.close();
    await rm(rootDir, { force: true, recursive: true });
  }
});
