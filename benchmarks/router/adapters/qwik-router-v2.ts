// qwik-router-v2 adapter (Qwik 2 beta + Qwik Router 2 beta + Vite 7 + node-server adapter).
//
// Qwik Router V2 は Vite 5-7 互換 (Vite 8 非対応)。fixture を tmp に作って
// `pnpm install --ignore-workspace` で deps を引き、`vite build` を 2 段
// (client + server) で実行。production server は `server/entry.node-server.js`
// を `node` で起動 (内部で http.Server を立ち上げる)。
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as pathResolve } from "node:path";
import type { AppFrameworkAdapter } from "../types.js";
import { measureBuildOutputGzipBytes } from "../build-output-size.js";
import {
  type ConcurrentRequestProbeResult,
  measureConcurrentRequests,
} from "../http-probes.js";
import {
  measureBackForwardRestore,
  measureClientNavigation,
  measureFirstInteractionAfterNetworkIdle,
  measureFirstInteractionFromDomContentLoaded,
  measureInitialPageLoadBeforeInteraction,
  measureLoaderClientNavigation,
  measureRouteJavaScriptGzipBytes,
  measureSecondInteractionLatency,
} from "../browser-probes.js";

const QWIK_CORE_VERSION = "2.0.0-beta.35";
const QWIK_ROUTER_VERSION = "2.0.0-beta.35";
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
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server: Server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(2000) });
      if (response.ok || response.status === 404) return true;
    } catch {
      // not ready
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
  rootDir = await mkdtemp(join(fixtureParent, "qwik-router-v2-fixture-"));

  const items = Array.from({ length: nodeCount }, (_, i) => i);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-qwik-router-v2-fixture",
        private: true,
        type: "module",
        scripts: {
          "build.client": "vite build",
          "build.server": "vite build -c adapters/node-server/vite.config.ts",
          build: "pnpm build.client && pnpm build.server",
        },
        dependencies: {
          "@qwik.dev/core": QWIK_CORE_VERSION,
          "@qwik.dev/router": QWIK_ROUTER_VERSION,
        },
        devDependencies: {
          vite: VITE_VERSION,
          "vite-tsconfig-paths": "5.1.4",
          typescript: "5.6.3",
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(rootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import { qwikVite } from "@qwik.dev/core/optimizer";
import { qwikRouter } from "@qwik.dev/router/vite";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
export default defineConfig(() => ({ plugins: [qwikRouter(), qwikVite(), tsconfigPathsPlugin()] }));
`,
  );

  await writeFile(
    join(rootDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "preserve",
          jsxImportSource: "@qwik.dev/core",
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          types: ["vite/client"],
        },
        include: ["src", "vite.config.ts", "adapters/**/*.ts"],
      },
      null,
      2,
    ),
  );

  await mkdir(join(rootDir, "adapters", "node-server"), { recursive: true });
  await writeFile(
    join(rootDir, "adapters", "node-server", "vite.config.ts"),
    `import { nodeServerAdapter } from "@qwik.dev/router/adapters/node-server/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config";
export default extendConfig(baseConfig, () => ({
  build: { ssr: true, rollupOptions: { input: ["src/entry.node-server.tsx", "@qwik-router-config"] }, outDir: "server", emptyOutDir: false },
  plugins: [nodeServerAdapter({ name: "node-server" })],
}));
`,
  );

  await mkdir(join(rootDir, "src", "routes", "stream-page"), { recursive: true });
  await mkdir(join(rootDir, "src", "routes", "real-stream-page"), { recursive: true });
  await mkdir(join(rootDir, "src", "routes", "waterfall-page"), { recursive: true });
  await mkdir(join(rootDir, "src", "routes", "data-grid"), { recursive: true });

  await writeFile(
    join(rootDir, "src", "root.tsx"),
    `import { component$ } from "@qwik.dev/core";
import { QwikRouterProvider, RouterOutlet } from "@qwik.dev/router";
export default component$(() => (
  <QwikRouterProvider>
    <head><meta charset="utf-8" /></head>
    <body><RouterOutlet /></body>
  </QwikRouterProvider>
));
`,
  );

  await writeFile(
    join(rootDir, "src", "entry.ssr.tsx"),
    `import { renderToStream, type RenderToStreamOptions } from "@qwik.dev/core/server";
import { manifest } from "@qwik-client-manifest";
import Root from "./root";
export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, { manifest, ...opts });
}
`,
  );

  await writeFile(
    join(rootDir, "src", "entry.node-server.tsx"),
    `import { createQwikRouter } from "@qwik.dev/router/middleware/node";
import { manifest } from "@qwik-client-manifest";
import render from "./entry.ssr";
import { createServer } from "node:http";
const { router, notFound, staticFile } = createQwikRouter({ render, manifest });
const port = Number(process.env.PORT ?? 3000);
const server = createServer((req, res) => {
  staticFile(req, res, () => router(req, res, () => notFound(req, res, () => {})));
});
server.listen(port, "127.0.0.1", () => console.log("listening on " + port));
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "index.tsx"),
    `import { component$ } from "@qwik.dev/core";
const items = ${arrayLiteral};
export default component$(() => (<main>{items.map((i) => <span key={i}>{i}</span>)}</main>));
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "stream-page", "index.tsx"),
    `import { component$ } from "@qwik.dev/core";
