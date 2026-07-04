// mreact-app-router adapter。同一 shape (1000 spans) の fixture app を
// `buildApp()` → `startServer()` で立て、HTTP fetch で SSR / streaming を測る。
// HTTP 越し計測にすることで、後述の Next.js adapter (`getRequestHandler` を
// http.Server に乗せる) と round-trip overhead が揃い fair comparison になる。
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  buildApp,
  createMemoryRouteCache,
  packageCloudflarePagesArtifact,
  startDevServer,
  startServer,
} from "../../../packages/router/dist/index.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../../../packages/router/dist/index.js";
import type { AppFrameworkAdapter } from "../types.js";
import { buildDynamicAttrCells, type DynamicAttrCell } from "../dynamic-attr-cells.js";
import { measureBuildOutputGzipBytes } from "../build-output-size.js";
import { createVariantFixtureCache } from "../variant-fixture-cache.js";
import {
  measureClientNavigation,
  measureBackForwardRestore,
  measureFirstInteractionAfterNetworkIdle,
  measureFirstInteractionFromDomContentLoaded,
  measureHydrationIslands,
  measureInitialPageLoadBeforeInteraction,
  measureLoaderClientNavigation,
  measureRouteJavaScriptGzipBytes,
  measureSecondInteractionLatency,
} from "../browser-probes.js";

void {} as DynamicAttrCell;

interface ServerHandle {
  close(): Promise<void>;
  url: string;
}

interface FixtureState {
  rootDir: string;
  server: ServerHandle;
}

let rootDir: string | undefined;
let server: ServerHandle | undefined;
let currentNodeCount = 0;
let currentLogEnabled = false;
let currentReactCompat = false;
let logEventCount = 0;
const NODE_COUNT_DEFAULT = 1000;
const primaryFixtureStates = new Map<string, FixtureState>();
const primaryFixtureLifecycle = createVariantFixtureCache<string, { close(): Promise<void> }>();
let browserRootDir: string | undefined;
let browserServer: ServerHandle | undefined;
let browserLogEnabled = false;
let browserReactCompat = false;
const browserFixtureStates = new Map<string, FixtureState>();
const browserFixtureLifecycle = createVariantFixtureCache<string, { close(): Promise<void> }>();
let coldStartRootDir: string | undefined;
let coldStartOutDir: string | undefined;
let coldStartReactCompat = false;
const concurrentLoadResults = new Map<string, Promise<ConcurrentLoadResult>>();
const routeScaleResults = new Map<string, Promise<RouteScaleResult>>();

interface ConcurrentLoadResult {
  p99Ms: number;
  rssDeltaBytes: number;
  throughputOps: number;
}

interface RouteScaleResult {
  buildTimeMs: number;
  coldStartMs: number;
  matchLatencyMs: number;
  rootDir: string;
  rssDeltaBytes: number;
}

function fixtureKey(nodeCount: number, logEnabled: boolean, reactCompat: boolean): string {
  return `${nodeCount}\0${logEnabled ? "log" : "nolog"}\0${reactCompat ? "compat" : "native"}`;
}

function browserFixtureKey(logEnabled: boolean, reactCompat: boolean): string {
  return `${logEnabled ? "log" : "nolog"}\0${reactCompat ? "compat" : "native"}`;
}

