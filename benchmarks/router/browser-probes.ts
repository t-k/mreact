import { chromium, type Page } from "@playwright/test";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function measureInitialPageLoadBeforeInteraction(url: string): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    const start = performance.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
    await page
      .getByRole("button", { name: "count: 0" })
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });
    return performance.now() - start;
  } finally {
    await browser.close();
  }
}

export async function measureFirstInteractionFromDomContentLoaded(url: string): Promise<number> {
  return measureClickToUpdate(url, { waitForNetworkIdle: false, targetCount: 1 });
}

export async function measureFirstInteractionAfterNetworkIdle(url: string): Promise<number> {
  return measureClickToUpdate(url, { waitForNetworkIdle: true, targetCount: 1 });
}

export async function measureSecondInteractionLatency(url: string): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    await prepareInteractivePage(page, url, {
      diagnostics,
      waitForNetworkIdle: true,
    });

    await page.getByRole("button", { name: "count: 0" }).click();
    await page
      .getByRole("button", { name: "count: 1" })
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });

    const start = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "count: 1" }).click();
    await page
      .getByRole("button", { name: "count: 2" })
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });
    const end = await page.evaluate(() => performance.now());
    return end - start;
  } finally {
    await browser.close();
  }
}

async function measureClickToUpdate(
  url: string,
  options: { targetCount: 1; waitForNetworkIdle: boolean },
): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    await prepareInteractivePage(page, url, {
      diagnostics,
      waitForNetworkIdle: options.waitForNetworkIdle,
    });

    const start = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "count: 0" }).click();
    await page
      .getByRole("button", { name: `count: ${options.targetCount}` })
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });
    const end = await page.evaluate(() => performance.now());
    return end - start;
  } finally {
    await browser.close();
  }
}

async function prepareInteractivePage(
  page: Page,
  url: string,
  options: { diagnostics: readonly string[]; waitForNetworkIdle: boolean },
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  if (options.waitForNetworkIdle) {
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
  }

  await page
    .getByRole("button", { name: "count: 0" })
    .waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    })
    .catch((error: unknown) => {
      throw appendDiagnostics(error, options.diagnostics);
    });
}

export async function measureClientNavigation(url: string): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});

    await page.getByRole("button", { name: "count: 0" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.getByRole("button", { name: "count: 0" }).click();
    await page
      .getByRole("button", { name: "count: 1" })
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });

    const documentToken = String(Math.random());
    await page.evaluate((token) => {
      (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken = token;
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

function collectDiagnostics(page: Page): string[] {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      diagnostics.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });
  return diagnostics;
}

function appendDiagnostics(error: unknown, diagnostics: readonly string[]): Error {
  if (diagnostics.length === 0) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message}\nBrowser diagnostics:\n${diagnostics.join("\n")}`);
}
