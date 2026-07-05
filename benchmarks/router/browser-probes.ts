import { chromium, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";

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

export async function measureLoaderClientNavigation(url: string): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
    await page.getByRole("link", { name: "Details" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });

    const documentToken = String(Math.random());
    await page.evaluate((token) => {
      (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken = token;
    }, documentToken);
    const start = await page.evaluate(() => performance.now());
    await page.getByRole("link", { name: "Details" }).click();
    await page
      .getByText("loader:loaded-target")
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });
    const end = await page.evaluate(() => performance.now());
    const retainedToken = await page.evaluate(
      () => (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken,
    );
    if (retainedToken !== documentToken) {
      throw new Error("loader client navigation caused a full document reload");
    }
    return end - start;
  } finally {
    await browser.close();
  }
}

export async function measureBackForwardRestore(
  url: string,
  options: { expectStateRestore?: boolean } = {},
): Promise<number> {
  const expectStateRestore = options.expectStateRestore ?? true;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
    await page.getByRole("button", { name: "count: 0" }).click();
    await page.getByRole("button", { name: "count: 1" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.getByRole("link", { name: "Details" }).click();
    await page.getByRole("heading", { name: "Navigation target" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });

    const start = await page.evaluate(() => performance.now());
    await page.goBack({ waitUntil: "domcontentloaded" });
    const restoredButton = expectStateRestore
      ? page.getByRole("button", { name: "count: 1" })
      : page.getByRole("button", { name: /^count: [01]$/ });
    await restoredButton
      .waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      })
      .catch((error: unknown) => {
        throw appendDiagnostics(error, diagnostics);
      });
    await page.goForward({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Navigation target" })
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

export async function measureHydrationIslands(url: string, islandCount: number): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    const start = performance.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});

    for (let index = 0; index < islandCount; index += 1) {
      await page
        .getByRole("button", { name: `island ${index}: 0` })
        .waitFor({
          state: "visible",
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .catch((error: unknown) => {
          throw appendDiagnostics(error, diagnostics);
        });
    }

    await page.getByRole("button", { name: `island ${islandCount - 1}: 0` }).click();
    await page
      .getByRole("button", { name: `island ${islandCount - 1}: 1` })
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

export async function measureRouteJavaScriptGzipBytes(
  url: string,
  options: { assertInteractive?: boolean } = {},
): Promise<number> {
  return (await measureRouteJavaScriptGzipBytePhases(url, options)).afterIdleBytes;
}

export interface RouteJavaScriptGzipBytePhases {
  afterIdleBytes: number;
  beforeInteractionBytes: number;
}

export async function measureRouteJavaScriptGzipBytePhases(
  url: string,
  options: { assertInteractive?: boolean } = {},
): Promise<RouteJavaScriptGzipBytePhases> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    const jsResponses: Array<{ bytes: number; completed: boolean; promise: Promise<number> }> = [];

    page.on("response", (response) => {
      const request = response.request();

      if (
        request.resourceType() !== "script" &&
        !new URL(response.url()).pathname.endsWith(".js")
      ) {
        return;
      }

      const record = {
        bytes: 0,
        completed: false,
        promise: response
          .body()
          .then((body) => gzipSync(body).length)
          .catch(() => 0),
      };
      record.promise = record.promise.then((bytes) => {
        record.bytes = bytes;
        record.completed = true;
        return bytes;
      });
      jsResponses.push(record);
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });

    let beforeInteractionBytes: number | undefined;
    if (options.assertInteractive === true) {
      await page
        .getByRole("button", { name: /count: 0/ })
        .waitFor({
          state: "visible",
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .catch((error: unknown) => {
          throw appendDiagnostics(error, diagnostics);
        });
      await Promise.resolve();
      beforeInteractionBytes = sumCompletedScriptBytes(jsResponses);
      await page.getByRole("button", { name: /count: 0/ }).click();
      await page
        .getByRole("button", { name: /count: 1/ })
        .waitFor({
          state: "visible",
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .catch((error: unknown) => {
          throw appendDiagnostics(error, diagnostics);
        });
    }

    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});

    const bytes = await Promise.all(jsResponses.map((record) => record.promise));
    const afterIdleBytes = bytes.reduce((sum, value) => sum + value, 0);
    return {
      afterIdleBytes,
      beforeInteractionBytes: beforeInteractionBytes ?? afterIdleBytes,
    };
  } finally {
    await browser.close();
  }
}

function sumCompletedScriptBytes(
  records: ReadonlyArray<{ bytes: number; completed: boolean }>,
): number {
  return records.reduce((sum, record) => sum + (record.completed ? record.bytes : 0), 0);
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