async function ensureFixture(
  nodeCount: number,
  logEnabled: boolean,
  reactCompat: boolean,
): Promise<string> {
  const key = fixtureKey(nodeCount, logEnabled, reactCompat);
  const cached = primaryFixtureStates.get(key);
  if (cached !== undefined) {
    rootDir = cached.rootDir;
    server = cached.server;
    currentNodeCount = nodeCount;
    currentLogEnabled = logEnabled;
    currentReactCompat = reactCompat;
    return cached.server.url;
  }

  if (
    rootDir !== undefined &&
    currentNodeCount === nodeCount &&
    currentLogEnabled === logEnabled &&
    currentReactCompat === reactCompat &&
    server !== undefined
  ) {
    return server.url;
  }

  rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "stream-page"), { recursive: true });
  await mkdir(join(appDir, "static-page"), { recursive: true });

  const items = Array.from({ length: nodeCount }, (_, index) => index);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );

  await writeFile(
    join(appDir, "page.tsx"),
    spanPageSource(arrayLiteral),
  );

  await writeFile(
    join(appDir, "stream-page", "page.tsx"),
    `export const stream = true;
${spanPageSource(arrayLiteral)}`,
  );

  await writeFile(
    join(appDir, "static-page", "page.tsx"),
    `import { cacheControl } from "@reckona/mreact-router";
const items = ${arrayLiteral};
export default function Page() {
  cacheControl({ maxAge: 60 });
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  await mkdir(join(appDir, "real-stream-page"), { recursive: true });
  await writeFile(
    join(appDir, "real-stream-page", "page.tsx"),
    `export const stream = true;
const items = ${arrayLiteral};
function fetchItems() {
  return new Promise((resolve) => setTimeout(() => resolve(items), 50));
}
export default function Page() {
  const items_promise = fetchItems();
  return (
    <main>
      <Await value={items_promise} placeholder={<p>loading</p>}>
        {(data) => <ul>{data.map((index) => <span key={index}>{index}</span>)}</ul>}
      </Await>
    </main>
  );
}`,
  );

  // waterfall fixture: two independent async boundaries (each 50ms). A
  // framework that runs them in **parallel** finishes in ~50ms; one that
  // runs them **sequentially** (= waterfall) takes ~100ms.
  await mkdir(join(appDir, "waterfall-page"), { recursive: true });
  await writeFile(
    join(appDir, "waterfall-page", "page.tsx"),
    `export const stream = true;
function fetchA() {
  return new Promise((resolve) => setTimeout(() => resolve("A"), 50));
}
function fetchB() {
  return new Promise((resolve) => setTimeout(() => resolve("B"), 50));
}
export default function Page() {
  const a_promise = fetchA();
  const b_promise = fetchB();
  return (
    <main>
      <Await value={a_promise} placeholder={<p>loadingA</p>}>
        {(a) => <section data-a={a}>A:{a}</section>}
      </Await>
      <Await value={b_promise} placeholder={<p>loadingB</p>}>
        {(b) => <section data-b={b}>B:{b}</section>}
      </Await>
    </main>
  );
}`,
  );

  // dynamic-attribute heavy fixture: 200 cells × ~9 dynamic attrs/styles.
  // Several string values contain `<` `>` `&` `"` forcing HTML escape paths.
  // Exercises framework's per-attribute escape hot path (mreact compiler の
  // batch escape lowering 等の効果が見える case)。
  await mkdir(join(appDir, "data-grid"), { recursive: true });
  const cells = buildDynamicAttrCells(200);
  const cellsLiteral = JSON.stringify(cells);
  await writeFile(
    join(appDir, "data-grid", "page.tsx"),
    `const cells = ${cellsLiteral};
export default function Page() {
  return (
    <main>
      {cells.map((cell, i) => (
        <div
          key={i}
          class={"cell row-" + cell.row + " col-" + cell.col + " kind-" + cell.kind}
          data-row={cell.row}
          data-col={cell.col}
          data-kind={cell.kind}
          title={cell.title}
          aria-label={cell.label}
          style={{ "background-color": cell.bg, color: cell.fg }}
        >
          {cell.text}
        </div>
      ))}
    </main>
  );
}`,
  );

  await buildApp({ appDir, outDir });
  // Allow flipping the response sink strategy per bench run, e.g.
  //   MREACT_APP_ROUTER_SINK_STRATEGY=buffer pnpm bench:router
  const envStrategy = process.env["MREACT_APP_ROUTER_SINK_STRATEGY"];
  const sinkStrategy = envStrategy === "buffer" ? ("buffer" as const) : ("string" as const);
  server = await startServer({
    logger: logEnabled ? createBenchmarkLogger() : undefined,
    outDir,
    port: 0,
    routeCache: createMemoryRouteCache(),
    sinkStrategy,
  });
  currentNodeCount = nodeCount;
  currentLogEnabled = logEnabled;
  currentReactCompat = reactCompat;
  const createdRootDir = rootDir;
  const createdServer = server;
  primaryFixtureStates.set(key, { rootDir: createdRootDir, server: createdServer });
  await primaryFixtureLifecycle.getOrCreate(key, async () => ({
    close: async () => {
      await createdServer.close();
      await rm(createdRootDir, { force: true, recursive: true });
    },
  }));
  return createdServer.url;
}

async function ensureBrowserFixture(logEnabled: boolean, reactCompat: boolean): Promise<string> {
  const key = browserFixtureKey(logEnabled, reactCompat);
  const cached = browserFixtureStates.get(key);
  if (cached !== undefined) {
    browserRootDir = cached.rootDir;
    browserServer = cached.server;
    browserLogEnabled = logEnabled;
    browserReactCompat = reactCompat;
    return cached.server.url;
  }

  if (
    browserRootDir !== undefined &&
    browserServer !== undefined &&
    browserLogEnabled === logEnabled &&
    browserReactCompat === reactCompat
  ) {
    return browserServer.url;
  }

  browserRootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-browser-"));
  const appDir = join(browserRootDir, "app");
  const outDir = join(browserRootDir, ".mreact");
  await mkdir(join(appDir, "target"), { recursive: true });

  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    reactCompat
      ? `import { Link } from "@reckona/mreact-router/link";
import { Counter } from "./Counter.compat";
export default function Page() {
  return (
    <main>
      <Counter />
      <Link href="/target" prefetch="viewport">Details</Link>
    </main>
  );
}`
      : `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return (
    <main>
      <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>
      <a href="/target" data-mreact-prefetch="viewport">Details</a>
    </main>
    );
  }`,
  );
  if (reactCompat) {
    await writeFile(
      join(appDir, "Counter.compat.tsx"),
      `import { useState } from "@reckona/mreact-compat";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((value) => value + 1)}>compat count: {count}</button>;
}`,
    );
  }
  await writeFile(
    join(appDir, "target", "page.tsx"),
    `export function loader() {
  return { label: "loaded-target" };
}

export default function Page(props) {
  return <main><h1>Navigation target</h1><p>loader:{props.data.label}</p></main>;
}`,
  );

  await buildApp({ appDir, outDir });
  const envStrategy = process.env["MREACT_APP_ROUTER_SINK_STRATEGY"];
  const sinkStrategy = envStrategy === "buffer" ? ("buffer" as const) : ("string" as const);
  browserServer = await startServer({
    logger: logEnabled ? createBenchmarkLogger() : undefined,
    outDir,
    port: 0,
    sinkStrategy,
  });
  browserLogEnabled = logEnabled;
  browserReactCompat = reactCompat;
  const createdRootDir = browserRootDir;
  const createdServer = browserServer;
  browserFixtureStates.set(key, { rootDir: createdRootDir, server: createdServer });
  await browserFixtureLifecycle.getOrCreate(key, async () => ({
    close: async () => {
      await createdServer.close();
      await rm(createdRootDir, { force: true, recursive: true });
    },
  }));
  return createdServer.url;
}