const items = ${arrayLiteral};
export default component$(() => (<main>{items.map((i) => <span key={i}>{i}</span>)}</main>));
`,
  );

  // Qwik's <Resource> is the equivalent of React's <Suspense>: fall back
  // to onPending while the promise is unresolved, switch to onResolved
  // once it resolves. Server renderer emits this as OOB stream chunks.
  await writeFile(
    join(rootDir, "src", "routes", "real-stream-page", "index.tsx"),
    `import { component$, useResource$, Resource } from "@qwik.dev/core";
const items = ${arrayLiteral};
export default component$(() => {
  const itemsResource = useResource$<number[]>(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return items;
  });
  return (
    <main>
      <Resource
        value={itemsResource}
        onPending={() => <p>loading</p>}
        onResolved={(data) => <ul>{data.map((i) => <span key={i}>{i}</span>)}</ul>}
      />
    </main>
  );
});
`,
  );

  // waterfall fixture: two independent Resource boundaries each awaiting
  // 50 ms. Parallel resolution → TTLB ~50 ms; serialized → ~100 ms.
  await writeFile(
    join(rootDir, "src", "routes", "waterfall-page", "index.tsx"),
    `import { component$, useResource$, Resource } from "@qwik.dev/core";
export default component$(() => {
  const a = useResource$<string>(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return "A";
  });
  const b = useResource$<string>(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return "B";
  });
  return (
    <main>
      <Resource value={a} onPending={() => <p>loadingA</p>} onResolved={(v) => <section data-a={v}>A:{v}</section>} />
      <Resource value={b} onPending={() => <p>loadingB</p>} onResolved={(v) => <section data-b={v}>B:{v}</section>} />
    </main>
  );
});
`,
  );

  // dynamic-attribute heavy fixture (parallel to other adapters).
  {
    const cells = buildDynamicAttrCells(200);
    const cellsLiteral = JSON.stringify(cells);
    await writeFile(
      join(rootDir, "src", "routes", "data-grid", "index.tsx"),
      `import { component$ } from "@qwik.dev/core";
const cells = ${cellsLiteral};
export default component$(() => (
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
        style={{ backgroundColor: cell.bg, color: cell.fg }}
      >
        {cell.text}
      </div>
    ))}
  </main>
));
`,
    );
  }

  await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], { cwd: rootDir });
  await spawnAndWait("pnpm", ["run", "build"], {
    cwd: rootDir,
    env: { NODE_ENV: "production" },
  });

  const port = await findFreePort();
  const child = spawn(process.execPath, ["server/entry.node-server.js"], {
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
    throw new Error(`qwik-router-v2 server did not become ready in 30s: ${stderr.slice(-2000)}`);
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
  browserRootDir = await mkdtemp(join(fixtureParent, "qwik-router-v2-browser-fixture-"));

  await writeFile(
    join(browserRootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-qwik-router-v2-browser-fixture",
        private: true,
        type: "module",
        scripts: {
          "build.client": "vite build",
          "build.server": "vite build -c adapters/node-server/vite.config.ts",
          build: "pnpm build.client && pnpm build.server",
        },
        dependencies: {
          "@qwik.dev/core": QWIK_CORE_VERSION,
          "@qwik.dev/router": QWIK_ROUTER_VERSION,
        },
        devDependencies: {
          vite: VITE_VERSION,
          "vite-tsconfig-paths": "5.1.4",
          typescript: "5.6.3",
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(browserRootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import { qwikVite } from "@qwik.dev/core/optimizer";
import { qwikRouter } from "@qwik.dev/router/vite";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
export default defineConfig(() => ({ plugins: [qwikRouter(), qwikVite(), tsconfigPathsPlugin()] }));
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
          jsx: "preserve",
          jsxImportSource: "@qwik.dev/core",
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          types: ["vite/client"],
        },
        include: ["src", "vite.config.ts", "adapters/**/*.ts"],
      },
      null,
      2,
    ),
  );

  await mkdir(join(browserRootDir, "adapters", "node-server"), { recursive: true });
  await writeFile(
    join(browserRootDir, "adapters", "node-server", "vite.config.ts"),
    `import { nodeServerAdapter } from "@qwik.dev/router/adapters/node-server/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config";
