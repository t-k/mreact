import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type ConsoleMessage, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { diffPngWithBrowserCanvas } from "../recharts/image-diff.js";
import { reactFlowFixtures } from "./fixtures.js";
import { writeRunSummary, type FixtureRunResult } from "./result-writer.js";
import type { ReactFlowDomSummary, ReactFlowFixture, ReactFlowInteraction } from "./types.js";

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

export function selectFixturesForRun(args: RunnerArgs): ReactFlowFixture[] {
  const selectedFixtures =
    args.fixtureId === undefined
      ? reactFlowFixtures
      : reactFlowFixtures.filter((fixture) => fixture.id === args.fixtureId);

  if (selectedFixtures.length === 0) {
    throw new Error(`Unknown React Flow compat fixture: ${args.fixtureId}`);
  }

  return selectedFixtures;
}

export function createRunId(now = new Date(), timestamp = Date.now()): string {
  return `${now.toISOString().slice(0, 10)}-${timestamp}-react-flow`;
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
    console.log(`React Flow compat lab results: ${outputDir}`);
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
  interactions: ReactFlowInteraction[];
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
  interactions: ReactFlowInteraction[];
  screenshotPath: string;
}): Promise<{ screenshotPath: string; domSummary: ReactFlowDomSummary }> {
  const consoleMessages: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  };

  input.page.on("console", onConsole);
  try {
    await input.page.goto(input.url, { waitUntil: "domcontentloaded" });
    await input.page
      .locator(`[data-fixture-id="${input.fixtureId}"]`)
      .waitFor({ state: "visible", timeout: 15_000 });
    await input.page.locator(".react-flow__node").first().waitFor({ state: "visible", timeout: 15_000 });
    await input.page.waitForTimeout(150);
    await runInteractions(input.page, input.interactions);

    const root = input.page.locator("[data-compat-lab-root]").first();
    await root.screenshot({ path: input.screenshotPath });
    const domSummary = await readDomSummary(input.page, consoleMessages);

    return { screenshotPath: input.screenshotPath, domSummary };
  } finally {
    input.page.off("console", onConsole);
  }
}

async function runInteractions(page: Page, interactions: ReactFlowInteraction[]): Promise<void> {
  for (const interaction of interactions) {
    if (interaction.run === "clickFirstNode") {
      await page.locator(".react-flow__node").first().click();
      await page.waitForTimeout(150);
    } else if (interaction.run === "clickFitView") {
      await page.locator(".react-flow__controls-fitview").click();
      await page.waitForTimeout(250);
    } else if (interaction.run === "dragFirstNode") {
      const box = await page.locator(".react-flow__node").first().boundingBox();
      if (box !== null) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.5 + 90, box.y + box.height * 0.5 + 50, {
          steps: 8,
        });
        await page.mouse.up();
      }
      await page.waitForTimeout(300);
    } else if (interaction.run === "connectSourceToTargetByClick") {
      await page
        .locator(".react-flow__node[data-id='draft'] .react-flow__handle.source[data-handleid='success']")
        .click();
      await page.waitForTimeout(150);
      await page
        .locator(".react-flow__node[data-id='publish'] .react-flow__handle.target[data-handleid='input']")
        .click();
      await page.waitForTimeout(300);
    } else if (interaction.run === "clickReconnectEdgeButton") {
      await page.locator("[data-testid='react-flow-reconnect-button']").click();
      await page.waitForTimeout(250);
    } else if (interaction.run === "dragResizeHandle") {
      const handle = page.locator(".react-flow__resize-control.bottom.right.handle").first();
      const box = await handle.boundingBox();
      if (box !== null) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.5 + 48, box.y + box.height * 0.5 + 28, {
          steps: 8,
        });
        await page.mouse.up();
      }
      await page.waitForTimeout(300);
    } else if (interaction.run === "pressDeleteKey") {
      await page.locator(".react-flow__node").first().click();
      await page.waitForTimeout(150);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(300);
    } else if (interaction.run === "clickViewportButton") {
      await page.locator("[data-testid='react-flow-viewport-button']").click();
      await page.waitForTimeout(300);
    }
  }
}