function createMreactAppRouterAdapter(options: {
  logEnabled: boolean;
  name: AppFrameworkAdapter["name"];
  reactCompat?: boolean;
}): AppFrameworkAdapter {
  const { logEnabled, name, reactCompat = false } = options;

  return {
    name,
    version: "workspace",
    async setup() {
      // fixture is built lazily on first call
    },
    getServerUrl(): string | null {
      return server?.url ?? null;
    },
    async teardown() {
      await primaryFixtureLifecycle.closeAll();
      primaryFixtureStates.clear();
      rootDir = undefined;
      server = undefined;
      currentNodeCount = 0;
      currentLogEnabled = false;
      currentReactCompat = false;

      await browserFixtureLifecycle.closeAll();
      browserFixtureStates.clear();
      browserRootDir = undefined;
      browserServer = undefined;
      browserLogEnabled = false;
      browserReactCompat = false;

      if (coldStartRootDir !== undefined) {
        await rm(coldStartRootDir, { force: true, recursive: true });
        coldStartRootDir = undefined;
        coldStartOutDir = undefined;
        coldStartReactCompat = false;
      }
      concurrentLoadResults.clear();
      for (const result of await Promise.allSettled(routeScaleResults.values())) {
        if (result.status === "fulfilled") {
          await rm(result.value.rootDir, { force: true, recursive: true });
        }
      }
      routeScaleResults.clear();
    },
    async renderToString(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled, reactCompat);
      const response = await fetch(`${url}/`);
      const html = await response.text();

      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderToString did not include the last node");
      }

      return html;
    },
    async renderToStream(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled, reactCompat);
      const response = await fetch(`${url}/stream-page`);
      const html = await response.text();

      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderToStream did not include the last node");
      }

      return html;
    },
    async renderToRealStream(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled, reactCompat);
      const response = await fetch(`${url}/real-stream-page`);
      const html = await response.text();
      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderToRealStream did not include the last node");
      }
      return html;
    },
    async renderWaterfall(): Promise<string> {
      const url = await ensureFixture(NODE_COUNT_DEFAULT, logEnabled, reactCompat);
      const response = await fetch(`${url}/waterfall-page`);
      const html = await response.text();
      if (!html.includes(`data-a="A"`) || !html.includes(`data-b="B"`)) {
        throw new Error("mreact-app-router renderWaterfall did not include both branches");
      }
      return html;
    },
    async renderStaticCachedRoute(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled, reactCompat);
      const response = await fetch(`${url}/static-page`);
      const html = await response.text();
      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderStaticCachedRoute did not include the last node");
      }
      return html;
    },
    async renderDynamicAttrGrid(cellCount: number): Promise<string> {
      const url = await ensureFixture(1000, logEnabled, reactCompat);
      const response = await fetch(`${url}/data-grid`);
      const html = await response.text();
      // Sanity check: last cell index must appear in escaped text.
      if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
        throw new Error(
          "mreact-app-router renderDynamicAttrGrid did not include the last escaped text",
        );
      }
      return html;
    },
    async renderDynamicRoute(): Promise<string> {
      // Ensure this variant's own fixture; the generic runner probe reads the
      // module-level server shared across all mreact variants and can measure
      // whichever variant fixture was started last.
      const url = await ensureFixture(1000, logEnabled, reactCompat);
      const response = await fetch(`${url}/data-grid?user=199&tab=activity`);
      const html = await response.text();

      if (!html.includes("Item #199 &lt;data")) {
        throw new Error("mreact-app-router renderDynamicRoute did not include expected data");
      }

      return html;
    },
    async measureServerOnlyClientBundleBytes(): Promise<number> {
      if (reactCompat) {
        const url = await ensureFixture(NODE_COUNT_DEFAULT, logEnabled, reactCompat);
        return measureRouteJavaScriptGzipBytes(url);
      }
      const url = await ensureFixture(NODE_COUNT_DEFAULT, logEnabled, reactCompat);
      return measureRouteJavaScriptGzipBytes(url);
    },
    async measureInteractiveClientBundleBytes(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureRouteJavaScriptGzipBytes(url, { assertInteractive: true });
    },
    async measureInteractiveClientBundleMinimalBytes(): Promise<number> {
      if (reactCompat) {
        return measureReactCompatInteractiveBundle({ clientNavigation: false });
      }
      // Same component but opting out of the SPA navigation runtime via
      // `export const clientNavigation = false` (issue 058). Represents the
      // minimum framework surface for an interactive page that does not need
      // SPA navigation / link prefetch — equivalent posture to Marko Run's
      // default (no navigation runtime).
      return measureInteractiveBundle({ clientNavigation: false });
    },
    async measureClientNavigationMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureClientNavigation(url);
    },
    async measureLoaderClientNavigationMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureLoaderClientNavigation(url);
    },
    async measureBackForwardRestoreMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureBackForwardRestore(url);
    },
    async measureInitialPageLoadBeforeInteractionMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureInitialPageLoadBeforeInteraction(url);
    },
    async measureFirstInteractionFromDomContentLoadedMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureFirstInteractionFromDomContentLoaded(url);
    },
    async measureFirstInteractionAfterNetworkIdleMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureFirstInteractionAfterNetworkIdle(url);
    },
    async measureSecondInteractionLatencyMs(): Promise<number> {
      const url = await ensureBrowserFixture(logEnabled, reactCompat);
      return measureSecondInteractionLatency(url);
    },
    async measureConcurrentRequestThroughputOps(): Promise<number> {
      return (await ensureConcurrentLoadResult(logEnabled, reactCompat)).throughputOps;
    },
    async measureConcurrentRequestP99Ms(): Promise<number> {
      return (await ensureConcurrentLoadResult(logEnabled, reactCompat)).p99Ms;
    },
    async measureConcurrentRequestRssDeltaBytes(): Promise<number> {
      return (await ensureConcurrentLoadResult(logEnabled, reactCompat)).rssDeltaBytes;
    },
    async measureHydration100IslandsMs(): Promise<number> {
      const url = await createHydrationFixture(logEnabled, reactCompat, 100);
      return measureHydrationIslands(url, 100);
    },
    async measureDevColdStartMs(): Promise<number> {
      return measureDevServerColdStart(reactCompat);
    },
    async measureDevFirstRequestLatencyMs(): Promise<number> {
      return measureDevServerFirstRequest(reactCompat);
    },
    async measureDevHmrUpdateLatencyMs(): Promise<number> {
      return measureDevServerHmrUpdate(reactCompat);
    },
    async measureServerColdStartMs(): Promise<number> {
      const outDir = await ensureColdStartFixture(reactCompat);
      return measureServerColdStart(outDir, { logEnabled });
    },
    async measureSsrHtmlGzipBytes(): Promise<number> {
      const url = await ensureFixture(NODE_COUNT_DEFAULT, logEnabled, reactCompat);
      const response = await fetch(`${url}/`);
      const html = await response.text();

      if (!html.includes(`<span>${NODE_COUNT_DEFAULT - 1}</span>`)) {
        throw new Error("mreact-app-router SSR HTML gzip probe did not include the last node");
      }

      return gzipSync(html).length;
    },
    async measureRouteScale1000MatchLatencyMs(): Promise<number> {
      return (await ensureRouteScaleResult(logEnabled, reactCompat)).matchLatencyMs;
    },
    async measureRouteScale1000ColdStartMs(): Promise<number> {
      return (await ensureRouteScaleResult(logEnabled, reactCompat)).coldStartMs;
    },
    async measureRouteScale1000BuildTimeMs(): Promise<number> {
      return (await ensureRouteScaleResult(logEnabled, reactCompat)).buildTimeMs;
    },
    async measureRouteScale1000RssDeltaBytes(): Promise<number> {
      return measureRouteScaleRssInChild(logEnabled, reactCompat);
    },
    async measureServerActionPostRoundtripMs(): Promise<number> {
      return measureServerActionPostRoundtrip();
    },
    async measureNestedLayoutsDepth5Ms(): Promise<number> {
      return measureNestedLayoutsDepth5(logEnabled, reactCompat);
    },
    async measureCloudflareWorkerLatencyMs(): Promise<number> {
      return measureCloudflareWorkerLatency(reactCompat);
    },
    async measureBuildOutputGzipBytes(): Promise<number> {
      await ensureFixture(NODE_COUNT_DEFAULT, logEnabled, reactCompat);

      if (rootDir === undefined) {
        throw new Error("mreact-app-router fixture not initialized");
      }

      return measureBuildOutputGzipBytes([join(rootDir, ".mreact")]);
    },
  };
}

