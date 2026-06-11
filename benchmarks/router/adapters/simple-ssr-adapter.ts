import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve as pathResolve } from "node:path";
import { compile as compileSvelte } from "svelte/compiler";
import { render as renderSvelte } from "svelte/server";
import { createSSRApp, h } from "vue";
import { renderToString as renderVueToString } from "@vue/server-renderer";
import { measureBuildOutputGzipBytes } from "../build-output-size.js";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import {
  measureConcurrentRequests,
  type ConcurrentRequestProbeResult,
} from "../http-probes.js";
import type { AppFrameworkAdapter, AppFrameworkName } from "../types.js";

type RendererKind = "html" | "svelte" | "vue";

interface SimpleSsrAdapterOptions {
  name: AppFrameworkName;
  packageName: string;
  renderer: RendererKind;
}

interface ServerHandle {
  close(): Promise<void>;
  url: string;
}

const requireFromHere = createRequire(import.meta.url);
const repoRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureParent = pathResolve(repoRoot, "benchmarks/router/.tmp");

export function createSimpleSsrAdapter(options: SimpleSsrAdapterOptions): AppFrameworkAdapter {
  let rootDir: string | undefined;
  let server: ServerHandle | undefined;
  let currentNodeCount = 0;
  let concurrentRequestResult: Promise<ConcurrentRequestProbeResult> | undefined;

  async function ensureFixture(nodeCount: number): Promise<string> {
    if (server !== undefined && rootDir !== undefined && currentNodeCount === nodeCount) {
      return server.url;
    }

    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (rootDir !== undefined) {
      await rm(rootDir, { force: true, recursive: true });
    }

    await mkdir(fixtureParent, { recursive: true });
    rootDir = await mkdtemp(join(fixtureParent, `${options.name}-fixture-`));
    currentNodeCount = nodeCount;
    concurrentRequestResult = undefined;

    await writeFixtureSources(rootDir, options, nodeCount);
    server = await startFixtureServer(options, nodeCount, rootDir);
    return server.url;
  }

  async function renderPath(path: string, nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}${path}`);
    const html = await response.text();
    return html;
  }

  function validateNodeHtml(method: string, html: string, nodeCount: number): void {
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error(`${options.name} ${method} did not include the last node`);
    }
  }

  function validateDynamicAttrHtml(method: string, html: string, cellCount: number): void {
    if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
      throw new Error(`${options.name} ${method} did not include the last escaped text`);
    }
  }

  async function ensureConcurrentRequestResult(): Promise<ConcurrentRequestProbeResult> {
    concurrentRequestResult ??= measureConcurrentRequests(await ensureFixture(1000), {
      path: "/",
      validate(html) {
        validateNodeHtml("concurrent response", html, 1000);
      },
    });
    return concurrentRequestResult;
  }

  return {
    name: options.name,
    version: readPackageVersion(options.packageName),
    getServerUrl(): string | null {
      return server?.url ?? null;
    },
    async teardown() {
      if (server !== undefined) {
        await server.close();
        server = undefined;
      }
      if (rootDir !== undefined) {
        await rm(rootDir, { force: true, recursive: true });
        rootDir = undefined;
      }
      currentNodeCount = 0;
      concurrentRequestResult = undefined;
    },
    async renderToString(nodeCount: number): Promise<string> {
      const html = await renderPath("/", nodeCount);
      validateNodeHtml("renderToString", html, nodeCount);
      return html;
    },
    async renderToStream(nodeCount: number): Promise<string> {
      const html = await renderPath("/stream-page", nodeCount);
      validateNodeHtml("renderToStream", html, nodeCount);
      return html;
    },
    async renderToRealStream(nodeCount: number): Promise<string> {
      const html = await renderPath("/real-stream-page", nodeCount);
      validateNodeHtml("renderToRealStream", html, nodeCount);
      return html;
    },
    async renderWaterfall(): Promise<string> {
      const html = await renderPath("/waterfall-page", 1000);
      if (!/data-a="?A"?/.test(html) || !/data-b="?B"?/.test(html)) {
        throw new Error(`${options.name} renderWaterfall did not include both branches`);
      }
      return html;
    },
    async renderStaticCachedRoute(nodeCount: number): Promise<string> {
      const html = await renderPath("/static-page", nodeCount);
      validateNodeHtml("renderStaticCachedRoute", html, nodeCount);
      return html;
    },
    async renderDynamicAttrGrid(cellCount: number): Promise<string> {
      const html = await renderPath("/data-grid", 1000);
      validateDynamicAttrHtml("renderDynamicAttrGrid", html, cellCount);
      return html;
    },
    async measureSsrHtmlGzipBytes(): Promise<number> {
      const html = await renderPath("/", 1000);
      validateNodeHtml("SSR HTML gzip probe", html, 1000);
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
    async measureBuildOutputGzipBytes(): Promise<number> {
      await ensureFixture(1000);

      if (rootDir === undefined) {
        throw new Error(`${options.name} fixture not initialized`);
      }

      return measureBuildOutputGzipBytes([rootDir]);
    },
  };
}

async function startFixtureServer(
  options: SimpleSsrAdapterOptions,
  nodeCount: number,
  rootDir: string,
): Promise<ServerHandle> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      let html: string;

      if (url.pathname === "/real-stream-page") {
        await delay(50);
        html = await renderNodePage(options.renderer, nodeCount, rootDir);
      } else if (url.pathname === "/waterfall-page") {
        const [a, b] = await Promise.all([delayValue("A", 50), delayValue("B", 50)]);
        html = `<main><section data-a="${a}">A:${a}</section><section data-b="${b}">B:${b}</section></main>`;
      } else if (url.pathname === "/data-grid") {
        html = renderDynamicAttrGrid(200);
      } else {
        html = await renderNodePage(options.renderer, nodeCount, rootDir);
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.stack : String(error));
    }
  });

  return await new Promise<ServerHandle>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

async function renderNodePage(
  renderer: RendererKind,
  nodeCount: number,
  rootDir: string,
): Promise<string> {
  const items = Array.from({ length: nodeCount }, (_, index) => index);

  if (renderer === "vue") {
    const app = createSSRApp({
      render: () => h("main", null, items.map((index) => h("span", null, String(index)))),
    });
    return renderVueToString(app);
  }

  if (renderer === "svelte") {
    const component = await compileSvelteNodeComponent(nodeCount, rootDir);
    const rendered = renderSvelte(component);
    return rendered.body;
  }

  return `<main>${items.map((index) => `<span>${index}</span>`).join("")}</main>`;
}

const svelteNodeComponentCache = new Map<number, unknown>();

async function compileSvelteNodeComponent(
  nodeCount: number,
  rootDir: string,
): Promise<Parameters<typeof renderSvelte>[0]> {
  const cacheKey = `${rootDir}\0${nodeCount}`;
  const cached = svelteNodeComponentCache.get(cacheKey);
  if (cached !== undefined) {
    return cached as Parameters<typeof renderSvelte>[0];
  }

  const source = `<script>const items = Array.from({ length: ${nodeCount} }, (_, index) => index);</script><main>{#each items as index}<span>{index}</span>{/each}</main>`;
  const compiled = compileSvelte(source, {
    dev: false,
    generate: "server",
    name: "RouterBenchmark",
  });
  const modulePath = join(rootDir, `svelte-node-${nodeCount}.mjs`);
  await writeFile(modulePath, compiled.js.code);
  const mod = (await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`)) as {
    default: unknown;
  };
  svelteNodeComponentCache.set(cacheKey, mod.default);
  return mod.default as Parameters<typeof renderSvelte>[0];
}

function renderDynamicAttrGrid(cellCount: number): string {
  const cells = buildDynamicAttrCells(cellCount);
  return `<main>${cells
    .map(
      (cell) =>
        `<div class="cell ${escapeHtml(cell.kind)}" data-row="${cell.row}" data-col="${cell.col}" data-kind="${escapeHtml(cell.kind)}" title="${escapeHtml(cell.title)}" aria-label="${escapeHtml(cell.label)}" style="background:${escapeHtml(cell.bg)};color:${escapeHtml(cell.fg)}">${escapeHtml(cell.text)}</div>`,
    )
    .join("")}</main>`;
}

async function writeFixtureSources(
  rootDir: string,
  options: SimpleSsrAdapterOptions,
  nodeCount: number,
): Promise<void> {
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: `mreact-bench-${options.name}-fixture`,
        private: true,
        type: "module",
        dependencies: { [options.packageName]: readPackageVersion(options.packageName) },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(rootDir, "fixture.js"),
    `export const framework = ${JSON.stringify(options.name)};
export const renderer = ${JSON.stringify(options.renderer)};
export const nodeCount = ${nodeCount};
`,
  );
}

function readPackageVersion(packageName: string): string {
  const pkg = requireFromHere(`${packageName}/package.json`) as { version?: string };
  return pkg.version ?? "unknown";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function delayValue<T>(value: T, ms: number): Promise<T> {
  await delay(ms);
  return value;
}
