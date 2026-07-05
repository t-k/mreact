// tanstack-start adapter。
//
// TanStack Start は Vite + `@tanstack/react-start/plugin/vite` ベース。
// `vite build` で `dist/client/` (client bundles) と `dist/server/server.js`
// (Web Fetch handler を export する server entry) が emit される。
// `server.fetch(Request)` で SSR を実行できるので、http.Server で wrap して
// 通常の HTTP fetch を可能にする (fixture 内に server-wrapper.mjs を置く)。
//
// fixture build は `pnpm install` (~30s) + `vite build` (~30s) で重い。
// adapter init で 1 回だけ実行。
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as pathResolve } from "node:path";
import type { AppFrameworkAdapter } from "../types.js";
import { measureBuildOutputGzipBytes } from "../build-output-size.js";
import { type ConcurrentRequestProbeResult, measureConcurrentRequests } from "../http-probes.js";
import {
  measureBackForwardRestore,
  measureClientNavigation,
  measureFirstInteractionAfterNetworkIdle,
  measureFirstInteractionFromDomContentLoaded,
  measureInitialPageLoadBeforeInteraction,
  measureLoaderClientNavigation,
  measureRouteJavaScriptGzipBytePhases,
  measureRouteJavaScriptGzipBytes,
  measureSecondInteractionLatency,
} from "../browser-probes.js";

const TANSTACK_START_VERSION = "1.167.65";
const TANSTACK_ROUTER_VERSION = "1.169.2";
const REACT_VERSION = "19.2.0";
const VITE_VERSION = "7.0.8";

const repoRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureParent = pathResolve(repoRoot, "benchmarks/router/.tmp");

let rootDir: string | undefined;
let serverProcess: { close(): Promise<void>; url: string } | undefined;
let currentNodeCount = 0;
let browserRootDir: string | undefined;
let browserServerProcess: { close(): Promise<void>; url: string } | undefined;

