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
  options: {
    expectStateRestore?: boolean;
    counterPrefix?: string;
    expectedCountAfterBack?: 0 | 1;
  } = {},
): Promise<number> {
  const expectStateRestore = options.expectStateRestore ?? true;
  const counterPrefix = options.counterPrefix ?? "count: ";
  const escapedCounterPrefix = counterPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
    await page.getByRole("button", { name: `${counterPrefix}0` }).click();
    await page.getByRole("button", { name: `${counterPrefix}1` }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const documentToken = String(Math.random());
    await page.evaluate((token) => {
      (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken = token;
    }, documentToken);
    const assertSameDocument = async (): Promise<void> => {
      const retainedToken = await page.evaluate(
        () => (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken,
      );
      if (retainedToken !== documentToken) {
        throw new Error("back-forward navigation caused a full document reload");
      }
    };
    await page.getByRole("link", { name: "Details" }).click();
    await page.getByRole("heading", { name: "Navigation target" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await assertSameDocument();

    const start = await page.evaluate(() => performance.now());
    await page.goBack({ waitUntil: "domcontentloaded" });
    await assertSameDocument();
    const restoredButton =
      options.expectedCountAfterBack !== undefined
        ? page.getByRole("button", {
            name: `${counterPrefix}${options.expectedCountAfterBack}`,
            exact: true,
          })
        : expectStateRestore
          ? page.getByRole("button", { name: `${counterPrefix}1` })
          : page.getByRole("button", { name: new RegExp(`^${escapedCounterPrefix}[01]$`) });
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
    await assertSameDocument();
    const end = await page.evaluate(() => performance.now());
    return end - start;
  } finally {
    await browser.close();
  }
}

export async function measureBackForwardDomRestore(
  url: string,
  options: { counterPrefix?: string } = {},
): Promise<number> {
  const counterPrefix = options.counterPrefix ?? "count: ";
  const escapedCounterPrefix = counterPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics = collectDiagnostics(page);
    const installDomTiming = (prefix: string) => {
      const results: number[] = [];
      let phase = 0;
      let start: number | undefined;
      const isVisible = (element: Element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden" &&
        element.closest('[aria-hidden="true"], [inert]') === null;
      const matches = () => {
        if (phase === 1) {
          return Array.from(document.querySelectorAll("button")).some((button) =>
            isVisible(button) && (
              button.textContent?.trim() === `${prefix}0` || button.textContent?.trim() === `${prefix}1`
            ),
          );
        }
        if (phase === 2) {
          return Array.from(document.querySelectorAll("h1")).some(
            (heading) => isVisible(heading) && heading.textContent === "Navigation target",
          );
        }
        return false;
      };
      const recordIfReady = () => {
        if (start === undefined || !matches()) return;
        results.push(performance.now() - start);
        start = undefined;
      };
      const observer = new MutationObserver(recordIfReady);
      observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
      addEventListener("popstate", () => {
        phase += 1;
        start = performance.now();
        recordIfReady();
      }, { capture: true });
      (globalThis as { __mreactBackForwardDomTimings?: number[] }).__mreactBackForwardDomTimings = results;
    };
    await page.addInitScript({
      content: `((__name) => (${installDomTiming.toString()})(${JSON.stringify(counterPrefix)}))((target) => target)`,
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
    await page.getByRole("button", { name: `${counterPrefix}0` }).click();
    await page.getByRole("button", { name: `${counterPrefix}1` }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const documentToken = String(Math.random());
    await page.evaluate((token) => {
      (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken = token;
    }, documentToken);
    await page.getByRole("link", { name: "Details" }).click();
    await page.getByRole("heading", { name: "Navigation target" }).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const assertSameDocument = async () => {
      const retainedToken = await page.evaluate(
        () => (globalThis as { __mreactBenchDocumentToken?: string }).__mreactBenchDocumentToken,
      );
      if (retainedToken !== documentToken) {
        throw new Error("back-forward navigation caused a full document reload");
      }
    };
    await page.goBack({ waitUntil: "domcontentloaded" });
    await assertSameDocument();
    await page.getByRole("button", { name: new RegExp(`^${escapedCounterPrefix}[01]$`) })
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS })
      .catch((error: unknown) => { throw appendDiagnostics(error, diagnostics); });
    await page.goForward({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Navigation target" })
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS })
      .catch((error: unknown) => { throw appendDiagnostics(error, diagnostics); });
    await assertSameDocument();
    const timings = await page.evaluate(
      () => (globalThis as { __mreactBackForwardDomTimings?: number[] }).__mreactBackForwardDomTimings,
    );
    if (timings?.length !== 2) {
      throw new Error(`back-forward DOM timing was not captured for both traversals: ${JSON.stringify(timings)}`);
    }
    return timings[0]! + timings[1]!;
  } finally {
    await browser.close();
  }
}

export async function measureHydrationIslands(
  url: string,
  islandCount: number,
  options: { timeoutMs?: number } = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(islandCount) || islandCount < 1 || islandCount > 1000)
    throw new Error("Invalid island count");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
    throw new Error("Invalid island timeout");
  const browser = await chromium.launch({ headless: true, timeout: 10_000 });
  const deadline = setTimeout(() => {
    void browser.close().catch(() => {});
  }, 60_000);
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    const start = performance.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const expected = Array.from({ length: islandCount }, (_, i) => `island ${i}: 0`);
    const verify = async () => {
      const actual = (await page.locator("button").allTextContents())
        .map((text) => text.trim())
        .filter((text) => text.startsWith("island "));
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(
          `Island state mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
    };
    await verify();
    for (let index = 0; index < islandCount; index++) {
      await page.getByRole("button", { name: `island ${index}: 0`, exact: true }).click();
      await page.getByRole("button", { name: `island ${index}: 1`, exact: true }).waitFor();
      expected[index] = `island ${index}: 1`;
      await verify();
    }
    return performance.now() - start;
  } finally {
    clearTimeout(deadline);
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
