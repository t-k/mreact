import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
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
    const initialRequests = [...requested];

    // Every file the accounting counted for the first page must actually be fetched, and the
    // browser must not fetch a JavaScript file the accounting never saw in the manifest graph.
    expect([...new Set(initialRequests)].sort()).toEqual([...report.initial.paths].sort());

    const visitedPaths: string[][] = [];
    for (const visit of fixture.sessionVisits) {
      const before = requested.length;
      await page.getByRole("link", { name: "Next" }).click();
      await expect(page).toHaveURL(new RegExp(`${visit.replace("/", "\\/")}$`, "u"));
      await expect(page.getByRole("button", { name: "Open" })).toBeVisible();
      visitedPaths.push([...new Set(requested.slice(before))].sort());
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
  } finally {
    await server.close();
    await rm(workDir, { force: true, recursive: true });
  }
});
