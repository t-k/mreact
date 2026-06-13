import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type ConsoleMessage, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { diffPngWithBrowserCanvas } from "../recharts/image-diff.js";
import { uiPrimitiveFixtures } from "./fixtures.js";
import { writeRunSummary, type FixtureRunResult } from "./result-writer.js";
import type { UiPrimitiveDomSummary, UiPrimitiveFixture, UiPrimitiveInteraction } from "./types.js";

export interface RunnerArgs {
  fixtureId: string | undefined;
  headed: boolean;
}

const labRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(labRoot, "../..");

export function parseRunnerArgs(args: string[]): RunnerArgs {
  let fixtureId: string | undefined;
  let headed = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--fixture") {
      fixtureId = args[index + 1];
      index += 1;
    } else if (arg === "--headed") {
      headed = true;
    }
  }

  return { fixtureId, headed };
}

export function selectFixturesForRun(args: RunnerArgs): UiPrimitiveFixture[] {
  const selectedFixtures =
    args.fixtureId === undefined
      ? uiPrimitiveFixtures
      : uiPrimitiveFixtures.filter((fixture) => fixture.id === args.fixtureId);

  if (selectedFixtures.length === 0) {
    throw new Error(`Unknown UI primitive compat fixture: ${args.fixtureId}`);
  }

  return selectedFixtures;
}

export function createRunId(now = new Date(), timestamp = Date.now()): string {
  return `${now.toISOString().slice(0, 10)}-${timestamp}-ui-primitives`;
}

export function normalizeActiveElementText(tagName: string, textContent: string): string {
  const normalizedTagName = tagName.toUpperCase();
  if (normalizedTagName === "BODY" || normalizedTagName === "HTML") {
    return "";
  }
  return textContent.replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  const args = parseRunnerArgs(process.argv.slice(2));
  const selectedFixtures = selectFixturesForRun(args);
  const runId = createRunId();
  const outputDir = join(repoRoot, "docs.local", "compat-lab", runId);
  let reactServer: { url: string; close(): Promise<void> } | undefined;
  let compatServer: { url: string; close(): Promise<void> } | undefined;
  let browser: Browser | undefined;

  try {
    reactServer = await startViteServer("react");
    compatServer = await startViteServer("compat");
    browser = await chromium.launch({ headless: !args.headed });

    const results: FixtureRunResult[] = [];
    for (const fixture of selectedFixtures) {
      results.push(
        await runFixture({
          browser,
          fixtureId: fixture.id,
          interactions: fixture.interactions ?? [],
          outputDir,
          reactUrl: `${reactServer.url}/?fixture=${encodeURIComponent(fixture.id)}`,
          compatUrl: `${compatServer.url}/?fixture=${encodeURIComponent(fixture.id)}`,
          viewport: fixture.viewport,
        }),
      );
    }

    await writeRunSummary({ outputDir, runId, results });
    console.log(`UI primitive compat lab results: ${outputDir}`);
  } finally {
    await Promise.all([
      browser?.close() ?? Promise.resolve(),
      reactServer?.close() ?? Promise.resolve(),
      compatServer?.close() ?? Promise.resolve(),
    ]);
  }
}