async function ensureConcurrentLoadResult(
  logEnabled: boolean,
  reactCompat: boolean,
): Promise<ConcurrentLoadResult> {
  const key = browserFixtureKey(logEnabled, reactCompat);
  const cached = concurrentLoadResults.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const created = measureConcurrentLoad(logEnabled, reactCompat);
  concurrentLoadResults.set(key, created);
  return created;
}

async function measureConcurrentLoad(
  logEnabled: boolean,
  reactCompat: boolean,
): Promise<ConcurrentLoadResult> {
  const url = await ensureFixture(NODE_COUNT_DEFAULT, logEnabled, reactCompat);
  const totalRequests = 200;
  const concurrency = 100;
  const latencies: number[] = [];
  const beforeRss = process.memoryUsage().rss;
  const startedAt = performance.now();
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= totalRequests) {
          return;
        }

        const requestStartedAt = performance.now();
        const response = await fetch(`${url}/static-page`);
        const html = await response.text();
        latencies.push(performance.now() - requestStartedAt);

        if (!html.includes(`<span>${NODE_COUNT_DEFAULT - 1}</span>`)) {
          throw new Error("concurrent load response did not include the last node");
        }
      }
    }),
  );

  const elapsedMs = performance.now() - startedAt;
  const afterRss = process.memoryUsage().rss;

  return {
    p99Ms: percentile(latencies, 0.99),
    rssDeltaBytes: Math.max(0, afterRss - beforeRss),
    throughputOps: totalRequests / (elapsedMs / 1000),
  };
}

