import { afterEach, describe, expect, test } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompatInteraction } from "./types.js";

const labRoot = fileURLToPath(new URL(".", import.meta.url));

let servers: ViteDevServer[] = [];
let browsers: Browser[] = [];

interface CapturedCompatFixture {
  classes: string[];
  circleCount: number;
  radialBarLegendIconClasses: string[];
}

describe("recharts known compat differences", () => {
  afterEach(async () => {
    await Promise.all(browsers.map((browser) => browser.close()));
    await Promise.all(servers.map((server) => server.close()));
    browsers = [];
    servers = [];
  });

  test(
    "line tooltip hover keeps the line series and dots in compat runtime",
    async () => {
      const root = await captureCompatFixture("recharts-line-tooltip-hover", [
        { name: "hover-chart-center", description: "", run: "hoverChartCenter" },
      ]);

      expect(root.classes).toContain("recharts-line");
      expect(root.classes).toContain("recharts-line-curve");
      expect(root.classes).toContain("recharts-line-dots");
      expect(root.circleCount).toBeGreaterThan(1);
    },
    30_000,
  );

  test("polar radar radial includes the radar graphical item in compat runtime", async () => {
    const root = await captureCompatFixture("recharts-polar-radar-radial", []);

    expect(root.classes).toContain("recharts-radar");
    expect(root.classes).toContain("recharts-radar-polygon");
    expect(root.radialBarLegendIconClasses).toEqual([
      "recharts-symbols",
      "recharts-symbols",
      "recharts-symbols",
      "recharts-symbols",
      "recharts-symbols",
    ]);
  }, 30_000);

  test(
    "synced tooltip hover keeps both line series in compat runtime",
    async () => {
      const root = await captureCompatFixture("recharts-synced-tooltips", [
        { name: "hover-chart-center", description: "", run: "hoverChartCenter" },
      ]);

      expect(root.classes).toContain("recharts-line");
      expect(root.classes).toContain("recharts-line-curve");
      expect(root.classes).toContain("recharts-line-dots");
      expect(root.circleCount).toBeGreaterThan(2);
    },
    30_000,
  );
});

async function captureCompatFixture(
  fixtureId: string,
  interactions: CompatInteraction[],
): Promise<CapturedCompatFixture> {
  const server = await startCompatServer();
  const browser = await chromium.launch({ headless: true });
  browsers.push(browser);
  const page = await browser.newPage({
    viewport: { width: 960, height: 720 },
    deviceScaleFactor: 1,
  });

  await page.goto(`${server.url}/?fixture=${encodeURIComponent(fixtureId)}`);
  const root = page.locator(`[data-fixture-id="${fixtureId}"]`).first();
  await root.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("svg").first().waitFor({ state: "visible", timeout: 15_000 });

  for (const interaction of interactions) {
    if (interaction.run === "hoverChartCenter") {
      const box = await page.locator("svg").first().boundingBox();
      if (box !== null) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(450);
      }
    }
  }

  return root.evaluate((element) => {
    const classes = Array.from(element.querySelectorAll("[class]"))
      .flatMap((node) => Array.from(node.classList))
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();

    const legends = Array.from(element.querySelectorAll(".recharts-default-legend"));
    const radialBarLegend = legends.at(1);

    return {
      classes,
      circleCount: element.querySelectorAll("circle").length,
      radialBarLegendIconClasses: Array.from(
        radialBarLegend?.querySelectorAll(
          ".recharts-legend-item svg > path, .recharts-legend-item svg > line",
        ) ?? [],
      ).map((node) => node.getAttribute("class") ?? ""),
    };
  });
}

async function startCompatServer(): Promise<{ url: string }> {
  process.env.COMPAT_LAB_RUNTIME = "compat";
  const server = await createServer({
    configFile: join(labRoot, "vite.config.ts"),
    root: labRoot,
    mode: "development",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  servers.push(server);
  const address = server.httpServer?.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Failed to start compat Vite server.");
  }
  return { url: `http://127.0.0.1:${address.port}` };
}
