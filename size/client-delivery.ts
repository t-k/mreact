import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildApp } from "../packages/router/dist/build.js";
import { startServer } from "../packages/router/dist/serve.js";
import {
  evaluateClientDeliveryBudgets,
  formatClientDeliveryMarkdown,
  type ClientDeliveryBudgets,
  type ClientDeliveryFixtureReport,
  type ClientDeliveryHtmlReport,
  type ClientDeliveryReport,
} from "./client-delivery-report.js";
import { deliveryCompressionSettings } from "./compression.js";
import {
  clientDeliveryFixtures,
  materializeClientDeliveryFixture,
  type ClientDeliveryFixture,
} from "./fixtures.js";
import {
  measureBrowserDelivery,
  type BrowserDeliveryManifest,
  type BrowserDeliveryRouteManifest,
} from "./delivery.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = join(repositoryRoot, "test-results", "client-delivery");
const reportDir = join(repositoryRoot, "size", "reports");
const budgetsFile = join(repositoryRoot, "size", "client-delivery-budgets.json");
const checkBudget = process.env.CHECK_CLIENT_DELIVERY_BUDGET === "1";

process.env.NODE_ENV = "production";

const report = await measureClientDeliveryFixtures();
await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "client-delivery.json"), `${JSON.stringify(report, null, 2)}\n`);
const markdown = formatClientDeliveryMarkdown(report);
await writeFile(join(reportDir, "client-delivery.md"), markdown);
console.log(markdown);
console.log(`Reports written to ${reportDir}`);

if (checkBudget) {
  const budgets = JSON.parse(await readFile(budgetsFile, "utf8")) as ClientDeliveryBudgets;
  const failures = evaluateClientDeliveryBudgets(report, budgets);

  if (failures.length > 0) {
    console.error(
      `\nClient delivery size budget failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `\nClient delivery size budget passed for ${report.fixtures.length} fixtures against baseline ${budgets.baselineCommit}.`,
    );
  }
}

async function measureClientDeliveryFixtures(): Promise<ClientDeliveryReport> {
  await rm(workDir, { force: true, recursive: true });
  await mkdir(workDir, { recursive: true });
  const fixtures: ClientDeliveryFixtureReport[] = [];

  try {
    for (const fixture of clientDeliveryFixtures) {
      fixtures.push(await measureFixture(fixture));
    }
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }

  return {
    buildOptions: { minify: true, nodeEnv: "production", target: "node" },
    commit: await resolveCommit(),
    compression: deliveryCompressionSettings,
    createdAt: new Date().toISOString(),
    environment: { arch: arch(), nodeVersion: process.version, platform: platform() },
    fixtures,
    version: 1,
  };
}

async function measureFixture(fixture: ClientDeliveryFixture): Promise<ClientDeliveryFixtureReport> {
  const project = await materializeClientDeliveryFixture(fixture, workDir);
  await buildApp({
    appDir: project.appDir,
    outDir: project.outDir,
    projectRoot: project.projectRoot,
  });

  const clientDir = join(project.outDir, "client");
  const manifest = JSON.parse(
    await readFile(join(clientDir, "manifest.json"), "utf8"),
  ) as BrowserDeliveryManifest;
  const html = await collectHtml(project.outDir, [
    fixture.initialPath,
    ...fixture.measuredHtmlPaths,
  ]);
  const delivery = await measureBrowserDelivery({
    clientDir,
    html: { source: html.get(fixture.initialPath) ?? "" },
    initialIncludesNavigationRuntime: true,
    initialPath: fixture.initialPath,
    manifest,
    ...(fixture.sessionVisits.length === 0
      ? {}
      : {
          session: {
            includeNavigationRuntime: true,
            visits: fixture.sessionVisits.map((path) => ({ path })),
          },
        }),
  });
  const htmlReports: ClientDeliveryHtmlReport[] = [];

  for (const [path, source] of html) {
    const measured = await measureBrowserDelivery({
      clientDir,
      html: { source },
      initialPath: fixture.initialPath,
      manifest,
    });

    if (measured.html !== undefined) {
      htmlReports.push({
        brotliEstimateBytes: measured.html.brotliEstimateBytes,
        gzipEstimateBytes: measured.html.gzipEstimateBytes,
        inlineScriptRawBytes: measured.html.inlineScriptRawBytes,
        path,
        queryDataRawBytes: measured.html.queryDataRawBytes,
        rawBytes: measured.html.rawBytes,
        restorationRawBytes: measured.html.restorationRawBytes,
        routerMetadataRawBytes: measured.html.routerMetadataRawBytes,
      });
    }
  }

  const initialRoute = manifest.routes.find(
    (route: BrowserDeliveryRouteManifest) => route.path === fixture.initialPath,
  );

  return {
    description: fixture.description,
    html: htmlReports,
    initial: {
      brotliEstimateBytes: delivery.initial.brotliEstimateBytes,
      gzipEstimateBytes: delivery.initial.gzipEstimateBytes,
      paths: delivery.initial.paths,
      rawBytes: delivery.initial.rawBytes,
    },
    name: fixture.name,
    navigationRuntimeDelivered: initialRoute?.navigation === true,
    routeVisitCount: delivery.session?.routeVisitCount ?? 1,
    ...(delivery.session === undefined
      ? {}
      : {
          sessionCumulative: {
            brotliEstimateBytes: delivery.session.cumulative.brotliEstimateBytes,
            gzipEstimateBytes: delivery.session.cumulative.gzipEstimateBytes,
            paths: delivery.session.cumulative.paths,
            rawBytes: delivery.session.cumulative.rawBytes,
          },
        }),
    unavailablePaths: [
      ...delivery.initial.unavailablePaths,
      ...(delivery.session?.cumulative.unavailablePaths ?? []),
    ],
    visits: (delivery.session?.visits ?? []).map((visit) => ({
      brotliEstimateBytes: visit.brotliEstimateBytes,
      fetchedPaths: visit.fetchedPaths,
      gzipEstimateBytes: visit.gzipEstimateBytes,
      path: visit.path,
      paths: visit.paths,
      rawBytes: visit.rawBytes,
    })),
  };
}

async function collectHtml(
  outDir: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  // Host trust is irrelevant for a loopback measurement server; leaving it implicit keeps the
  // fixture identical to the default production server the router documents.
  const server = await startServer({ outDir, port: 0 });
  const documents = new Map<string, string>();

  try {
    for (const path of paths) {
      const response = await fetch(new URL(path, server.url));

      if (!response.ok) {
        throw new Error(
          `Fixture route ${path} responded with ${response.status}: ${(await response.text()).slice(0, 500)}`,
        );
      }

      documents.set(path, await response.text());
    }
  } finally {
    await server.close();
  }

  return documents;
}

async function resolveCommit(): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}