async function createHydrationFixture(
  logEnabled: boolean,
  reactCompat: boolean,
  islandCount: number,
): Promise<string> {
  const fixtureDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-hydration-"));
  const appDir = join(fixtureDir, "app");
  const outDir = join(fixtureDir, ".mreact");

  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );

  if (reactCompat) {
    await writeFile(
      join(appDir, "Counter.compat.tsx"),
      `import { useState } from "@reckona/mreact-compat/hooks";
export function Counter(props) {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((value) => value + 1)}>island {props.index}: {count}</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./Counter.compat";
const items = Array.from({ length: ${islandCount} }, (_unused, index) => index);
export default function Page() {
  return <main>{items.map((index) => <Counter key={index} index={index} />)}</main>;
}`,
    );
  } else {
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
const items = Array.from({ length: ${islandCount} }, (_unused, index) => index);
export default function Page() {
  const counts = items.map(() => cell(0));
  return <main>{items.map((index) => <button key={index} type="button" onClick={() => counts[index].set(value => value + 1)}>island {index}: {counts[index].get()}</button>)}</main>;
}`,
    );
  }

  await buildApp({ appDir, outDir });
  const server = await startServer({
    logger: logEnabled ? createBenchmarkLogger() : undefined,
    outDir,
    port: 0,
  });

  return trackOneShotServer(fixtureDir, server);
}

async function measureDevServerColdStart(reactCompat: boolean): Promise<number> {
  const fixture = await createDevFixture(reactCompat, "dev-ready");
  const startedAt = performance.now();
  const server = await startDevServer({ appDir: fixture.appDir, port: 0 });

  try {
    return performance.now() - startedAt;
  } finally {
    await server.close();
    await rm(fixture.rootDir, { force: true, recursive: true });
  }
}

async function measureDevServerFirstRequest(reactCompat: boolean): Promise<number> {
  const fixture = await createDevFixture(reactCompat, "dev-first");
  const server = await startDevServer({ appDir: fixture.appDir, port: 0 });

  try {
    const startedAt = performance.now();
    const response = await fetch(server.url);
    const html = await response.text();

    if (!html.includes("dev-first")) {
      throw new Error("dev first request did not include expected content");
    }

    return performance.now() - startedAt;
  } finally {
    await server.close();
    await rm(fixture.rootDir, { force: true, recursive: true });
  }
}

async function measureDevServerHmrUpdate(reactCompat: boolean): Promise<number> {
  const fixture = await createDevFixture(reactCompat, "hmr-initial");
  const server = await startDevServer({ appDir: fixture.appDir, port: 0 });

  try {
    await fetch(server.url);
    const startedAt = performance.now();
    await writeDevPage(fixture.appDir, reactCompat, "hmr-next");

    for (;;) {
      const response = await fetch(server.url);
      const html = await response.text();

      if (html.includes("hmr-next")) {
        return performance.now() - startedAt;
      }

      if (performance.now() - startedAt > 10_000) {
        throw new Error("dev HMR update probe timed out");
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    await server.close();
    await rm(fixture.rootDir, { force: true, recursive: true });
  }
}

async function createDevFixture(
  reactCompat: boolean,
  label: string,
): Promise<{ appDir: string; rootDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-dev-"));
  const appDir = join(rootDir, "app");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  await writeDevPage(appDir, reactCompat, label);
  return { appDir, rootDir };
}

async function writeDevPage(appDir: string, reactCompat: boolean, label: string): Promise<void> {
  await writeFile(
    join(appDir, "page.tsx"),
    reactCompat
      ? `import { createElement, renderToString } from "@reckona/mreact-compat";
export default function Page() {
  return renderToString(() => createElement("main", null, ${JSON.stringify(label)}));
}`
      : `export default function Page() {
  return <main>${label}</main>;
}`,
  );
}

async function ensureRouteScaleResult(
  logEnabled: boolean,
  _reactCompat: boolean,
): Promise<RouteScaleResult> {
  const key = `${logEnabled ? "log" : "nolog"}\0server`;
  const cached = routeScaleResults.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const created = measureRouteScale(logEnabled);
  routeScaleResults.set(key, created);
  return created;
}

async function measureRouteScale(logEnabled: boolean): Promise<RouteScaleResult> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-route-scale-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  const routeCount = 1_000;
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );

  for (let index = 0; index < routeCount; index += 1) {
    const routeDir = join(appDir, `route-${index}`);
    await mkdir(routeDir, { recursive: true });
    await writeFile(
      join(routeDir, "page.tsx"),
      `export default function Page() {
  return <main>route:${index}</main>;
}`,
    );
  }

  const buildStartedAt = performance.now();
  await buildApp({ appDir, outDir, targets: ["node"] });
  const buildTimeMs = performance.now() - buildStartedAt;
  const coldStartMs = await measureServerColdStart(outDir, { logEnabled });
  const server = await startServer({
    logger: logEnabled ? createBenchmarkLogger() : undefined,
    outDir,
    port: 0,
  });

  try {
    const matchStartedAt = performance.now();
    const response = await fetch(`${server.url}/route-999`);
    const html = await response.text();
    const matchLatencyMs = performance.now() - matchStartedAt;

    if (!html.includes("route:999")) {
      throw new Error("route scale probe did not include the last route");
    }

    return {
      buildTimeMs,
      coldStartMs,
      matchLatencyMs,
      rootDir,
      rssDeltaBytes: 0,
    };
  } finally {
    await server.close();
  }
}

async function measureRouteScaleRssInChild(
  logEnabled: boolean,
  _reactCompat: boolean,
): Promise<number> {
  const script = `
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, startServer } from ${JSON.stringify(join(process.cwd(), "packages/router/dist/index.js"))};

