import { chromium } from "@playwright/test";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function measureHydrationFirstInteraction(url: string): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});

    await page.getByRole("button", { name: "count: 0" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });

    const start = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "count: 0" }).click();
    await page.getByRole("button", { name: "count: 1" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const end = await page.evaluate(() => performance.now());
    return end - start;
  } finally {
    await browser.close();
  }
}

export async function measureClientNavigation(url: string): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});

    await page.getByRole("button", { name: "count: 0" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.getByRole("button", { name: "count: 0" }).click();
    await page.getByRole("button", { name: "count: 1" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });

    const documentToken = String(Math.random());
    await page.evaluate((token) => {
      (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken =
        token;
    }, documentToken);
    const start = await page.evaluate(() => performance.now());
    await page.getByRole("link", { name: "Details" }).click();
    await page.getByRole("heading", { name: "Navigation target" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const end = await page.evaluate(() => performance.now());
    const retainedToken = await page.evaluate(
      () => (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken,
    );
    if (retainedToken !== documentToken) {
      throw new Error("route-to-route navigation caused a full document reload");
    }
    return end - start;
  } finally {
    await browser.close();
  }
}