async function spawnAndWait(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exit ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server: Server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(2000) });
      if (response.ok || response.status === 404) {
        return true;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureFixture(nodeCount: number): Promise<string> {
  if (rootDir !== undefined && currentNodeCount === nodeCount && serverProcess !== undefined) {
    return serverProcess.url;
  }

  if (serverProcess !== undefined) {
    await serverProcess.close();
    serverProcess = undefined;
  }

  if (rootDir !== undefined) {
    await rm(rootDir, { force: true, recursive: true });
  }

  await mkdir(fixtureParent, { recursive: true });
  rootDir = await mkdtemp(join(fixtureParent, "tanstack-start-fixture-"));

  const items = Array.from({ length: nodeCount }, (_, index) => index);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-tanstack-start-fixture",
        private: true,
        type: "module",
        scripts: {
          build: "vite build",
        },
        dependencies: {
          "@tanstack/react-router": TANSTACK_ROUTER_VERSION,
          "@tanstack/react-start": TANSTACK_START_VERSION,
          react: REACT_VERSION,
          "react-dom": REACT_VERSION,
          vite: VITE_VERSION,
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(rootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  plugins: [tanstackStart()],
});
`,
  );

  await mkdir(join(rootDir, "src", "routes"), { recursive: true });

  await writeFile(
    join(rootDir, "src", "router.tsx"),
    `import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
export function getRouter() {
  return createTanStackRouter({ routeTree, scrollRestoration: true });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "__root.tsx"),
    `import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "index.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";
const items = ${arrayLiteral};
export const Route = createFileRoute("/")({
  component: () => <main>{items.map((i) => <span key={i}>{i}</span>)}</main>,
});
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "stream-page.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
const items = ${arrayLiteral};
function Inner() {
  return <main>{items.map((i) => <span key={i}>{i}</span>)}</main>;
}
export const Route = createFileRoute("/stream-page")({
  component: () => <Suspense fallback={<p>loading</p>}><Inner /></Suspense>,
});
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "real-stream-page.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";
const items = ${arrayLiteral};
function Inner({ promise }: { promise: Promise<number[]> }) {
  const data = use(promise);
  return <ul>{data.map((i) => <span key={i}>{i}</span>)}</ul>;
}
function Page() {
  // Fresh promise per render (per request) — resolves after 50ms forcing
  // Suspense shell pre-flush + body chunk.
  const promise = new Promise<number[]>((resolve) => setTimeout(() => resolve(items), 50));
  return <main><Suspense fallback={<p>loading</p>}><Inner promise={promise} /></Suspense></main>;
}
export const Route = createFileRoute("/real-stream-page")({ component: Page });
`,
  );

  // waterfall fixture: two **sibling** Suspense boundaries each awaiting
  // 50 ms. Parallel resolution → TTLB ~50 ms; serialized → ~100 ms.
  await writeFile(
    join(rootDir, "src", "routes", "waterfall-page.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";
function InnerA({ p }: { p: Promise<string> }) {
  const v = use(p);
  return <section data-a={v}>A:{v}</section>;
}
function InnerB({ p }: { p: Promise<string> }) {
  const v = use(p);
  return <section data-b={v}>B:{v}</section>;
}
function Page() {
  const pA = new Promise<string>((resolve) => setTimeout(() => resolve("A"), 50));
  const pB = new Promise<string>((resolve) => setTimeout(() => resolve("B"), 50));
  return (
    <main>
      <Suspense fallback={<p>loadingA</p>}><InnerA p={pA} /></Suspense>
      <Suspense fallback={<p>loadingB</p>}><InnerB p={pB} /></Suspense>
    </main>
  );
}
export const Route = createFileRoute("/waterfall-page")({ component: Page });
`,
  );

  // dynamic-attribute heavy fixture (parallel to other adapters).
  {
    const cells = buildDynamicAttrCells(200);
    const cellsLiteral = JSON.stringify(cells);
    await writeFile(
      join(rootDir, "src", "routes", "data-grid.tsx"),
      `import { createFileRoute } from "@tanstack/react-router";
const cells = ${cellsLiteral};
function Page() {
  return (
    <main>
      {cells.map((cell, i) => (
        <div
          key={i}
          className={"cell row-" + cell.row + " col-" + cell.col + " kind-" + cell.kind}
          data-row={cell.row}
          data-col={cell.col}
          data-kind={cell.kind}
          title={cell.title}
          aria-label={cell.label}
          style={{ backgroundColor: cell.bg, color: cell.fg }}
        >
          {cell.text}
        </div>
      ))}
    </main>
  );
}
export const Route = createFileRoute("/data-grid")({ component: Page });
`,
    );
  }

  await writeFile(
    join(rootDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          allowJs: true,
          resolveJsonModule: true,
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  );

  // server-wrapper.mjs: wraps the built `dist/server/server.js` Web Fetch
  // handler in an http.Server listening on $PORT.
  await writeFile(
    join(rootDir, "server-wrapper.mjs"),
    `import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import entry from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3000);
const clientDir = new URL("./dist/client/", import.meta.url);
const httpServer = createServer(async (incoming, outgoing) => {
  try {
    const origin = "http://" + (incoming.headers.host ?? ("127.0.0.1:" + port));
    const url = new URL(incoming.url ?? "/", origin);
    const method = incoming.method ?? "GET";
    if ((method === "GET" || method === "HEAD") && url.pathname.startsWith("/assets/")) {
      try {
        const file = await readFile(new URL("." + url.pathname, clientDir));
        outgoing.writeHead(200, { "content-type": url.pathname.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
        if (method !== "HEAD") outgoing.write(file);
        outgoing.end();
        return;
      } catch {
        // Fall through to the framework handler.
      }
    }
    const init = { method, headers: Object.entries(incoming.headers).flatMap(([k, v]) => v === undefined ? [] : Array.isArray(v) ? v.map(value => [k, value]) : [[k, v]]) };
    if (method !== "GET" && method !== "HEAD") {
      init.body = Readable.toWeb(incoming);
      init.duplex = "half";
    }
    const request = new Request(url, init);
    const response = await entry.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      for await (const chunk of response.body) outgoing.write(chunk);
    }
    outgoing.end();
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "text/plain");
    outgoing.end(error instanceof Error ? error.stack : String(error));
  }
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log("listening on " + port);
});
`,
  );

  // Install deps
  await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], { cwd: rootDir });

  // Build
  await spawnAndWait("pnpm", ["run", "build"], {
    cwd: rootDir,
    env: { NODE_ENV: "production" },
  });

  // Start production server wrapper
  const port = await findFreePort();
  const child = spawn(process.execPath, ["server-wrapper.mjs"], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const url = `http://127.0.0.1:${port}`;
  const ready = await waitForServer(url, 30_000);
  if (!ready) {
    child.kill();
    throw new Error(`tanstack-start server did not become ready in 30s: ${stderr.slice(-2000)}`);
  }

  serverProcess = {
    url,
    close: async () => {
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
  currentNodeCount = nodeCount;
  return url;
}

async function ensureBrowserFixture(): Promise<string> {
  if (browserRootDir !== undefined && browserServerProcess !== undefined) {
    return browserServerProcess.url;
  }

  if (browserServerProcess !== undefined) {
    await browserServerProcess.close();
    browserServerProcess = undefined;
  }
  if (browserRootDir !== undefined) {
    await rm(browserRootDir, { force: true, recursive: true });
  }

  await mkdir(fixtureParent, { recursive: true });
  browserRootDir = await mkdtemp(join(fixtureParent, "tanstack-start-browser-fixture-"));

  await writeFile(
    join(browserRootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-tanstack-start-browser-fixture",
        private: true,
        type: "module",
        scripts: {
          build: "vite build",
        },
        dependencies: {
          "@tanstack/react-router": TANSTACK_ROUTER_VERSION,
          "@tanstack/react-start": TANSTACK_START_VERSION,
          react: REACT_VERSION,
          "react-dom": REACT_VERSION,
          vite: VITE_VERSION,
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(browserRootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  plugins: [tanstackStart()],
});
`,
  );

  await mkdir(join(browserRootDir, "src", "routes"), { recursive: true });
  await writeFile(
    join(browserRootDir, "src", "router.tsx"),
    `import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
export function getRouter() {
  return createTanStackRouter({ routeTree, scrollRestoration: true });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
`,
  );
  await writeFile(
    join(browserRootDir, "src", "client.tsx"),
    `import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "__root.tsx"),
    `import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "index.tsx"),
    `import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

function Page() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <button type="button" onClick={() => setCount((value) => value + 1)}>count: {count}</button>
      <Link to="/target">Details</Link>
    </main>
  );
}
export const Route = createFileRoute("/")({ component: Page });
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "target.tsx"),
    `import { createFileRoute } from "@tanstack/react-router";
function Page() {
  const data = Route.useLoaderData();
  return <main><h1>Navigation target</h1><p>loader:{data.label}</p></main>;
}
export const Route = createFileRoute("/target")({
  loader: () => ({ label: "loaded-target" }),
  component: Page,
});
`,
  );
  await writeFile(
    join(browserRootDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          allowJs: true,
          resolveJsonModule: true,
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(browserRootDir, "server-wrapper.mjs"),
    `import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import entry from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3000);
const clientDir = new URL("./dist/client/", import.meta.url);
const httpServer = createServer(async (incoming, outgoing) => {
  try {
    const origin = "http://" + (incoming.headers.host ?? ("127.0.0.1:" + port));
    const url = new URL(incoming.url ?? "/", origin);
    const method = incoming.method ?? "GET";
    if ((method === "GET" || method === "HEAD") && url.pathname.startsWith("/assets/")) {
      try {
        const file = await readFile(new URL("." + url.pathname, clientDir));
        outgoing.writeHead(200, { "content-type": url.pathname.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
        if (method !== "HEAD") outgoing.write(file);
        outgoing.end();
        return;
      } catch {
        // Fall through to the framework handler.
      }
    }
    const init = { method, headers: Object.entries(incoming.headers).flatMap(([k, v]) => v === undefined ? [] : Array.isArray(v) ? v.map(value => [k, value]) : [[k, v]]) };
    if (method !== "GET" && method !== "HEAD") {
      init.body = Readable.toWeb(incoming);
      init.duplex = "half";
    }
    const request = new Request(url, init);
    const response = await entry.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      for await (const chunk of response.body) outgoing.write(chunk);
    }
    outgoing.end();
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "text/plain");
    outgoing.end(error instanceof Error ? error.stack : String(error));
  }
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log("listening on " + port);
});
`,
  );

  await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], {
    cwd: browserRootDir,
  });
  await spawnAndWait("pnpm", ["run", "build"], {
    cwd: browserRootDir,
    env: { NODE_ENV: "production" },
  });

  const port = await findFreePort();
  const child = spawn(process.execPath, ["server-wrapper.mjs"], {
    cwd: browserRootDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const url = `http://127.0.0.1:${port}`;
  const ready = await waitForServer(url, 30_000);
  if (!ready) {
    child.kill();
    throw new Error(
      `tanstack-start browser server did not become ready in 30s: ${stderr.slice(-2000)}`,
    );
  }

  browserServerProcess = {
    url,
    close: async () => {
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
  return url;
}

export const tanstackStartAdapter: AppFrameworkAdapter = {
  name: "tanstack-start",
  version: TANSTACK_START_VERSION,
  async setup() {
    // fixture is built lazily on first call
  },
  getServerUrl(): string | null {
    return serverProcess?.url ?? null;
  },
  async teardown() {
    if (serverProcess !== undefined) {
      await serverProcess.close();
      serverProcess = undefined;
    }
    if (browserServerProcess !== undefined) {
      await browserServerProcess.close();
      browserServerProcess = undefined;
    }
    if (rootDir !== undefined) {
      await rm(rootDir, { force: true, recursive: true });
      rootDir = undefined;
      currentNodeCount = 0;
    }
    if (browserRootDir !== undefined) {
      await rm(browserRootDir, { force: true, recursive: true });
      browserRootDir = undefined;
    }
  },
  async renderToString(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("tanstack-start renderToString did not include the last node");
    }
    return html;
  },
  async renderToStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/stream-page`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("tanstack-start renderToStream did not include the last node");
    }
    return html;
  },
  async renderToRealStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/real-stream-page`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("tanstack-start renderToRealStream did not include the last node");
    }
    return html;
  },
  async renderWaterfall(): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/waterfall-page`);
    const html = await response.text();
    if (!html.includes(`data-a="A"`) || !html.includes(`data-b="B"`)) {
      throw new Error("tanstack-start renderWaterfall did not include both branches");
    }
    return html;
  },
  async renderDynamicAttrGrid(cellCount: number): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/data-grid`);
    const html = await response.text();
    if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
      throw new Error("tanstack-start renderDynamicAttrGrid did not include the last escaped text");
    }
    return html;
  },
  async measureServerOnlyClientBundleBytes(): Promise<number> {
    const url = await ensureFixture(1000);
    return measureRouteJavaScriptGzipBytes(url);
  },
  async measureInteractiveClientBundleBeforeInteractionBytes(): Promise<number> {
    const url = await ensureBrowserFixture();
    return (await measureRouteJavaScriptGzipBytePhases(url, { assertInteractive: true }))
      .beforeInteractionBytes;
  },
  async measureInteractiveClientBundleAfterIdleBytes(): Promise<number> {
    const url = await ensureBrowserFixture();
    return (await measureRouteJavaScriptGzipBytePhases(url, { assertInteractive: true }))
      .afterIdleBytes;
  },
  async measureInteractiveClientBundleBytes(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureRouteJavaScriptGzipBytes(url, { assertInteractive: true });
  },
  async measureBuildOutputGzipBytes(): Promise<number> {
    if (rootDir === undefined) {
      await ensureFixture(1000);
    }

    if (rootDir === undefined) {
      throw new Error("tanstack-start fixture not initialized");
    }

    return measureBuildOutputGzipBytes([
      join(rootDir, "dist", "client"),
      join(rootDir, "dist", "server"),
    ]);
  },
  async measureSsrHtmlGzipBytes(): Promise<number> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/`);
    const html = await response.text();

    if (!html.includes(`<span>999</span>`)) {
      throw new Error("tanstack-start SSR HTML gzip probe did not include the last node");
    }

    return gzipSync(html).length;
  },
  async measureConcurrentRequestThroughputOps(): Promise<number> {
    return (await ensureConcurrentRequestResult()).throughputOps;
  },
  async measureConcurrentRequestP99Ms(): Promise<number> {
    return (await ensureConcurrentRequestResult()).p99Ms;
  },
  async measureConcurrentRequestRssDeltaBytes(): Promise<number> {
    return (await ensureConcurrentRequestResult()).rssDeltaBytes;
  },
  async measureClientNavigationMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureClientNavigation(url);
  },
  async measureLoaderClientNavigationMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureLoaderClientNavigation(url);
  },
  async measureBackForwardRestoreMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureBackForwardRestore(url, { expectStateRestore: false });
  },
  async measureInitialPageLoadBeforeInteractionMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureInitialPageLoadBeforeInteraction(url);
  },
  async measureFirstInteractionFromDomContentLoadedMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureFirstInteractionFromDomContentLoaded(url);
  },
  async measureFirstInteractionAfterNetworkIdleMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureFirstInteractionAfterNetworkIdle(url);
  },
  async measureSecondInteractionLatencyMs(): Promise<number> {
    const url = await ensureBrowserFixture();
    return measureSecondInteractionLatency(url);
  },
};

function ensureConcurrentRequestResult(): Promise<ConcurrentRequestProbeResult> {
  return measureConcurrentRequestResult();
}

async function measureConcurrentRequestResult(): Promise<ConcurrentRequestProbeResult> {
  const url = await ensureFixture(1000);
  return measureConcurrentRequests(url, {
    path: "/",
    validate(html) {
      if (!html.includes(`<span>999</span>`)) {
        throw new Error("tanstack-start concurrent response did not include the last node");
      }
    },
  });
}
