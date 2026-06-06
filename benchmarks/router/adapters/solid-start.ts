// solid-start adapter。
//
// SolidStart は Vinxi (Vite + Nitro) ベースのフルフレームワーク。fixture を
// `benchmarks/router/.tmp/` 配下に置き、`pnpm install --ignore-workspace`
// で solid-start + vinxi + solid-js を local node_modules に入れたあと、
// `vinxi build` + `vinxi start` で production server を立てて HTTP fetch で
// SSR throughput を測る。
//
// fixture build は重い (`pnpm install` ~20s + `vinxi build` ~10-20s) ため、
// adapter init 時に 1 回だけ実行する。
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

const SOLID_START_VERSION = "1.3.2";
const SOLID_ROUTER_VERSION = "0.15.3";
const VINXI_VERSION = "0.5.7";
const SOLID_JS_VERSION = "1.9.5";

const repoRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureParent = pathResolve(repoRoot, "benchmarks/router/.tmp");

let rootDir: string | undefined;
let serverProcess: { close(): Promise<void>; url: string } | undefined;
let currentNodeCount = 0;
let browserRootDir: string | undefined;
let browserServerProcess: { close(): Promise<void>; url: string } | undefined;
let concurrentRequestResult: Promise<ConcurrentRequestProbeResult> | undefined;

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
  rootDir = await mkdtemp(join(fixtureParent, "solid-start-fixture-"));

  const items = Array.from({ length: nodeCount }, (_, index) => index);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-solid-start-fixture",
        private: true,
        type: "module",
        scripts: {
          build: "vinxi build",
        },
        dependencies: {
          "@solidjs/start": SOLID_START_VERSION,
          "@solidjs/router": SOLID_ROUTER_VERSION,
          "solid-js": SOLID_JS_VERSION,
          vinxi: VINXI_VERSION,
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(rootDir, "app.config.ts"),
    `import { defineConfig } from "@solidjs/start/config";
export default defineConfig({});
`,
  );

  await mkdir(join(rootDir, "src", "routes"), { recursive: true });

  await writeFile(
    join(rootDir, "src", "app.tsx"),
    `import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
`,
  );

  await writeFile(
    join(rootDir, "src", "entry-server.tsx"),
    `import { createHandler, StartServer } from "@solidjs/start/server";
export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
`,
  );

  await writeFile(
    join(rootDir, "src", "entry-client.tsx"),
    `import { mount, StartClient } from "@solidjs/start/client";
mount(() => <StartClient />, document.getElementById("app")!);
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "index.tsx"),
    `const items = ${arrayLiteral};
export default function Home() {
  return <main>{items.map((index) => <span data-key={index}>{index}</span>)}</main>;
}
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "stream-page.tsx"),
    `import { Suspense, createResource } from "solid-js";
const items = ${arrayLiteral};
function fetchItems() {
  return new Promise<number[]>((resolve) => resolve(items));
}
export default function StreamPage() {
  const [data] = createResource(fetchItems);
  return (
    <Suspense fallback={<p>loading</p>}>
      <main>{data()?.map((index) => <span data-key={index}>{index}</span>)}</main>
    </Suspense>
  );
}
`,
  );

  await writeFile(
    join(rootDir, "src", "routes", "real-stream-page.tsx"),
    `import { Suspense, createResource, For } from "solid-js";
const items = ${arrayLiteral};
function fetchItems() {
  return new Promise<number[]>((resolve) => setTimeout(() => resolve(items), 50));
}
export default function RealStreamPage() {
  const [data] = createResource(fetchItems);
  return (
    <main>
      <Suspense fallback={<p>loading</p>}>
        <ul><For each={data() ?? []}>{(i) => <span data-key={i}>{i}</span>}</For></ul>
      </Suspense>
    </main>
  );
}
`,
  );

  // waterfall fixture: two independent Suspense + Resource each awaiting
  // 50 ms. Parallel resolution → TTLB ~50 ms; serialized → ~100 ms.
  await writeFile(
    join(rootDir, "src", "routes", "waterfall-page.tsx"),
    `import { Suspense, createResource } from "solid-js";
function fetchA() {
  return new Promise<string>((resolve) => setTimeout(() => resolve("A"), 50));
}
function fetchB() {
  return new Promise<string>((resolve) => setTimeout(() => resolve("B"), 50));
}
export default function WaterfallPage() {
  const [a] = createResource(fetchA);
  const [b] = createResource(fetchB);
  return (
    <main>
      <Suspense fallback={<p>loadingA</p>}>
        <section data-a={a()}>A:{a()}</section>
      </Suspense>
      <Suspense fallback={<p>loadingB</p>}>
        <section data-b={b()}>B:{b()}</section>
      </Suspense>
    </main>
  );
}
`,
  );

  // dynamic-attribute heavy fixture (parallel to mreact / next adapters).
  // Use cells.map() instead of <For> — Solid's <For> requires reactive
  // signal accessor as 2nd arg, mapping over plain array works server-side.
  const cells = buildDynamicAttrCells(200);
  const cellsLiteral = JSON.stringify(cells);
  await writeFile(
    join(rootDir, "src", "routes", "data-grid.tsx"),
    `const cells = ${cellsLiteral};
export default function DataGrid() {
  return (
    <main>
      {cells.map((cell) => (
        <div
          class={"cell row-" + cell.row + " col-" + cell.col + " kind-" + cell.kind}
          data-row={cell.row}
          data-col={cell.col}
          data-kind={cell.kind}
          title={cell.title}
          aria-label={cell.label}
          style={"background-color:" + cell.bg + ";color:" + cell.fg}
        >
          {cell.text}
        </div>
      ))}
    </main>
  );
}
`,
  );

  await writeFile(
    join(rootDir, "src", "global.d.ts"),
    `/// <reference types="@solidjs/start/env" />\n`,
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
          jsxImportSource: "solid-js",
          strict: false,
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          types: ["@solidjs/start/env"],
        },
        include: ["src/**/*", "*.ts", "*.tsx"],
      },
      null,
      2,
    ),
  );

  // Install deps into local node_modules (--ignore-workspace to skip workspace graph)
  await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], { cwd: rootDir });

  // Build production
  await spawnAndWait("pnpm", ["run", "build"], {
    cwd: rootDir,
    env: { NODE_ENV: "production", NITRO_PRESET: "node-server" },
  });

  // Start production server — Vinxi node-server preset emits
  // `.output/server/index.mjs` which we run directly.
  const port = await findFreePort();
  const serverEntry = join(rootDir, ".output", "server", "index.mjs");
  const child = spawn(process.execPath, [serverEntry], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  // wait until server responds
  const url = `http://127.0.0.1:${port}`;
  const ready = await waitForServer(url, 30_000);
  if (!ready) {
    child.kill();
    throw new Error(`solid-start server did not become ready in 30s: ${stderr.slice(-2000)}`);
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
  browserRootDir = await mkdtemp(join(fixtureParent, "solid-start-browser-fixture-"));

  await writeFile(
    join(browserRootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-solid-start-browser-fixture",
        private: true,
        type: "module",
        scripts: {
          build: "vinxi build",
        },
        dependencies: {
          "@solidjs/start": SOLID_START_VERSION,
          "@solidjs/router": SOLID_ROUTER_VERSION,
          "solid-js": SOLID_JS_VERSION,
          vinxi: VINXI_VERSION,
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(browserRootDir, "app.config.ts"),
    `import { defineConfig } from "@solidjs/start/config";
export default defineConfig({});
`,
  );

  await mkdir(join(browserRootDir, "src", "routes"), { recursive: true });
  await writeFile(
    join(browserRootDir, "src", "app.tsx"),
    `import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
`,
  );
  await writeFile(
    join(browserRootDir, "src", "entry-server.tsx"),
    `import { createHandler, StartServer } from "@solidjs/start/server";
export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
`,
  );
  await writeFile(
    join(browserRootDir, "src", "entry-client.tsx"),
    `import { mount, StartClient } from "@solidjs/start/client";
mount(() => <StartClient />, document.getElementById("app")!);
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "index.tsx"),
    `import { A } from "@solidjs/router";
import { createSignal } from "solid-js";

export default function Home() {
  const [count, setCount] = createSignal(0);
  return (
    <main>
      <button type="button" onClick={() => setCount((value) => value + 1)}>count: {count()}</button>
      <A href="/target">Details</A>
    </main>
  );
}
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "target.tsx"),
    `export function routeData() {
  return { label: "loaded-target" };
}

export default function Target() {
  const data = routeData();
  return <main><h1>Navigation target</h1><p>loader:{data.label}</p></main>;
}
`,
  );
  await writeFile(
    join(browserRootDir, "src", "global.d.ts"),
    `/// <reference types="@solidjs/start/env" />\n`,
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
          jsxImportSource: "solid-js",
          strict: false,
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          types: ["@solidjs/start/env"],
        },
        include: ["src/**/*", "*.ts", "*.tsx"],
      },
      null,
      2,
    ),
  );

  await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], {
    cwd: browserRootDir,
  });
  await spawnAndWait("pnpm", ["run", "build"], {
    cwd: browserRootDir,
    env: { NODE_ENV: "production", NITRO_PRESET: "node-server" },
  });

  const port = await findFreePort();
  const serverEntry = join(browserRootDir, ".output", "server", "index.mjs");
  const child = spawn(process.execPath, [serverEntry], {
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
      `solid-start browser server did not become ready in 30s: ${stderr.slice(-2000)}`,
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

export const solidStartAdapter: AppFrameworkAdapter = {
  name: "solid-start",
  version: SOLID_START_VERSION,
  async setup() {
    // fixture is built lazily on first call (pnpm install + vinxi build ~30s+)
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
    concurrentRequestResult = undefined;
  },
  async renderToString(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/`);
    const html = await response.text();
    if (!html.includes(`>${nodeCount - 1}<`)) {
      throw new Error("solid-start renderToString did not include the last node");
    }
    return html;
  },
  async renderToStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/stream-page`);
    const html = await response.text();
    if (!html.includes(`>${nodeCount - 1}<`)) {
      throw new Error("solid-start renderToStream did not include the last node");
    }
    return html;
  },
  async renderToRealStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/real-stream-page`);
    const html = await response.text();
    if (!html.includes(`>${nodeCount - 1}<`)) {
      throw new Error("solid-start renderToRealStream did not include the last node");
    }
    return html;
  },
  async renderWaterfall(): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/waterfall-page`);
    const html = await response.text();
    if (!html.includes(">A:") || !html.includes(">B:")) {
      throw new Error("solid-start renderWaterfall did not include both branches");
    }
    return html;
  },
  async renderDynamicAttrGrid(cellCount: number): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/data-grid`);
    const html = await response.text();
    if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
      throw new Error("solid-start renderDynamicAttrGrid did not include the last escaped text");
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
      throw new Error("solid-start fixture not initialized");
    }

    return measureBuildOutputGzipBytes([join(rootDir, ".output")]);
  },
  async measureSsrHtmlGzipBytes(): Promise<number> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/`);
    const html = await response.text();

    if (!html.includes(`>999<`)) {
      throw new Error("solid-start SSR HTML gzip probe did not include the last node");
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
  concurrentRequestResult ??= measureConcurrentRequestResult();
  return concurrentRequestResult;
}

async function measureConcurrentRequestResult(): Promise<ConcurrentRequestProbeResult> {
  const url = await ensureFixture(1000);
  return measureConcurrentRequests(url, {
    path: "/",
    validate(html) {
      if (!html.includes(`>999<`)) {
        throw new Error("solid-start concurrent response did not include the last node");
      }
    },
  });
}
