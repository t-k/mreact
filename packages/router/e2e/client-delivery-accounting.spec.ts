import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";
import {
  measureBrowserDelivery,
  type BrowserDeliveryManifest,
} from "../../../size/delivery.js";
import {
  clientDeliveryFixtures,
  materializeClientDeliveryFixture,
} from "../../../size/fixtures.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const clientAssetPrefix = "/_mreact/client/";

function clientAssetPath(url: string): string | undefined {
  const { pathname } = new URL(url);
  return pathname.startsWith(clientAssetPrefix) && pathname.endsWith(".js")
    ? pathname.slice(clientAssetPrefix.length)
    : undefined;
}

async function browserJavaScriptResources(page: Page) {
  return page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    resources: performance.getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname.startsWith("/_mreact/client/") && new URL(entry.name).pathname.endsWith(".js"))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          path: new URL(resource.name).pathname.slice("/_mreact/client/".length),
          encodedBodySize: resource.encodedBodySize,
          transferSize: resource.transferSize,
        };
      }),
  }));
}

function observedJavaScript(resources: Awaited<ReturnType<typeof browserJavaScriptResources>>["resources"]) {
  return {
    paths: [...new Set(resources.filter((entry) => entry.transferSize > 0).map((entry) => entry.path))].sort(),
    encodedBodyBytes: resources.filter((entry) => entry.transferSize > 0).reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    cachedResourceEntries: resources.filter((entry) => entry.transferSize === 0).length,
  };
}

