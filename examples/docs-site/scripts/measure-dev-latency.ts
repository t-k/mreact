import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startDevServer,
  type AppRouterLogEvent,
  type AppRouterLogger,
  type StartDevServerOptions,
} from "@reckona/mreact-router";

interface AppProbeConfig {
  readonly label: string;
  readonly projectRoot: string;
  readonly requests: readonly RequestProbeConfig[];
}

interface RequestProbeConfig {
  readonly expectText: string;
  readonly path: string;
}

interface RequestProbeResult {
  readonly bodyBytes: number;
  readonly documentFirstMs: number;
  readonly documentWarmPhases: string;
  readonly documentWarmMs: number;
  readonly navigationFirstMs: number;
  readonly navigationWarmPhases: string;
  readonly navigationWarmMs: number;
  readonly path: string;
}

interface AppProbeResult {
  readonly label: string;
  readonly readyMs: number;
  readonly requests: readonly RequestProbeResult[];
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolveOption("--docs-root") ?? resolve(scriptDir, "..");
const appRouterRoot = resolveOption("--app-router-root") ?? resolve(scriptDir, "..", "..", "app-router");
const iterations = numericOption("--iterations") ?? 2;

const apps: readonly AppProbeConfig[] = [
  {
    label: "docs-site",
    projectRoot: docsRoot,
    requests: [
      { path: "/", expectText: "Mreact Docs" },
      { path: "/getting-started/", expectText: "Getting Started" },
      { path: "/guides/basics/", expectText: "Basics" },
      { path: "/benchmarks/", expectText: "Benchmarks" },
    ],
  },
  {
    label: "app-router",
    projectRoot: appRouterRoot,
    requests: [
      { path: "/", expectText: "mreact App Router" },
      { path: "/about/", expectText: "About" },
      { path: "/docs/", expectText: "Docs Overview" },
      { path: "/widgets/", expectText: "Component boundary" },
    ],
  },
];

const results: AppProbeResult[] = [];

for (const app of apps) {
  results.push(await measureApp(app));
}

printSummary(results);

async function measureApp(app: AppProbeConfig): Promise<AppProbeResult> {
  let server: Awaited<ReturnType<typeof startDevServer>> | undefined;
  const readyStartedAt = performance.now();
  const renderEvents: AppRouterLogEvent[] = [];
  const logger: AppRouterLogger = {
    debug(event) {
      if (event.type === "router:render:timing") {
        renderEvents.push(event);
      }
    },
  };

  try {
    server = await startDevServer({
      projectRoot: app.projectRoot,
      logger,
      port: 0,
    } satisfies StartDevServerOptions);
    const readyMs = performance.now() - readyStartedAt;
    const requests: RequestProbeResult[] = [];

    for (const request of app.requests) {
      requests.push(await measureRequest(server.url, request, renderEvents));
    }

    return { label: app.label, readyMs, requests };
  } finally {
    await server?.close();
  }
}

async function measureRequest(
  baseUrl: string,
  request: RequestProbeConfig,
  renderEvents: AppRouterLogEvent[],
): Promise<RequestProbeResult> {
  const documentMeasurements = await measureRepeatedFetch(baseUrl, request, {}, renderEvents);
  const navigationMeasurements = await measureRepeatedFetch(baseUrl, request, {
    headers: { "x-mreact-navigation": "1" },
  }, renderEvents);

  return {
    bodyBytes: documentMeasurements.bodyBytes,
    documentFirstMs: documentMeasurements.firstMs,
    documentWarmPhases: documentMeasurements.warmPhases,
    documentWarmMs: documentMeasurements.warmMs,
    navigationFirstMs: navigationMeasurements.firstMs,
    navigationWarmPhases: navigationMeasurements.warmPhases,
    navigationWarmMs: navigationMeasurements.warmMs,
    path: request.path,
  };
}

async function measureRepeatedFetch(
  baseUrl: string,
  request: RequestProbeConfig,
  init: RequestInit,
  renderEvents: AppRouterLogEvent[],
): Promise<{ bodyBytes: number; firstMs: number; warmMs: number; warmPhases: string }> {
  const timings: number[] = [];
  const phaseSummaries: string[] = [];
  let bodyBytes = 0;

  for (let index = 0; index < iterations; index += 1) {
    const eventStartIndex = renderEvents.length;
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${request.path}`, init);
    const body = await response.text();
    timings.push(performance.now() - startedAt);
    await new Promise((resolve) => setTimeout(resolve, 0));
    phaseSummaries.push(summarizePhases(renderEvents.slice(eventStartIndex), request.path));

    if (!response.ok) {
      throw new Error(`${request.path} returned ${response.status}`);
    }

    if (!body.includes(request.expectText)) {
      throw new Error(`${request.path} did not include expected text: ${request.expectText}`);
    }

    bodyBytes = Buffer.byteLength(body);
  }

  return {
    bodyBytes,
    firstMs: timings[0] ?? 0,
    warmPhases: phaseSummaries.at(-1) ?? "",
    warmMs: average(timings.slice(1)),
  };
}

function printSummary(results: readonly AppProbeResult[]): void {
  for (const app of results) {
    console.log(`\n${app.label} ready: ${formatMs(app.readyMs)}`);
    console.table(app.requests.map((request) => ({
      path: request.path,
      bytes: request.bodyBytes,
      documentFirst: formatMs(request.documentFirstMs),
      documentWarm: formatMs(request.documentWarmMs),
      documentWarmPhases: request.documentWarmPhases,
      navigationFirst: formatMs(request.navigationFirstMs),
      navigationWarm: formatMs(request.navigationWarmMs),
      navigationWarmPhases: request.navigationWarmPhases,
    })));
  }
}

function summarizePhases(events: readonly AppRouterLogEvent[], path: string): string {
  const timing = events.findLast((event) =>
    event.type === "router:render:timing" && normalizedPath(event.path) === normalizedPath(path)
  );

  if (timing === undefined || timing.type !== "router:render:timing") {
    return "";
  }

  return Object.entries(timing.phases)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([name, value]) => `${name}:${formatMs(value)}`)
    .join(" ");
}

function normalizedPath(path: string): string {
  return path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function numericOption(name: string): number | undefined {
  const raw = resolveOption(name);
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2) {
    throw new Error(`${name} must be a number greater than or equal to 2.`);
  }

  return Math.floor(parsed);
}

function resolveOption(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