async function readDomSummary(
  page: Page,
  consoleMessages: string[],
): Promise<ReactFlowDomSummary> {
  return page.evaluate((capturedConsoleMessages) => {
    const uniqueClasses = Array.from(document.querySelectorAll("[data-compat-lab-root] [class]"))
      .flatMap((node) => Array.from(node.classList))
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();
    const panelText = Array.from(document.querySelectorAll(".react-flow__panel"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const nodeText = Array.from(document.querySelectorAll(".react-flow__node"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const edgeLabelText = Array.from(document.querySelectorAll(".react-flow__edge-text"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const positionText = Array.from(document.querySelectorAll("[data-node-position]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const resizeText = Array.from(document.querySelectorAll("[data-node-size]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const deletedText = Array.from(document.querySelectorAll("[data-deleted-nodes], [data-node-count]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const viewportText = Array.from(document.querySelectorAll("[data-viewport-state]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const edgePortalText = Array.from(document.querySelectorAll("[data-edge-portal-label]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const initializedText = Array.from(document.querySelectorAll("[data-nodes-initialized]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((value) => value.length > 0)
      .sort();
    const resizeNode = document.querySelector(".react-flow__node[data-id='resize']");
    if (resizeNode instanceof HTMLElement) {
      resizeText.push(
        `node-style:${resizeNode.style.width || "auto"}x${resizeNode.style.height || "auto"}`,
      );
      resizeText.sort();
    }
    const selectedNodeText =
      document.querySelector("[data-selected-node]")?.textContent?.replace(/\s+/g, " ").trim() ??
      "";
    const viewport = document.querySelector(".react-flow__viewport");

    return {
      nodeCount: document.querySelectorAll(".react-flow__node").length,
      edgePathCount: document.querySelectorAll(".react-flow__edge-path").length,
      handleCount: document.querySelectorAll(".react-flow__handle").length,
      controlButtonCount: document.querySelectorAll(".react-flow__controls button").length,
      miniMapCount: document.querySelectorAll("[data-testid='rf__minimap']").length,
      panelText,
      nodeText,
      selectedNodeText,
      edgeLabelText,
      positionText,
      resizeText,
      deletedText,
      viewportText,
      edgePortalText,
      initializedText,
      transform: viewport instanceof HTMLElement ? viewport.style.transform : "",
      classes: uniqueClasses,
      consoleMessages: capturedConsoleMessages,
    };
  }, consoleMessages);
}

export function emptyDomSummary(): ReactFlowDomSummary {
  return {
    nodeCount: 0,
    edgePathCount: 0,
    handleCount: 0,
    controlButtonCount: 0,
    miniMapCount: 0,
    panelText: [],
    nodeText: [],
    selectedNodeText: "",
    edgeLabelText: [],
    positionText: [],
    resizeText: [],
    deletedText: [],
    viewportText: [],
    edgePortalText: [],
    initializedText: [],
    transform: "",
    classes: [],
    consoleMessages: [],
  };
}

export function summariesMatch(
  react: ReactFlowDomSummary,
  compat: ReactFlowDomSummary,
): boolean {
  return (
    react.nodeCount === compat.nodeCount &&
    react.edgePathCount === compat.edgePathCount &&
    react.handleCount === compat.handleCount &&
    react.controlButtonCount === compat.controlButtonCount &&
    react.miniMapCount === compat.miniMapCount &&
    react.selectedNodeText === compat.selectedNodeText &&
    react.transform === compat.transform &&
    sameStringArray(react.edgeLabelText, compat.edgeLabelText) &&
    sameStringArray(react.panelText, compat.panelText) &&
    sameStringArray(react.nodeText, compat.nodeText) &&
    sameStringArray(react.positionText, compat.positionText) &&
    sameStringArray(react.resizeText, compat.resizeText) &&
    sameStringArray(react.deletedText, compat.deletedText) &&
    sameStringArray(react.viewportText, compat.viewportText) &&
    sameStringArray(react.edgePortalText, compat.edgePortalText) &&
    sameStringArray(react.initializedText, compat.initializedText) &&
    sameStringArray(react.classes, compat.classes) &&
    react.consoleMessages.length === 0 &&
    compat.consoleMessages.length === 0
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