async function startViteServer(
  runtime: "react" | "compat",
): Promise<{ url: string; close(): Promise<void> }> {
  process.env.COMPAT_LAB_RUNTIME = runtime;
  const server: ViteDevServer = await createServer({
    configFile: join(labRoot, "vite.config.ts"),
    root: labRoot,
    mode: "development",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (typeof address !== "object" || address === null) {
    throw new Error(`Failed to start ${runtime} Vite server.`);
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

async function runFixture(input: {
  browser: Browser;
  fixtureId: string;
  interactions: UiPrimitiveInteraction[];
  outputDir: string;
  reactUrl: string;
  compatUrl: string;
  viewport: { width: number; height: number };
}): Promise<FixtureRunResult> {
  await mkdir(join(input.outputDir, "react"), { recursive: true });
  await mkdir(join(input.outputDir, "compat"), { recursive: true });
  await mkdir(join(input.outputDir, "diff"), { recursive: true });
  await mkdir(join(input.outputDir, "dom"), { recursive: true });

  const page = await input.browser.newPage({
    viewport: input.viewport,
    deviceScaleFactor: 1,
  });
  const diffPage = await input.browser.newPage({
    viewport: input.viewport,
    deviceScaleFactor: 1,
  });

  try {
    const react = await captureRuntime({
      page,
      url: input.reactUrl,
      fixtureId: input.fixtureId,
      interactions: input.interactions,
      screenshotPath: join(input.outputDir, "react", `${input.fixtureId}.png`),
    });
    const compat = await captureRuntime({
      page,
      url: input.compatUrl,
      fixtureId: input.fixtureId,
      interactions: input.interactions,
      screenshotPath: join(input.outputDir, "compat", `${input.fixtureId}.png`),
    });

    await writeFile(
      join(input.outputDir, "dom", `${input.fixtureId}.react.json`),
      `${JSON.stringify(react.domSummary, null, 2)}\n`,
    );
    await writeFile(
      join(input.outputDir, "dom", `${input.fixtureId}.compat.json`),
      `${JSON.stringify(compat.domSummary, null, 2)}\n`,
    );

    const diffPath = join(input.outputDir, "diff", `${input.fixtureId}.png`);
    const diff = await diffPngWithBrowserCanvas({
      page: diffPage,
      reactPngPath: react.screenshotPath,
      compatPngPath: compat.screenshotPath,
      diffPngPath: diffPath,
    });

    return {
      fixtureId: input.fixtureId,
      ok: summariesMatch(react.domSummary, compat.domSummary),
      pixelDiffRatio: diff.pixelDiffRatio,
      reactDomSummary: react.domSummary,
      compatDomSummary: compat.domSummary,
      artifacts: {
        reactScreenshot: relative(input.outputDir, react.screenshotPath),
        compatScreenshot: relative(input.outputDir, compat.screenshotPath),
        diffScreenshot: relative(input.outputDir, diffPath),
      },
    };
  } catch (error) {
    return {
      fixtureId: input.fixtureId,
      ok: false,
      pixelDiffRatio: 1,
      reactDomSummary: emptyDomSummary(),
      compatDomSummary: emptyDomSummary(),
      artifacts: {
        reactScreenshot: `react/${input.fixtureId}.png`,
        compatScreenshot: `compat/${input.fixtureId}.png`,
        diffScreenshot: `diff/${input.fixtureId}.png`,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
    await diffPage.close();
  }
}

async function captureRuntime(input: {
  page: Page;
  url: string;
  fixtureId: string;
  interactions: UiPrimitiveInteraction[];
  screenshotPath: string;
}): Promise<{ screenshotPath: string; domSummary: UiPrimitiveDomSummary }> {
  const consoleMessages: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  };

  input.page.on("console", onConsole);
  try {
    await input.page.goto(input.url);
    await input.page
      .locator(`[data-fixture-id="${input.fixtureId}"]`)
      .waitFor({ state: "visible", timeout: 15_000 });
    await runInteractions(input.page, input.interactions);
    await input.page.screenshot({ path: input.screenshotPath });
    const domSummary = await readDomSummary(input.page, consoleMessages);

    return { screenshotPath: input.screenshotPath, domSummary };
  } finally {
    input.page.off("console", onConsole);
  }
}

async function runInteractions(page: Page, interactions: UiPrimitiveInteraction[]): Promise<void> {
  for (const interaction of interactions) {
    if (interaction.run === "clickReactAriaDialogTrigger") {
      await page.locator("[data-testid='react-aria-dialog-trigger']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickReactAriaListboxSecondItem") {
      const item = page.locator("[data-testid='react-aria-listbox-item-beta']");
      if ((await item.count()) > 0) {
        await item.click();
      }
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickFloatingPopoverTrigger") {
      await page.locator("[data-testid='floating-popover-trigger']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "hoverFloatingTooltipTrigger") {
      await page.locator("[data-testid='floating-tooltip-trigger']").hover();
      await page.waitForTimeout(250);
    } else if (interaction.run === "focusFloatingTooltipTrigger") {
      await page.locator("[data-testid='floating-tooltip-trigger']").focus();
      await page.waitForTimeout(250);
    } else if (interaction.run === "scrollVirtualList") {
      await page.locator("[data-testid='virtual-scroll-container']").evaluate((node) => {
        node.scrollTop = 520;
        node.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await page.waitForTimeout(250);
    } else if (interaction.run === "fillHookFormEmail") {
      await page.locator("[data-testid='hook-form-email']").fill("after@example.test");
      await page.waitForTimeout(100);
    } else if (interaction.run === "blurHookFormEmail") {
      await page.locator("[data-testid='hook-form-email']").blur();
      await page.waitForTimeout(150);
    } else if (interaction.run === "submitHookForm") {
      await page.locator("[data-testid='hook-form-submit']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickHookFormAddItem") {
      await page.locator("[data-testid='hook-form-add-item']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "fillHookFormArrayItem") {
      await page.locator("[data-testid='hook-form-array-item-1']").fill("Beta");
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickHeadlessDialogTrigger") {
      await page.locator("[data-testid='headless-dialog-trigger']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickHeadlessListboxButton") {
      await page.locator("[data-testid='headless-listbox-button']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickHeadlessListboxSecondOption") {
      const option = page.getByText("Beta option", { exact: true });
      if ((await option.count()) > 0) {
        await option.click();
      }
      await page.waitForTimeout(150);
    } else if (interaction.run === "focusHeadlessMenuButton") {
      await page.locator("[data-testid='headless-menu-button']").focus();
      await page.waitForTimeout(100);
    } else if (interaction.run === "pressEnter") {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
    } else if (interaction.run === "pressEscape") {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickOutsideOverlay") {
      await page.mouse.click(24, 24);
      await page.waitForTimeout(150);
    }
  }
}

async function readDomSummary(
  page: Page,
  consoleMessages: string[],
): Promise<UiPrimitiveDomSummary> {
  return page.evaluate((capturedConsoleMessages) => {
    const activeElement = document.activeElement;
    const activeElementTagName = activeElement?.tagName.toUpperCase() ?? "";
    const activeElementInBody =
      activeElement instanceof Element && document.body.contains(activeElement);
    const activeElementVisible =
      !(activeElement instanceof HTMLElement) ||
      activeElement.offsetParent !== null ||
      activeElement.getClientRects().length > 0;
    const trigger = document.querySelector(
      [
        "[data-testid='react-aria-dialog-trigger']",
        "[data-testid='react-aria-listbox']",
        "[data-testid='floating-popover-trigger']",
        "[data-testid='headless-listbox-button']",
        "[data-testid='headless-menu-button']",
      ].join(", "),
    );
    const visibleTextSelector = [
      "[data-ui-smoke-content]",
      "[data-ui-form-state]",
      "[data-testid='react-aria-dialog']",
      "[data-testid='react-aria-listbox']",
      "[data-testid='floating-popover-content']",
      "[data-testid='floating-tooltip-content']",
      "[data-testid='headless-dialog-panel']",
      "[data-testid='headless-listbox-options']",
      "[data-testid='headless-menu-items']",
      "[role='dialog']",
      "[role='menu']",
      "[role='listbox']",
      "[role='tooltip']",
    ].join(", ");
    const bodyText = Array.from(document.body.querySelectorAll(visibleTextSelector))
      .filter(
        (node) =>
          !(node instanceof HTMLElement) ||
          node.offsetParent !== null ||
          node.getClientRects().length > 0,
      )
      .map((node) => {
        if (node instanceof HTMLElement) {
          return node.innerText.replace(/\s+/g, " ").trim();
        }
        return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      })
      .filter((value) => value.length > 0);
    const formStateText = Array.from(document.body.querySelectorAll("[data-ui-form-state]"))
      .filter(
        (node) =>
          !(node instanceof HTMLElement) ||
          node.offsetParent !== null ||
          node.getClientRects().length > 0,
      )
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0);
    const virtualRows = Array.from(document.body.querySelectorAll("[data-ui-virtual-row]"))
      .filter(
        (node) =>
          !(node instanceof HTMLElement) ||
          node.offsetParent !== null ||
          node.getClientRects().length > 0,
      )
      .slice(0, 8)
      .map((node) => {
        const index = node.getAttribute("data-index") ?? "unknown";
        return `${index}:${node.textContent?.replace(/\s+/g, " ").trim() ?? ""}`;
      });

    return {
      dialogCount: document.body.querySelectorAll("[role='dialog']").length,
      menuCount: document.body.querySelectorAll("[role='menu']").length,
      listboxCount: document.body.querySelectorAll("[role='listbox']").length,
      tooltipCount: document.body.querySelectorAll("[role='tooltip']").length,
      smokeContentCount: Array.from(document.body.querySelectorAll("[data-ui-smoke-content]")).filter(
        (node) =>
          !(node instanceof HTMLElement) ||
          node.offsetParent !== null ||
          node.getClientRects().length > 0,
      ).length,
      triggerExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      activeElementText:
        !activeElementInBody ||
        !activeElementVisible ||
        activeElementTagName === "BODY" ||
        activeElementTagName === "HTML"
          ? ""
          : (activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      virtualRows,
      formStateText,
      bodyText,
      consoleMessages: capturedConsoleMessages,
    };
  }, consoleMessages);
}

function summariesMatch(react: UiPrimitiveDomSummary, compat: UiPrimitiveDomSummary): boolean {
  return (
    react.dialogCount === compat.dialogCount &&
    react.menuCount === compat.menuCount &&
    react.listboxCount === compat.listboxCount &&
    react.tooltipCount === compat.tooltipCount &&
    react.smokeContentCount === compat.smokeContentCount &&
    react.triggerExpanded === compat.triggerExpanded &&
    react.activeElementText === compat.activeElementText &&
    react.virtualRows.join("\n") === compat.virtualRows.join("\n") &&
    react.formStateText.join("\n") === compat.formStateText.join("\n") &&
    react.bodyText.join("\n") === compat.bodyText.join("\n") &&
    react.consoleMessages.length === 0 &&
    compat.consoleMessages.length === 0
  );
}

function emptyDomSummary(): UiPrimitiveDomSummary {
  return {
    dialogCount: 0,
    menuCount: 0,
    listboxCount: 0,
    tooltipCount: 0,
    smokeContentCount: 0,
    triggerExpanded: null,
    activeElementText: "",
    virtualRows: [],
    formStateText: [],
    bodyText: [],
    consoleMessages: [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
