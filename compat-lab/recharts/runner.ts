import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { assertCompatLabPassed } from "../shared/assert-run-passed.js";
import type { DomSummary } from "./dom-summary.js";
import { rechartsFixtures } from "./fixtures.js";
import { diffPngWithBrowserCanvas } from "./image-diff.js";
import { writeRunSummary, type FixtureRunResult } from "./result-writer.js";
import type { CompatFixture, CompatInteraction } from "./types.js";

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

async function main(): Promise<void> {
  const args = parseRunnerArgs(process.argv.slice(2));
  const selectedFixtures =
    args.fixtureId === undefined
      ? rechartsFixtures
      : rechartsFixtures.filter((fixture) => fixture.id === args.fixtureId);

  if (selectedFixtures.length === 0) {
    throw new Error(`Unknown Recharts compat fixture: ${args.fixtureId}`);
  }

  const runId = `${new Date().toISOString().slice(0, 10)}-${Date.now()}-recharts`;
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
          expectedDomSummary: fixture.expectedDomSummary,
          outputDir,
          reactUrl: `${reactServer.url}/?fixture=${encodeURIComponent(fixture.id)}`,
          compatUrl: `${compatServer.url}/?fixture=${encodeURIComponent(fixture.id)}`,
          viewport: fixture.viewport,
        }),
      );
    }
    await writeRunSummary({ outputDir, runId, results });
    assertCompatLabPassed({ labName: "Recharts", outputDir, results });
    console.log(`Recharts compat lab results: ${outputDir}`);
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
  interactions: CompatInteraction[];
  expectedDomSummary: CompatFixture["expectedDomSummary"];
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
      ok:
        fixtureDomSummaryMatches(react.domSummary, input.expectedDomSummary) &&
        fixtureDomSummaryMatches(compat.domSummary, input.expectedDomSummary),
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
      reactDomSummary: { svgCount: 0, pathCount: 0, text: [] },
      compatDomSummary: { svgCount: 0, pathCount: 0, text: [] },
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
  interactions: CompatInteraction[];
  screenshotPath: string;
}): Promise<{ screenshotPath: string; domSummary: DomSummary }> {
  await input.page.goto(input.url);
  await input.page
    .locator(`[data-fixture-id="${input.fixtureId}"]`)
    .waitFor({ state: "visible", timeout: 15_000 });
  await input.page.locator("svg").first().waitFor({ state: "visible", timeout: 15_000 });
  await runInteractions(input.page, input.interactions);

  const root = input.page.locator("[data-compat-lab-root]").first();
  await root.screenshot({ path: input.screenshotPath });
  const domSummary = await root.evaluate((element) => {
    const text = Array.from(element.querySelectorAll("text, .recharts-tooltip-wrapper"))
      .map((node) => node.textContent?.trim() ?? "")
      .filter((value) => value.length > 0);
    const classes = Array.from(element.querySelectorAll("[class]"))
      .flatMap((node) => Array.from(node.classList))
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();

    return {
      svgCount: element.querySelectorAll("svg").length,
      pathCount: element.querySelectorAll("path").length,
      barPathCount: element.querySelectorAll(".recharts-bar-rectangle path").length,
      rectCount: element.querySelectorAll("rect").length,
      circleCount: element.querySelectorAll("circle").length,
      text,
      classes,
    };
  });

  return { screenshotPath: input.screenshotPath, domSummary };
}

export function fixtureDomSummaryMatches(
  summary: DomSummary,
  expected: CompatFixture["expectedDomSummary"] = undefined,
): boolean {
  if (summary.svgCount === 0) {
    return false;
  }

  return Object.entries(expected ?? {}).every(
    ([key, value]) => summary[key as keyof DomSummary] === value,
  );
}

async function runInteractions(page: Page, interactions: CompatInteraction[]): Promise<void> {
  for (const interaction of interactions) {
    if (interaction.run === "hoverChartCenter") {
      const box = await page.locator("svg").first().boundingBox();
      if (box !== null) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(450);
      }
    } else if (interaction.run === "clickChartCenter") {
      const box = await page.locator("svg").first().boundingBox();
      if (box !== null) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(100);
      }
    } else if (interaction.run === "hoverLegendFirstItem") {
      const box = await page.locator(".recharts-legend-item").first().boundingBox();
      if (box !== null) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(100);
      }
    } else if (interaction.run === "clickLegendFirstItem") {
      const box = await page.locator(".recharts-legend-item").first().boundingBox();
      if (box !== null) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(100);
      }
    } else if (interaction.run === "resizeViewport") {
      await page.setViewportSize({ width: 840, height: 640 });
      await page.waitForTimeout(100);
    } else if (interaction.run === "waitForAnimationEnd") {
      await page.waitForTimeout(400);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