const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-route-rss-"));
const appDir = join(rootDir, "app");
const outDir = join(rootDir, ".mreact");
const routeCount = 1000;
const beforeRss = process.memoryUsage().rss;

try {
  await mkdir(appDir, { recursive: true });
  await writeFile(join(appDir, "layout.tsx"), "export default function Layout() {\\n  return <html lang=\\"en\\"><body><Slot /></body></html>;\\n}\\n");
  for (let index = 0; index < routeCount; index += 1) {
    const routeDir = join(appDir, \`route-\${index}\`);
    await mkdir(routeDir, { recursive: true });
    await writeFile(join(routeDir, "page.tsx"), \`export default function Page() {\\n  return <main>route:\${index}</main>;\\n}\\n\`);
  }
  await buildApp({ appDir, outDir, targets: ["node"] });
  const logger = process.env.MREACT_BENCH_LOG_ENABLED === "1" ? { info() {}, error() {} } : undefined;
  const server = await startServer({ logger, outDir, port: 0 });
  try {
    const response = await fetch(\`\${server.url}/route-999\`);
    const html = await response.text();
    if (!html.includes("route:999")) {
      throw new Error("route scale RSS probe did not include the last route");
    }
    console.log(JSON.stringify({ rssDeltaBytes: Math.max(0, process.memoryUsage().rss - beforeRss) }));
  } finally {
    await server.close();
  }
} finally {
  await rm(rootDir, { force: true, recursive: true });
}
`;

  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    env: {
      ...process.env,
      ...(logEnabled ? { MREACT_BENCH_LOG_ENABLED: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return waitForRouteScaleRss(child);
}

async function waitForRouteScaleRss(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      cleanup();
      child.kill("SIGTERM");
      reject(new Error(`mreact route-scale RSS child timed out\n${stderr}`));
    }, 60_000);

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onStdout = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim().startsWith("{")) {
          continue;
        }

        try {
          const parsed = JSON.parse(line) as { rssDeltaBytes?: unknown };
          if (typeof parsed.rssDeltaBytes === "number") {
            cleanup();
            resolve(parsed.rssDeltaBytes);
          }
        } catch {
          // Keep waiting for a complete JSON line.
        }
      }
    };
    const onStderr = (chunk: Buffer): void => {
      stderr += chunk.toString("utf8");
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`mreact route-scale RSS child exited before reporting: ${code}\n${stderr}`));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
    child.on("error", onError);
  }).finally(async () => {
    child.kill("SIGTERM");
    await waitForChildExit(child);
  });
}

