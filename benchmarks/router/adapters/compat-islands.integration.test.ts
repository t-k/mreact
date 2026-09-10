import { chromium } from "@playwright/test";
import { expect, test } from "vitest";
import { createHydrationFixture, mreactAppRouterReactCompatAdapter } from "./mreact-app-router.js";

test.skipIf(process.env.MREACT_COMPAT_ISLANDS_INTEGRATION !== "1")(
  "production compat benchmark islands retain all 100 SSR buttons through hydration",
  async () => {
    const browser = await chromium.launch();
    try {
      const url = await createHydrationFixture(false, true, 100);
      const ssr = await browser.newContext({ javaScriptEnabled: false });
      try {
        const page = await ssr.newPage();
        await page.goto(url);
        expect(await page.getByRole("button").allTextContents()).toEqual(
          Array.from({ length: 100 }, (_, index) => `island ${index}: 0`),
        );
      } finally {
        await ssr.close();
      }
      const page = await browser.newPage();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/*", async (route) => {
        if (route.request().resourceType() === "script") await gate;
        await route.continue();
      });
      try {
        await page.goto(url, { waitUntil: "commit" });
        await page.getByRole("button", { name: "island 99: 0", exact: true }).waitFor();
        const nodes = await page.getByRole("button").elementHandles();
        expect(nodes).toHaveLength(100);
        release();
        await page.waitForLoadState("networkidle");
        for (let index = 0; index < 100; index++) {
          await page.getByRole("button", { name: `island ${index}: 0`, exact: true }).click();
          expect(
            await nodes[index]!.evaluate((node) => ({
              connected: node.isConnected,
              text: node.textContent,
            })),
          ).toEqual({ connected: true, text: `island ${index}: 1` });
        }
      } finally {
        release();
      }
    } finally {
      try {
        await browser.close();
      } finally {
        await mreactAppRouterReactCompatAdapter.teardown?.();
      }
    }
  },
  60_000,
);
