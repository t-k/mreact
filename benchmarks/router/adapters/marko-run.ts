// marko-run adapter (Marko 6 + Marko Run + Vite + node-adapter).
//
// Marko Run の build 出力は `dist/index.mjs` (node-adapter) で http.Server を
// 内部で立ち上げる。`PORT` env で listen port を指定。
//
// fixture build は `pnpm install` (~20s) + `marko-run build` (~5s) で 30s 程度。
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as pathResolve } from "node:path";
import type { AppFrameworkAdapter } from "../types.js";
import {
  measureFirstInteractionAfterNetworkIdle,
  measureFirstInteractionFromDomContentLoaded,
  measureInitialPageLoadBeforeInteraction,
  measureSecondInteractionLatency,
} from "../browser-probes.js";

const MARKO_RUN_VERSION = "0.10.0";
const MARKO_RUN_ADAPTER_NODE_VERSION = "2.0.5";
// Marko 6.0.171 changed `<if>` tag semantics and breaks Marko Run 0.10.0's
// auto-generated `marko-render-assets.mjs` ("Tag does not support arguments").
// Pin to 6.0.100 which is known-good with this Marko Run release.
const MARKO_VERSION = "6.0.100";

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
  rootDir = await mkdtemp(join(fixtureParent, "marko-run-fixture-"));

  const items = Array.from({ length: nodeCount }, (_, i) => i);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-marko-run-fixture",
        private: true,
        type: "module",
        scripts: { build: "marko-run build" },
        dependencies: {
          "@marko/run": MARKO_RUN_VERSION,
          "@marko/run-adapter-node": MARKO_RUN_ADAPTER_NODE_VERSION,
          marko: MARKO_VERSION,
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(rootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import marko from "@marko/run/vite";
import adapter from "@marko/run-adapter-node";
export default defineConfig({
  plugins: [marko({ adapter: adapter() })],
});
`,
  );

  await mkdir(join(rootDir, "src", "routes", "stream-page"), { recursive: true });
  await mkdir(join(rootDir, "src", "routes", "real-stream-page"), { recursive: true });
  await mkdir(join(rootDir, "src", "routes", "waterfall-page"), { recursive: true });
  await mkdir(join(rootDir, "src", "routes", "data-grid"), { recursive: true });

  // root page = synchronous 1000 spans
  await writeFile(
    join(rootDir, "src", "routes", "+page.marko"),
    `<let/items = ${arrayLiteral}/>
<main>
  <for|i| of=items>
    <span>\${i}</span>
  </for>
</main>
`,
  );

  // stream-page = synchronous (parallel to other frameworks' `/stream-page`)
  await writeFile(
    join(rootDir, "src", "routes", "stream-page", "+page.marko"),
    `<let/items = ${arrayLiteral}/>
<main>
  <for|i| of=items>
    <span>\${i}</span>
  </for>
</main>
`,
  );

  // waterfall-page = two independent async boundaries (each 50ms). If
  // marko-run resolves them in parallel the TTLB is ~50 ms; if it
  // serializes them the TTLB is ~100 ms.
  await writeFile(
    join(rootDir, "src", "routes", "waterfall-page", "+page.marko"),
    `<let/promiseA = new Promise((resolve) => setTimeout(() => resolve("A"), 50))/>
<let/promiseB = new Promise((resolve) => setTimeout(() => resolve("B"), 50))/>
<main>
  <try>
    <await|a| value=promiseA>
      <section data-a=a>A:\${a}</section>
    </await>
    <@placeholder>
      <p>loadingA</p>
    </@placeholder>
  </try>
  <try>
    <await|b| value=promiseB>
      <section data-b=b>B:\${b}</section>
    </await>
    <@placeholder>
      <p>loadingB</p>
    </@placeholder>
  </try>
</main>
`,
  );

  // real-stream-page = async (50ms wait) using Marko 6 await + try tags.
  // Body parameter is `<await|data| value=promise>` (Marko 6 tags-api).
  // Placeholder + catch live on `<try>` (not `<await>`).
  await writeFile(
    join(rootDir, "src", "routes", "real-stream-page", "+page.marko"),
    `<let/items = ${arrayLiteral}/>
<let/itemsPromise = new Promise((resolve) => setTimeout(() => resolve(items), 50))/>
<main>
  <try>
    <await|data| value=itemsPromise>
      <ul>
        <for|i| of=data>
          <span>\${i}</span>
        </for>
      </ul>
    </await>
    <@placeholder>
      <p>loading</p>
    </@placeholder>
  </try>
</main>
`,
  );

  // dynamic-attribute heavy fixture (parallel to other adapters).
  // Marko 6 syntax: dynamic attributes via `name=expr` and template
  // literals for class/style; text content via `${expr}`.
  {
    const cells = buildDynamicAttrCells(200);
    const cellsLiteral = JSON.stringify(cells);
    await writeFile(
      join(rootDir, "src", "routes", "data-grid", "+page.marko"),
      `<let/cells = ${cellsLiteral}/>
<main>
  <for|cell, i| of=cells>
    <div
      class=\`cell row-\${cell.row} col-\${cell.col} kind-\${cell.kind}\`
      data-row=cell.row
      data-col=cell.col
      data-kind=cell.kind
      title=cell.title
      aria-label=cell.label
      style=\`background-color:\${cell.bg};color:\${cell.fg}\`>
      \${cell.text}
    </div>
  </for>
</main>
`,
    );
  }

  await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], { cwd: rootDir });
  await spawnAndWait("pnpm", ["run", "build"], {
    cwd: rootDir,
    env: { NODE_ENV: "production" },
  });

  // Start node-adapter server
  const port = await findFreePort();
  const child = spawn(process.execPath, ["dist/index.mjs"], {
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
    throw new Error(`marko-run server did not become ready in 30s: ${stderr.slice(-2000)}`);
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
  browserRootDir = await mkdtemp(join(fixtureParent, "marko-run-browser-fixture-"));

  await writeFile(
    join(browserRootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-marko-run-browser-fixture",
        private: true,
        type: "module",
        scripts: { build: "marko-run build" },
        dependencies: {
          "@marko/run": MARKO_RUN_VERSION,
          "@marko/run-adapter-node": MARKO_RUN_ADAPTER_NODE_VERSION,
          marko: MARKO_VERSION,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(browserRootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import marko from "@marko/run/vite";
import adapter from "@marko/run-adapter-node";
export default defineConfig({
  plugins: [marko({ adapter: adapter() })],
});
`,
  );

  await mkdir(join(browserRootDir, "src", "routes", "target"), { recursive: true });
  await writeFile(
    join(browserRootDir, "src", "routes", "+page.marko"),
    `<let/count=0/>
<main>
  <button type="button" onClick() { count++ }>count: \${count}</button>
  <a href="/target">Details</a>
</main>
`,
  );
  await writeFile(
    join(browserRootDir, "src", "routes", "target", "+page.marko"),
    `<main><h1>Navigation target</h1></main>
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
  const child = spawn(process.execPath, ["dist/index.mjs"], {
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
    throw new Error(`marko-run browser server did not become ready in 30s: ${stderr.slice(-2000)}`);
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

export const markoRunAdapter: AppFrameworkAdapter = {
  name: "marko-run",
  version: MARKO_RUN_VERSION,
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
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("marko-run renderToString did not include the last node");
    }
    return html;
  },
  async renderToStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/stream-page`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("marko-run renderToStream did not include the last node");
    }
    return html;
  },
  async renderToRealStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/real-stream-page`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("marko-run renderToRealStream did not include the last node");
    }
    return html;
  },
  async renderWaterfall(): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/waterfall-page`);
    const html = await response.text();
    // Marko 6 emits unquoted attributes for single-token values
    if (!/data-a="?A"?/.test(html) || !/data-b="?B"?/.test(html)) {
      throw new Error("marko-run renderWaterfall did not include both branches");
    }
    return html;
  },
  async renderDynamicAttrGrid(cellCount: number): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/data-grid`);
    const html = await response.text();
    if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
      throw new Error("marko-run renderDynamicAttrGrid did not include the last escaped text");
    }
    return html;
  },
  async measureServerOnlyClientBundleBytes(): Promise<number> {
    return measureClientChunks();
  },
  async measureInteractiveClientBundleBytes(): Promise<number> {
    return measureClientChunks();
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

async function measureClientChunks(): Promise<number> {
  if (rootDir === undefined) throw new Error("marko-run fixture not initialized");
  const dir = join(rootDir, "dist", "public", "assets");
  let total = 0;
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const filePath =
        "parentPath" in entry && typeof (entry as { parentPath?: string }).parentPath === "string"
          ? join((entry as { parentPath: string }).parentPath, entry.name)
          : join(dir, entry.name);
      const code = await readFile(filePath);
      total += gzipSync(code).length;
    }
  } catch {
    // ignore
  }
  return total;
}
