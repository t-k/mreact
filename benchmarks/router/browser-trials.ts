import { randomUUID } from "node:crypto";
import { chromium, type Page } from "@playwright/test";

export interface BrowserTarget {
  url: string;
  counterPrefix: string;
}
export type BrowserProfile = "domcontentloaded" | "networkidle";
export interface BrowserInteraction {
  dispatchMs: number;
  domObservedMs: number;
  eventToDomMs: number;
  e2eMs: number;
}
export interface FailedBrowserInteraction {
  dispatchMs?: number;
  domObservedMs?: number;
  actualText: string | null;
  expectedText: string;
}
export interface BrowserTrial {
  methodologyVersion: 2;
  trialId: string;
  target: BrowserTarget;
  profile: BrowserProfile;
  status: "completed" | "failed";
  stage: string;
  timeoutMs: number;
  browserVersion?: string;
  ssrVerified?: boolean;
  initialContentMs?: number;
  domContentLoadedMs?: number;
  navigationToVerifiedMs?: number;
  networkIdleReached?: boolean;
  first?: BrowserInteraction;
  second?: BrowserInteraction;
  failedInteraction?: FailedBrowserInteraction;
  error?: string;
  diagnostics: string[];
}

// These timestamps observe DOM state, not paint, INP or hydration completion.
export async function measureBrowserTrial(
  target: BrowserTarget,
  profile: BrowserProfile,
  options: { timeoutMs?: number } = {},
): Promise<BrowserTrial> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
    throw new Error("Invalid browser probe timeout");
  if (!target.counterPrefix || !["domcontentloaded", "networkidle"].includes(profile))
    throw new Error("Invalid browser target or profile");
  const trial: BrowserTrial = {
    methodologyVersion: 2,
    trialId: randomUUID(),
    target,
    profile,
    timeoutMs,
    status: "failed",
    stage: "browser launch",
    diagnostics: [],
  };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    browser = await chromium.launch({ headless: true, timeout: timeoutMs + 5_000 });
    trial.browserVersion = browser.version();
    deadline = setTimeout(
      () => {
        trial.error = `Browser trial deadline exceeded during ${trial.stage}`;
        void browser?.close().catch(() => {});
      },
      6 * timeoutMs + 5_000,
    );
    trial.stage = "SSR content";
    const ssr = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await ssr.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      await page.goto(target.url, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: `${target.counterPrefix}0`, exact: true }).waitFor();
      trial.ssrVerified = true;
    } finally {
      await ssr.close();
    }
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      page.on("pageerror", (error) => {
        if (trial.diagnostics.length < 10) trial.diagnostics.push(error.message.slice(0, 1000));
      });
      trial.stage = "initial content";
      await page.goto(target.url, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: `${target.counterPrefix}0`, exact: true }).waitFor();
      const initial = await page.evaluate(() => ({
        initialContentMs: performance.now(),
        domContentLoadedMs: (
          performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
        ).domContentLoadedEventEnd,
      }));
      Object.assign(trial, initial);
      if (profile === "networkidle") {
        trial.stage = "network idle";
        trial.networkIdleReached = false;
        await page.waitForLoadState("networkidle", { timeout: timeoutMs });
        trial.networkIdleReached = true;
      }
      trial.stage = "first interaction";
      const failed = (data: FailedBrowserInteraction) => {
        trial.failedInteraction = data;
      };
      trial.first = await observeCounterClick(page, target.counterPrefix, 0, timeoutMs, failed);
      trial.navigationToVerifiedMs = trial.first.domObservedMs;
      trial.stage = "second interaction";
      trial.second = await observeCounterClick(page, target.counterPrefix, 1, timeoutMs, failed);
      if (trial.diagnostics.length) throw new Error("Page errors during browser trial");
      trial.stage = "completed";
      trial.status = "completed";
    } finally {
      await context.close();
    }
  } catch (error) {
    trial.status = "failed";
    trial.error ??= error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(deadline);
    try {
      await browser?.close();
    } catch (error) {
      trial.status = "failed";
      trial.error = `${trial.error ?? ""} cleanup: ${String(error)}`;
    }
  }
  return trial;
}

async function observeCounterClick(
  page: Page,
  prefix: string,
  from: number,
  timeoutMs: number,
  onFailure: (data: FailedBrowserInteraction) => void,
): Promise<BrowserInteraction> {
  const key = `__mreactProbe_${randomUUID().replaceAll("-", "")}`;
  const button = page.getByRole("button", { name: `${prefix}${from}`, exact: true });
  await button.evaluate(
    (element, { key, before, after }) => {
      const parent = element.parentElement;
      if (!parent) throw new Error("Counter has no parent");
      const position = Array.from(parent.children).indexOf(element);
      const state = {
        startMs: performance.now(),
        dispatchMs: undefined as number | undefined,
        domObservedMs: undefined as number | undefined,
        expectedText: after,
        actualText: () => parent.children[position]?.textContent?.trim() ?? null,
        dispose: () => {},
      };
      const capture = (event: Event) => {
        if (
          state.dispatchMs === undefined &&
          event.isTrusted &&
          event.composedPath().includes(element) &&
          element.textContent?.trim() === before
        )
          state.dispatchMs = performance.now();
      };
      const observer = new MutationObserver(() => {
        // A replacement in the same DOM slot is valid; an unrelated matching button is not.
        const current = parent.children[position];
        if (
          state.dispatchMs !== undefined &&
          state.domObservedMs === undefined &&
          parent.isConnected &&
          current?.tagName === "BUTTON" &&
          current.textContent?.trim() === after
        )
          state.domObservedMs = performance.now();
      });
      observer.observe(parent, { subtree: true, childList: true, characterData: true });
      document.addEventListener("click", capture, true);
      state.dispose = () => {
        observer.disconnect();
        document.removeEventListener("click", capture, true);
      };
      (window as unknown as Record<string, unknown>)[key] = state;
    },
    { key, before: `${prefix}${from}`, after: `${prefix}${from + 1}` },
  );
  try {
    await button.click({ timeout: timeoutMs });
    await page.waitForFunction(
      (key) => {
        const state = (window as unknown as Record<string, { domObservedMs?: number }>)[key];
        return state?.domObservedMs !== undefined;
      },
      key,
      { timeout: timeoutMs, polling: 10 },
    );
    return await page.evaluate((key) => {
      const state = (
        window as unknown as Record<
          string,
          { startMs: number; dispatchMs: number; domObservedMs: number }
        >
      )[key]!;
      return {
        dispatchMs: state.dispatchMs,
        domObservedMs: state.domObservedMs,
        eventToDomMs: state.domObservedMs - state.dispatchMs,
        e2eMs: performance.now() - state.startMs,
      };
    }, key);
  } catch (error) {
    if (!page.isClosed()) {
      const partial = await page
        .evaluate((key) => {
          const state = (
            window as unknown as Record<
              string,
              {
                dispatchMs?: number;
                domObservedMs?: number;
                expectedText: string;
                actualText(): string | null;
              }
            >
          )[key];
          if (!state) return undefined;
          return {
            dispatchMs: state.dispatchMs,
            domObservedMs: state.domObservedMs,
            expectedText: state.expectedText,
            actualText: state.actualText(),
          };
        }, key)
        .catch(() => undefined);
      if (partial) onFailure(partial);
    }
    throw error;
  } finally {
    if (!page.isClosed())
      await page
        .evaluate((key) => {
          const globals = window as unknown as Record<string, { dispose(): void }>;
          globals[key]?.dispose();
          delete globals[key];
        }, key)
        .catch(() => {});
  }
}
