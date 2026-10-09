import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";
import { materializeClientDeliveryFixture } from "../../../size/fixtures.js";
import { signedCounterFixtures } from "../../../size/signed-counter-fixtures.js";

test("a signed native counter preserves its server DOM and responds through direct binding", async ({
  page,
}) => {
  const root = await mkdtemp(join(tmpdir(), "mreact-signed-counter-"));
  let close: (() => Promise<void>) | undefined;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const project = await materializeClientDeliveryFixture(signedCounterFixtures[0]!, root);
    await buildApp(project);
    const server = await startServer({ outDir: project.outDir, port: 0 });
    close = () => server.close();
    await page.route("**/_mreact/client/**", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(server.url, { waitUntil: "commit" });
    const button = page.locator("[data-action]");
    await expect(button).toHaveText("-1");
    await button.evaluate((node) => {
      (window as any).__signedButton = node;
      (node as HTMLButtonElement).focus();
    });
    release();
    await page.waitForFunction(() => document.documentElement.dataset.mreactHydrated === "true");
    await expect(button).toBeFocused();
    await button.click();
    await expect(button).toHaveText("0");
    await button.click();
    await expect(button).toHaveText("1");
    expect(await button.evaluate((node) => node === (window as any).__signedButton)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await close?.();
    await rm(root, { recursive: true, force: true });
  }
});