test("delivery accounting predicts the JavaScript a browser fetches across a navigation session", async ({
  page,
}) => {
  const fixture = clientDeliveryFixtures.find((entry) => entry.name === "multi-route-session");
  expect(fixture, "the multi-route session fixture must exist").toBeDefined();
  if (fixture === undefined) {
    return;
  }

  const workDir = join(repositoryRoot, "test-results", "client-delivery-e2e");
  await rm(workDir, { force: true, recursive: true });
  await mkdir(workDir, { recursive: true });
  const project = await materializeClientDeliveryFixture(fixture, workDir);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    await buildApp({
      appDir: project.appDir,
      outDir: project.outDir,
      projectRoot: project.projectRoot,
    });
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }

  const clientDir = join(project.outDir, "client");
  const manifest = JSON.parse(
    await readFile(join(clientDir, "manifest.json"), "utf8"),
  ) as BrowserDeliveryManifest;
  const report = await measureBrowserDelivery({
    clientDir,
    initialIncludesNavigationRuntime: true,
    initialPath: fixture.initialPath,
    manifest,
    session: {
      includeNavigationRuntime: true,
      visits: fixture.sessionVisits.map((path) => ({ path })),
    },
  });
  const aToBToAEstimate = await measureBrowserDelivery({
    clientDir,
    initialIncludesNavigationRuntime: true,
    initialPath: "/",
    manifest,
    session: { includeNavigationRuntime: true, visits: [{ path: "/about" }, { path: "/" }] },
  });

  const server = await startServer({ outDir: project.outDir, port: 0 });
  const requested: string[] = [];
  page.on("request", (request) => {
    const path = clientAssetPath(request.url());
    if (path !== undefined) {
      requested.push(path);
    }
  });

  try {
    await page.goto(new URL(fixture.initialPath, server.url).href);
    await expect(page.getByRole("heading", { name: "Home | mreact" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const initialRequests = [...requested];
    const initialResourceSnapshot = await browserJavaScriptResources(page);
    const initialObserved = observedJavaScript(initialResourceSnapshot.resources);

    // Every file the accounting counted for the first page must actually be fetched, and the
    // browser must not fetch a JavaScript file the accounting never saw in the manifest graph.
    expect([...new Set(initialRequests)].sort()).toEqual([...report.initial.paths].sort());
    expect(initialObserved.paths).toEqual([...report.initial.paths].sort());
    expect(initialObserved.encodedBodyBytes).toBe(report.initial.rawBytes);

    const visitedPaths: string[][] = [];
    const observedVisits = [];
    let resourceCount = initialResourceSnapshot.resources.length;
    let aToBToAObserved: unknown;
    for (const visit of fixture.sessionVisits) {
      const before = requested.length;
      await page.getByRole("link", { name: "Next" }).click();
      await expect(page).toHaveURL(new RegExp(`${visit.replace("/", "\\/")}$`, "u"));
      await expect(page.getByRole("button", { name: "Open" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      visitedPaths.push([...new Set(requested.slice(before))].sort());
      const snapshot = await browserJavaScriptResources(page);
      expect(snapshot.timeOrigin).toBe(initialResourceSnapshot.timeOrigin);
      const observed = observedJavaScript(snapshot.resources.slice(resourceCount));
      const estimate = report.session?.visits[observedVisits.length];
      expect(observed.encodedBodyBytes).toBe(estimate?.rawBytes);
      observedVisits.push({ path: visit, ...observed, manifestRawBytes: estimate?.rawBytes });
      resourceCount = snapshot.resources.length;

      if (visit === "/about") {
        const beforeBack = requested.length;
        await page.goBack();
        await expect(page).toHaveURL(new RegExp("/$", "u"));
        await expect(page.getByRole("heading", { name: "Home | mreact" })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const backSnapshot = await browserJavaScriptResources(page);
        expect(backSnapshot.timeOrigin).toBe(initialResourceSnapshot.timeOrigin);
        const backObserved = observedJavaScript(backSnapshot.resources.slice(resourceCount));
        expect([...new Set(requested.slice(beforeBack))]).toEqual([]);
        expect(backObserved.encodedBodyBytes).toBe(aToBToAEstimate.session?.visits[1]?.rawBytes);
        aToBToAObserved = { initial: initialObserved, about: observed, back: backObserved, estimate: {
          initialRawBytes: aToBToAEstimate.initial.rawBytes,
          aboutRawBytes: aToBToAEstimate.session?.visits[0]?.rawBytes,
          backRawBytes: aToBToAEstimate.session?.visits[1]?.rawBytes,
        } };
        resourceCount = backSnapshot.resources.length;
        await page.getByRole("link", { name: "Next" }).click();
        await expect(page).toHaveURL(new RegExp("/about$", "u"));
        await page.waitForLoadState("networkidle");
        const revisit = await browserJavaScriptResources(page);
        expect(revisit.timeOrigin).toBe(initialResourceSnapshot.timeOrigin);
        expect(observedJavaScript(revisit.resources.slice(resourceCount)).encodedBodyBytes).toBe(0);
        resourceCount = revisit.resources.length;
      }
    }

    const expectedVisits = (report.session?.visits ?? []).map((visit) =>
      [...visit.fetchedPaths].sort(),
    );
    expect(visitedPaths).toEqual(expectedVisits);

    // The revisit at the end of the session must add nothing: the shared chunk and the route entry
    // are already in the browser cache, which is exactly what cumulative accounting relies on.
    expect(visitedPaths.at(-1)).toEqual([]);
    expect([...new Set(requested)].sort()).toEqual(
      [...(report.session?.cumulative.paths ?? [])].sort(),
    );
    const outputDir = process.env.MREACT_BENCHMARK_RESULTS_DIR ?? join(repositoryRoot, "size", "reports");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "client-delivery-browser.json"), `${JSON.stringify({
      methodologyVersion: 1,
      browserVersion: page.context().browser()?.version(),
      fixture: fixture.name,
      compression: "none (production fixture server returns raw JavaScript)",
      initial: { ...initialObserved, manifestRawBytes: report.initial.rawBytes },
      aToBToA: aToBToAObserved,
      visits: observedVisits,
      manifestCumulativeRawBytes: report.session?.cumulative.rawBytes,
    }, null, 2)}\n`);
  } finally {
    await server.close();
    await rm(workDir, { force: true, recursive: true });
  }
});
