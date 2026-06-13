import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type ConsoleMessage, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { diffPngWithBrowserCanvas } from "../recharts/image-diff.js";
import { radixFixtures } from "./fixtures.js";
import { writeRunSummary, type FixtureRunResult } from "./result-writer.js";
import type { RadixDomSummary, RadixFixture, RadixInteraction } from "./types.js";

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

export function selectFixturesForRun(args: RunnerArgs): RadixFixture[] {
  const selectedFixtures =
    args.fixtureId === undefined
      ? radixFixtures
      : radixFixtures.filter((fixture) => fixture.id === args.fixtureId);

  if (selectedFixtures.length === 0) {
    throw new Error(`Unknown Radix compat fixture: ${args.fixtureId}`);
  }

  return selectedFixtures;
}

export function createRunId(now = new Date(), timestamp = Date.now()): string {
  return `${now.toISOString().slice(0, 10)}-${timestamp}-radix`;
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
    console.log(`Radix compat lab results: ${outputDir}`);
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
  interactions: RadixInteraction[];
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
  interactions: RadixInteraction[];
  screenshotPath: string;
}): Promise<{ screenshotPath: string; domSummary: RadixDomSummary }> {
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

async function runInteractions(page: Page, interactions: RadixInteraction[]): Promise<void> {
  for (const interaction of interactions) {
    if (interaction.run === "clickDialogTrigger") {
      await page.locator("[data-testid='dialog-trigger']").click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickDialogClose") {
      const close = page.locator("[data-testid='dialog-close']");
      if ((await close.count()) > 0) {
        await close.click();
      }
      await page.waitForTimeout(150);
    } else if (interaction.run === "pressEscape") {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickOutsideDialog") {
      await page.mouse.click(24, 24);
      await page.waitForTimeout(150);
    }
  }
}

async function readDomSummary(page: Page, consoleMessages: string[]): Promise<RadixDomSummary> {
  return page.evaluate((capturedConsoleMessages) => {
    const trigger = document.querySelector("[data-testid='dialog-trigger']");
    const activeElement = document.activeElement;
    const activeElementTagName = activeElement?.tagName.toUpperCase() ?? "";
    const bodyText = Array.from(
      document.body.querySelectorAll(
        "[data-testid='dialog-trigger'], [data-testid='dialog-content'], [data-testid='dialog-close'], [role='dialog']",
      ),
    )
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0);

    return {
      dialogCount: document.body.querySelectorAll("[role='dialog']").length,
      portalContentCount: document.body.querySelectorAll("[data-testid='dialog-content']").length,
      triggerExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      activeElementText:
        activeElementTagName === "BODY" || activeElementTagName === "HTML"
          ? ""
          : (activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      bodyText,
      consoleMessages: capturedConsoleMessages,
    };
  }, consoleMessages);
}

function summariesMatch(react: RadixDomSummary, compat: RadixDomSummary): boolean {
  return (
    react.dialogCount === compat.dialogCount &&
    react.portalContentCount === compat.portalContentCount &&
    react.triggerExpanded === compat.triggerExpanded &&
    react.activeElementText === compat.activeElementText &&
    react.consoleMessages.length === 0 &&
    compat.consoleMessages.length === 0
  );
}

function emptyDomSummary(): RadixDomSummary {
  return {
    dialogCount: 0,
    portalContentCount: 0,
    triggerExpanded: null,
    activeElementText: "",
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