async function measureServerActionPostRoundtrip(): Promise<number> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-action-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  await writeFile(
    join(appDir, "actions.ts"),
    `"use server";

export function save(formData) {
  return { title: String(formData.get("title")) };
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `import { save } from "./actions";
export default function Page() {
  return <main><form action={save}><input name="title" value="Benchmark" /><button type="submit">Save</button></form></main>;
}`,
  );

  try {
    await buildApp({ appDir, outDir, targets: ["node"] });
    const server = await startServer({ outDir, port: 0 });

    try {
      const pageResponse = await fetch(server.url);
      const html = await pageResponse.text();
      const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
      const body = new URLSearchParams({
        __mreact_action_nonce: extractInputValue(html, "__mreact_action_nonce"),
        __mreact_action_token: extractInputValue(html, "__mreact_action_token"),
        __mreact_csrf: extractInputValue(html, "__mreact_csrf"),
        __mreact_export_name: extractInputValue(html, "__mreact_export_name"),
        __mreact_module_id: extractInputValue(html, "__mreact_module_id"),
        title: "Benchmark",
      });
      const startedAt = performance.now();
      const response = await fetch(`${server.url}/_mreact/actions`, {
        body,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
          origin: server.url,
          referer: server.url,
        },
        method: "POST",
      });
      const json = (await response.json()) as { ok?: boolean; value?: { title?: string } };
      const duration = performance.now() - startedAt;

      if (json.ok !== true || json.value?.title !== "Benchmark") {
        throw new Error("server action POST probe did not return expected JSON");
      }

      return duration;
    } finally {
      await server.close();
    }
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function measureNestedLayoutsDepth5(
  logEnabled: boolean,
  reactCompat: boolean,
): Promise<number> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-nested-layouts-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );

  let current = appDir;
  for (let depth = 1; depth <= 5; depth += 1) {
    current = join(current, `level-${depth}`);
    await mkdir(current, { recursive: true });
    await writeFile(
      join(current, "layout.tsx"),
      `export default function Layout() {
  return <section data-depth="${depth}"><Slot /></section>;
}`,
    );
  }
  await writeFile(
    join(current, "page.tsx"),
    reactCompat
      ? reactCompatTextPageSource("nested-depth-5")
      : `export default function Page() {
  return <main>nested-depth-5</main>;
}`,
  );

  try {
    await buildApp({ appDir, outDir, targets: ["node"] });
    const server = await startServer({
      logger: logEnabled ? createBenchmarkLogger() : undefined,
      outDir,
      port: 0,
    });

    try {
      const startedAt = performance.now();
      const response = await fetch(`${server.url}/level-1/level-2/level-3/level-4/level-5`);
      const html = await response.text();
      const duration = performance.now() - startedAt;

      if (!html.includes("nested-depth-5") || !html.includes(`data-depth="5"`)) {
        throw new Error("nested layout probe did not include expected depth");
      }

      return duration;
    } finally {
      await server.close();
    }
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function measureCloudflareWorkerLatency(reactCompat: boolean): Promise<number> {
  const tempParentDir = join(process.cwd(), "benchmarks", "router", ".tmp");
  await mkdir(tempParentDir, { recursive: true });
  const rootDir = await mkdtemp(join(tempParentDir, "cloudflare-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    reactCompat
      ? reactCompatTextPageSource("cloudflare-worker")
      : `export default function Page() {
  return <main>cloudflare-worker</main>;
}`,
  );

  try {
    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const pagesOutDir = join(rootDir, "pages");
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const workerCode = await readFile(join(pagesOutDir, "_worker.js"), "utf8");
    return measureCloudflareModuleFallback(workerCode);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function measureCloudflareModuleFallback(workerCode: string): Promise<number> {
  const module = (await import(
    `data:text/javascript,${encodeURIComponent(workerCode)}`
  )) as {
    default?: {
      fetch?: (
        request: Request,
        env: Record<string, unknown>,
        context: { passThroughOnException(): void; waitUntil(promise: Promise<unknown>): void },
      ) => Promise<Response> | Response;
    };
  };
  const fetchHandler = module.default?.fetch;

  if (fetchHandler === undefined) {
    throw new Error("Cloudflare module fallback did not expose default.fetch");
  }

  const startedAt = performance.now();
  const response = await fetchHandler(new Request("http://local.test/"), {}, {
    passThroughOnException() {},
    waitUntil() {},
  });
  const html = await response.text();
  const duration = performance.now() - startedAt;

  if (!html.includes("cloudflare-worker")) {
    throw new Error("Cloudflare module fallback probe did not include expected content");
  }

  return duration;
}

function reactCompatTextPageSource(text: string): string {
  return `import { createElement, renderToString } from "@reckona/mreact-compat";
export default function Page() {
  return renderToString(() => createElement("main", null, ${JSON.stringify(text)}));
}`;
}

function extractInputValue(html: string, name: string): string {
  const pattern = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i");
  const match = pattern.exec(html);

  if (match?.[1] === undefined) {
    throw new Error(`server action probe could not find ${name}`);
  }

  return match[1];
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));

  return sorted[index]!;
}

async function trackOneShotServer(rootDir: string, server: ServerHandle): Promise<string> {
  const url = server.url;
  const dispose = async (): Promise<void> => {
    await server.close();
    await rm(rootDir, { force: true, recursive: true });
  };
  await browserFixtureLifecycle.getOrCreate(`oneshot:${rootDir}`, async () => ({ close: dispose }));
  return url;
}

function createBenchmarkLogger(): AppRouterLogger {
  const onEvent = (event: AppRouterLogEvent): void => {
    logEventCount += event.type.length;
  };

  return {
    error: onEvent,
    info: onEvent,
  };
}

export const mreactAppRouterAdapter = createMreactAppRouterAdapter({
  logEnabled: false,
  name: "mreact-app-router",
});

export const mreactAppRouterReactCompatAdapter = createMreactAppRouterAdapter({
  logEnabled: false,
  name: "mreact-app-router+mreact react-compat",
  reactCompat: true,
});

export const mreactAppRouterLogEnabledAdapter = createMreactAppRouterAdapter({
  logEnabled: true,
  name: "mreact-app-router+log enabled",
});

function spanPageSource(arrayLiteral: string): string {
  return `const items = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`;
}

function reactCompatSpanPageSource(arrayLiteral: string): string {
  return `import { createElement, renderToString } from "@reckona/mreact-compat";
const items = ${arrayLiteral};
function View() {
  return createElement("main", null, items.map((index) => createElement("span", { key: index }, index)));
}
export default function Page() {
  return renderToString(View);
}`;
}

async function measureInteractiveBundle(options: { clientNavigation: boolean }): Promise<number> {
  const interactiveDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-client-"));
  const interactiveApp = join(interactiveDir, "app");
  const interactiveOut = join(interactiveDir, ".mreact");

  try {
    await mkdir(interactiveApp, { recursive: true });
    await writeFile(
      join(interactiveApp, "layout.tsx"),
      `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
    );
    const hint = options.clientNavigation ? "" : `export const clientNavigation = false;\n`;
    await writeFile(
      join(interactiveApp, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
${hint}export default function Page() {
  const count = cell(0);
  return <main><button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button></main>;
}`,
    );

    await buildApp({ appDir: interactiveApp, outDir: interactiveOut });
    const manifestRaw = await readFile(join(interactiveOut, "client", "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw) as {
      routes: Array<{ client: boolean; script?: string; bytes?: number }>;
    };
    const clientRoute = manifest.routes.find(
      (entry) => entry.client === true && entry.script !== undefined,
    );

    if (clientRoute === undefined || clientRoute.script === undefined) {
      throw new Error("mreact-app-router fixture has no client route");
    }

    const code = await readFile(join(interactiveOut, "client", clientRoute.script));
    return gzipSync(code).length;
  } finally {
    await rm(interactiveDir, { force: true, recursive: true });
  }
}

async function measureReactCompatInteractiveBundle(options: {
  clientNavigation: boolean;
}): Promise<number> {
  const fixtureDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-react-compat-client-"));
  const appDir = join(fixtureDir, "app");
  const outDir = join(fixtureDir, ".mreact");

  try {
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./Counter.compat";
${options.clientNavigation ? "" : "export const clientNavigation = false;\n"}export default function Page() {
  return <main><Counter /></main>;
}`,
    );
    await writeFile(
      join(appDir, "Counter.compat.tsx"),
      `import { useState } from "@reckona/mreact-compat/hooks";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((value) => value + 1)}>{count}</button>;
}`,
    );

    await buildApp({ appDir, outDir });
    return sumClientBundleGzipBytes(outDir);
  } finally {
    await rm(fixtureDir, { force: true, recursive: true });
  }
}