export default extendConfig(baseConfig, () => ({
  build: { ssr: true, rollupOptions: { input: ["src/entry.node-server.tsx", "@qwik-router-config"] }, outDir: "server", emptyOutDir: false },
  plugins: [nodeServerAdapter({ name: "node-server" })],
}));
`,
  );

  await mkdir(join(browserRootDir, "src", "routes", "target"), { recursive: true });
  await writeFile(
    join(browserRootDir, "src", "root.tsx"),
    `import { component$ } from "@qwik.dev/core";
import { QwikRouterProvider, RouterOutlet } from "@qwik.dev/router";
export default component$(() => (
  <QwikRouterProvider>
    <head><meta charset="utf-8" /></head>
    <body><RouterOutlet /></body>
  </QwikRouterProvider>
));
`,
  );
  await writeFile(
    join(browserRootDir, "src", "entry.ssr.tsx"),
    `import { renderToStream, type RenderToStreamOptions } from "@qwik.dev/core/server";
import { manifest } from "@qwik-client-manifest";
import Root from "./root";
export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, { manifest, ...opts });
}
`,
  );
  await writeFile(
    join(browserRootDir, "src", "entry.node-server.tsx"),
    `import { createQwikRouter } from "@qwik.dev/router/middleware/node";
import { manifest } from "@qwik-client-manifest";
import render from "./entry.ssr";
import { createServer } from "node:http";
const { router, notFound, staticFile } = createQwikRouter({ render, manifest });
const port = Number(process.env.PORT ?? 3000);
const server = createServer((req, res) => {
  staticFile(req, res, () => router(req, res, () => notFound(req, res, () => {})));
});
server.listen(port, "127.0.0.1", () => console.log("listening on " + port));
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "index.tsx"),
    `import { component$, useSignal } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
export default component$(() => {
  const count = useSignal(0);
  return (
    <main>
      <button type="button" onClick$={() => count.value++}>count: {count.value}</button>
      <Link href="/target">Details</Link>
    </main>
  );
});
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "target", "index.tsx"),
    `import { component$ } from "@qwik.dev/core";
export default component$(() => <main><h1>Navigation target</h1><p>loader:loaded-target</p></main>);
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
  const child = spawn(process.execPath, ["server/entry.node-server.js"], {
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
      `qwik-router-v2 browser server did not become ready in 30s: ${stderr.slice(-2000)}`,
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

function assertLastSpan(html: string, nodeCount: number, label: string) {
  // Qwik adds attributes to <span> (e.g. `q:id=`); match the closing tag form.
  if (!html.includes(`>${nodeCount - 1}</span>`)) {
    throw new Error(`qwik-router-v2 ${label} did not include the last node`);
  }
}

export const qwikRouterV2Adapter: AppFrameworkAdapter = {
  name: "qwik-router-v2",
  version: QWIK_CORE_VERSION,
  async setup() {
    // fixture built lazily
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
    assertLastSpan(html, nodeCount, "renderToString");
    return html;
  },
  async renderToStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/stream-page`);
    const html = await response.text();
    assertLastSpan(html, nodeCount, "renderToStream");
    return html;
  },
  async renderToRealStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/real-stream-page`);
    const html = await response.text();
    assertLastSpan(html, nodeCount, "renderToRealStream");
    return html;
  },
  async renderWaterfall(): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/waterfall-page`);
    const html = await response.text();
    if (!html.includes(`data-a="A"`) || !html.includes(`data-b="B"`)) {
      throw new Error("qwik-router-v2 renderWaterfall did not include both branches");
    }
    return html;
  },
  async renderDynamicAttrGrid(cellCount: number): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/data-grid`);
    const html = await response.text();
    if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
      throw new Error("qwik-router-v2 renderDynamicAttrGrid did not include the last escaped text");
    }
    return html;
  },
  async measureServerOnlyClientBundleBytes(): Promise<number> {
    const url = await ensureFixture(1000);
    return measureRouteJavaScriptGzipBytes(url);
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
      throw new Error("qwik-router-v2 fixture not initialized");
    }

    return measureBuildOutputGzipBytes([join(rootDir, "dist"), join(rootDir, "server")]);
  },
  async measureSsrHtmlGzipBytes(): Promise<number> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/`);
    const html = await response.text();
    assertLastSpan(html, 1000, "SSR HTML gzip probe");
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
      assertLastSpan(html, 1000, "concurrent response");
    },
  });
}
