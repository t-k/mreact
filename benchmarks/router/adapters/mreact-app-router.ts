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
import { buildApp, startServer } from "../../../packages/router/dist/index.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../../../packages/router/dist/index.js";
import type { AppFrameworkAdapter } from "../types.js";
import { buildDynamicAttrCells, type DynamicAttrCell } from "../dynamic-attr-cells.js";
import { measureBuildOutputGzipBytes } from "../build-output-size.js";
import {
  measureClientNavigation,
  measureFirstInteractionAfterNetworkIdle,
  measureFirstInteractionFromDomContentLoaded,
  measureInitialPageLoadBeforeInteraction,
  measureRouteJavaScriptGzipBytes,
  measureSecondInteractionLatency,
} from "../browser-probes.js";

void {} as DynamicAttrCell;

interface ServerHandle {
  close(): Promise<void>;
  url: string;
}

let rootDir: string | undefined;
let server: ServerHandle | undefined;
let currentNodeCount = 0;
let currentLogEnabled = false;
let currentReactCompat = false;
let logEventCount = 0;
const NODE_COUNT_DEFAULT = 1000;
let browserRootDir: string | undefined;
let browserServer: ServerHandle | undefined;
let browserLogEnabled = false;
let browserReactCompat = false;
let coldStartRootDir: string | undefined;
let coldStartOutDir: string | undefined;
let coldStartReactCompat = false;

async function ensureFixture(
  nodeCount: number,
  logEnabled: boolean,
  reactCompat: boolean,
): Promise<string> {
  if (
    rootDir !== undefined &&
    currentNodeCount === nodeCount &&
    currentLogEnabled === logEnabled &&
    currentReactCompat === reactCompat &&
    server !== undefined
  ) {
    return server.url;
  }

  if (server !== undefined) {
    await server.close();
    server = undefined;
  }

  if (rootDir !== undefined) {
    await rm(rootDir, { force: true, recursive: true });
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
    reactCompat
      ? reactCompatSpanPageSource(arrayLiteral)
      : `const items = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  await writeFile(
    join(appDir, "stream-page", "page.tsx"),
    reactCompat
      ? `export const stream = true;\n${reactCompatSpanPageSource(arrayLiteral)}`
      : `export const stream = true;
const items = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  await writeFile(
    join(appDir, "static-page", "page.tsx"),
    reactCompat
      ? reactCompatSpanPageSource(arrayLiteral)
      : `const items = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  await mkdir(join(appDir, "real-stream-page"), { recursive: true });
  await writeFile(
    join(appDir, "real-stream-page", "page.tsx"),
    reactCompat
      ? `import { createElement, renderToString } from "@reckona/mreact-compat";
export const stream = true;
const items = ${arrayLiteral};
async function fetchItems() {
  return new Promise((resolve) => setTimeout(() => resolve(items), 50));
}
export default async function Page() {
  const data = await fetchItems();
  return renderToString(() => createElement("main", null, createElement("ul", null, data.map((index) => createElement("span", { key: index }, index)))));
}`
      : `export const stream = true;
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
    reactCompat
      ? `import { createElement, renderToString } from "@reckona/mreact-compat";
export const stream = true;
function fetchA() {
  return new Promise((resolve) => setTimeout(() => resolve("A"), 50));
}
function fetchB() {
  return new Promise((resolve) => setTimeout(() => resolve("B"), 50));
}
export default async function Page() {
  const [a, b] = await Promise.all([fetchA(), fetchB()]);
  return renderToString(() => createElement("main", null, createElement("section", { "data-a": a }, "A:", a), createElement("section", { "data-b": b }, "B:", b)));
}`
      : `export const stream = true;
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
    reactCompat
      ? reactCompatDataGridPageSource(cellsLiteral)
      : `const cells = ${cellsLiteral};
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
    sinkStrategy,
  });
  currentNodeCount = nodeCount;
  currentLogEnabled = logEnabled;
  currentReactCompat = reactCompat;
  return server.url;
}

async function ensureBrowserFixture(logEnabled: boolean, reactCompat: boolean): Promise<string> {
  if (
    browserRootDir !== undefined &&
    browserServer !== undefined &&
    browserLogEnabled === logEnabled &&
    browserReactCompat === reactCompat
  ) {
    return browserServer.url;
  }

  if (browserServer !== undefined) {
    await browserServer.close();
    browserServer = undefined;
  }

  if (browserRootDir !== undefined) {
    await rm(browserRootDir, { force: true, recursive: true });
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
      <Link href="/target">Details</Link>
    </main>
  );
}`
      : `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return (
    <main>
      <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>
      <a href="/target">Details</a>
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
    `export default function Page() {
  return <main><h1>Navigation target</h1></main>;
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
  return browserServer.url;
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
      if (server !== undefined) {
        await server.close();
        server = undefined;
      }
      if (browserServer !== undefined) {
        await browserServer.close();
        browserServer = undefined;
      }
      if (rootDir !== undefined) {
        await rm(rootDir, { force: true, recursive: true });
        rootDir = undefined;
        currentNodeCount = 0;
        currentLogEnabled = false;
        currentReactCompat = false;
      }
      if (browserRootDir !== undefined) {
        await rm(browserRootDir, { force: true, recursive: true });
        browserRootDir = undefined;
        browserLogEnabled = false;
        browserReactCompat = false;
      }
      if (coldStartRootDir !== undefined) {
        await rm(coldStartRootDir, { force: true, recursive: true });
        coldStartRootDir = undefined;
        coldStartOutDir = undefined;
        coldStartReactCompat = false;
      }
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
    async measureServerColdStartMs(): Promise<number> {
      const outDir = await ensureColdStartFixture(reactCompat);
      return measureServerColdStart(outDir, { logEnabled });
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

function reactCompatDataGridPageSource(cellsLiteral: string): string {
  return `import { createElement, renderToString } from "@reckona/mreact-compat";
const cells = ${cellsLiteral};
function View() {
  return createElement("main", null, cells.map((cell, i) => createElement(
    "div",
    {
      key: i,
      className: "cell row-" + cell.row + " col-" + cell.col + " kind-" + cell.kind,
      "data-row": cell.row,
      "data-col": cell.col,
      "data-kind": cell.kind,
      title: cell.title,
      "aria-label": cell.label,
      style: { backgroundColor: cell.bg, color: cell.fg },
    },
    cell.text,
  )));
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