async function sumClientBundleGzipBytes(outDir: string): Promise<number> {
  const manifestRaw = await readFile(join(outDir, "client", "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as {
    routes: Array<{ client: boolean; script?: string }>;
  };
  let total = 0;

  for (const route of manifest.routes) {
    if (route.client !== true || route.script === undefined) {
      continue;
    }

    const code = await readFile(join(outDir, "client", route.script));
    total += gzipSync(code).length;
  }

  return total;
}

async function ensureColdStartFixture(reactCompat: boolean): Promise<string> {
  if (coldStartOutDir !== undefined && coldStartReactCompat === reactCompat) {
    return coldStartOutDir;
  }

  if (coldStartRootDir !== undefined) {
    await rm(coldStartRootDir, { force: true, recursive: true });
    coldStartRootDir = undefined;
    coldStartOutDir = undefined;
    coldStartReactCompat = false;
  }

  coldStartRootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-cold-start-"));
  const appDir = join(coldStartRootDir, "app");
  coldStartOutDir = join(coldStartRootDir, ".mreact");
  await mkdir(join(appDir, "dynamic", "$id"), { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    reactCompat
      ? reactCompatSpanPageSource("[0]")
      : `export default function Page() {
  return <main>home</main>;
}`,
  );
  await writeFile(
    join(appDir, "dynamic", "$id", "page.tsx"),
    `export async function loader({ params }) {
  return { id: params.id };
}

export default function Page(props) {
  return <main>dynamic:{props.data.id}</main>;
}`,
  );

  await buildApp({ appDir, outDir: coldStartOutDir });
  coldStartReactCompat = reactCompat;
  return coldStartOutDir;
}

async function measureServerColdStart(
  outDir: string,
  options: { logEnabled: boolean },
): Promise<number> {
  const script = `
import { startServer } from ${JSON.stringify(join(process.cwd(), "packages/router/dist/index.js"))};
const logger = process.env.MREACT_BENCH_LOG_ENABLED === "1" ? { info() {}, error() {} } : undefined;
const server = await startServer({ logger, outDir: ${JSON.stringify(outDir)}, port: 0 });
console.log(JSON.stringify({ url: server.url }));
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
setInterval(() => {}, 2147483647);
`;
  const startedAt = performance.now();
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    env: {
      ...process.env,
      ...(options.logEnabled ? { MREACT_BENCH_LOG_ENABLED: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServerReady(child);
    return performance.now() - startedAt;
  } finally {
    child.kill("SIGTERM");
    await waitForChildExit(child);
  }
}

async function waitForServerReady(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      cleanup();
      child.kill("SIGTERM");
      reject(new Error(`mreact cold-start child timed out\n${stderr}`));
    }, 10_000);

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onStdout = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim().startsWith("{")) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as { url?: string };
          if (typeof parsed.url === "string") {
            cleanup();
            resolve(parsed.url);
          }
        } catch {
          // Keep waiting for a complete JSON line.
        }
      }
    };
    const onStderr = (chunk: Buffer): void => {
      stderr += chunk.toString("utf8");
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`mreact cold-start child exited before ready: ${code}\n${stderr}`));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
    child.on("error", onError);
  });
}

async function waitForChildExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
