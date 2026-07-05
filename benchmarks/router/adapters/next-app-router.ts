// next-app-router adapter。Next.js App Router の fixture を `next build` で
// production build し、`getRequestHandler()` を `http.Server` に乗せて HTTP
// 越しに fetch する。mreact 側と同じ HTTP round-trip overhead で比較が成立する。
//
// `next build` は重い (10〜30 秒)。adapter init 時に 1 回だけ build し、
// fixture / server を再利用する。`pnpm bench:router` 1 回あたりの
// 追加ランタイムはこの build 時間が支配的。
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as pathResolve } from "node:path";
import { createRequire } from "node:module";
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

const requireFromHere = createRequire(import.meta.url);
const nextPkgJsonPath = requireFromHere.resolve("next/package.json");
const nextPackageJson = JSON.parse(await readFile(nextPkgJsonPath, "utf8")) as { version: string };

const repoRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureParent = pathResolve(repoRoot, "benchmarks/router/.tmp");

interface ServerHandle {
  close(): Promise<void>;
  url: string;
}

let rootDir: string | undefined;
let server: ServerHandle | undefined;
let currentNodeCount = 0;
let browserRootDir: string | undefined;
let browserServer: ServerHandle | undefined;

const nextBinPath = requireFromHere.resolve("next/dist/bin/next");

async function runNextBuild(cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [nextBinPath, "build"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        // Force production NODE_ENV — vitest / tsx default to "test" which
        // makes Next 16 mis-resolve React (useContext null bug).
        NODE_ENV: "production",
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`next build exit ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

async function ensureFixture(nodeCount: number): Promise<string> {
  if (rootDir !== undefined && currentNodeCount === nodeCount && server !== undefined) {
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
  rootDir = await mkdtemp(join(fixtureParent, "next-fixture-"));
  // Rely on parent-dir traversal for node_modules resolution. Pnpm install
  // inside a temp dir triggers a Next.js 16.2 internal _global-error bug
  // ("Invariant: Expected workStore to be initialized").
  const appDir = join(rootDir, "app");
  await mkdir(join(appDir, "stream-page"), { recursive: true });
  await mkdir(join(appDir, "static-page"), { recursive: true });
  await mkdir(join(appDir, "real-stream-page"), { recursive: true });
  await mkdir(join(appDir, "waterfall-page"), { recursive: true });
  await mkdir(join(appDir, "data-grid"), { recursive: true });

  const items = Array.from({ length: nodeCount }, (_, index) => index);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-next-fixture",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(rootDir, "next.config.mjs"),
    `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
export default {
  reactStrictMode: false,
  turbopack: { root: resolve(here, "..", "..", "..", "..") },
};`,
  );

  await writeFile(
    join(rootDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "preserve",
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          incremental: true,
        },
        include: ["app", "next-env.d.ts"],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}`,
  );

  await writeFile(
    join(appDir, "page.tsx"),
    `export const dynamic = "force-dynamic";
const items: number[] = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  // streaming variant: server component with Suspense + async data
  await writeFile(
    join(appDir, "stream-page", "page.tsx"),
    `import { Suspense } from "react";
export const dynamic = "force-dynamic";
const items: number[] = ${arrayLiteral};
async function Inner() {
  await Promise.resolve();
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}
export default function Page() {
  return <Suspense fallback={<p>loading</p>}><Inner /></Suspense>;
}`,
  );

  // Static/cacheable variant: no `force-dynamic`, no async data, and the
  // item array is module-local so Next App Router can prerender/cache it.
  await writeFile(
    join(appDir, "static-page", "page.tsx"),
    `const items: number[] = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  // real streaming: async server component that genuinely awaits 50ms,
  // forcing shell pre-flush + body chunk delivery.
  await writeFile(
    join(appDir, "real-stream-page", "page.tsx"),
    `import { Suspense } from "react";
export const dynamic = "force-dynamic";
const items: number[] = ${arrayLiteral};
async function Inner() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return <ul>{items.map((index) => <span key={index}>{index}</span>)}</ul>;
}
export default function Page() {
  return <main><Suspense fallback={<p>loading</p>}><Inner /></Suspense></main>;
}`,
  );

  // waterfall fixture: two **sibling** Suspense boundaries each awaiting
  // 50 ms independently. If Next runs them in parallel TTLB ~50 ms; if a
  // serialization bug surfaces, TTLB ~100 ms.
  await writeFile(
    join(appDir, "waterfall-page", "page.tsx"),
    `import { Suspense } from "react";
export const dynamic = "force-dynamic";
async function InnerA() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return <section data-a="A">A:A</section>;
}
async function InnerB() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return <section data-b="B">B:B</section>;
}
export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>loadingA</p>}><InnerA /></Suspense>
      <Suspense fallback={<p>loadingB</p>}><InnerB /></Suspense>
    </main>
  );
}`,
  );

  // dynamic-attribute heavy fixture: parallel to mreact side.
  const cells = buildDynamicAttrCells(200);
  const cellsLiteral = JSON.stringify(cells);
  await writeFile(
    join(appDir, "data-grid", "page.tsx"),
    `export const dynamic = "force-dynamic";
const cells = ${cellsLiteral};
export default function Page() {
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
}`,
  );

  // Note: we *intended* to add a `/counter` Client Component route (parallel
  // to the mreact-side bundle-size fixture) so the bundle comparison is fully
  // apples-to-apples. However, Next.js 16.2.6 hits an internal `_global-error`
  // / `_not-found` prerender bug ("Invariant: Expected workStore to be
  // initialized. This is a bug in Next.js.") as soon as any user Client
  // Component is present in the fixture. Working around the Next bug is out
  // of scope, so the Next.js side reports the **framework client JS floor**
  // (framework + main-app + RSC runtime + router + polyfills), which Next.js
  // ships unconditionally regardless of `"use client"` usage. The mreact side
  // reports its full interactive Client Component bundle. See log
  // 2026-05-12-028 for the honesty filter applied to this asymmetry.

  // next-env.d.ts so TS compile in Next does not complain about JSX
  await writeFile(
    join(rootDir, "next-env.d.ts"),
    `/// <reference types="next" />\n/// <reference types="next/types/global" />\n`,
  );

  // Run `next build` via spawn (programmatic build() API in Next 16 has a
  // signature mismatch that triggers _global-error / useContext bugs)
  await runNextBuild(rootDir);

  // Start the production server in-process
  const nextModule = await import("next");
  const nextDefault = (nextModule as { default: (options: unknown) => unknown }).default;
  const app = nextDefault({
    dev: false,
    dir: rootDir,
    quiet: true,
  }) as {
    prepare(): Promise<void>;
    getRequestHandler(): (req: unknown, res: unknown) => Promise<void>;
  };
  await app.prepare();
  const handler = app.getRequestHandler();
  const httpServer: Server = createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  server = {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      ),
  };
  currentNodeCount = nodeCount;
  return server.url;
}

async function ensureBrowserFixture(): Promise<string> {
  if (browserRootDir !== undefined && browserServer !== undefined) {
    return browserServer.url;
  }

  if (browserServer !== undefined) {
    await browserServer.close();
    browserServer = undefined;
  }
  if (browserRootDir !== undefined) {
    await rm(browserRootDir, { force: true, recursive: true });
  }

  await mkdir(fixtureParent, { recursive: true });
  browserRootDir = await mkdtemp(join(fixtureParent, "next-browser-fixture-"));
  const appDir = join(browserRootDir, "app");
  await mkdir(join(appDir, "target"), { recursive: true });

  await writeFile(
    join(browserRootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-next-browser-fixture",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(browserRootDir, "next.config.mjs"),
    `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
export default {
  reactStrictMode: false,
  turbopack: { root: resolve(here, "..", "..", "..", "..") },
};`,
  );
  await writeFile(
    join(browserRootDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "preserve",
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          incremental: true,
        },
        include: ["app", "next-env.d.ts"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `"use client";
import Link from "next/link";
import { useState } from "react";

export default function Page() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <button type="button" onClick={() => setCount((value) => value + 1)}>count: {count}</button>
      <Link href="/target">Details</Link>
    </main>
  );
}`,
  );
  await writeFile(
    join(appDir, "target", "page.tsx"),
    `export const dynamic = "force-dynamic";
export default function Page() {
  return <main><h1>Navigation target</h1><p>loader:loaded-target</p></main>;
}`,
  );
  await writeFile(
    join(browserRootDir, "next-env.d.ts"),
    `/// <reference types="next" />\n/// <reference types="next/types/global" />\n`,
  );

  await runNextBuild(browserRootDir);

  const nextModule = await import("next");
  const nextDefault = (nextModule as { default: (options: unknown) => unknown }).default;
  const app = nextDefault({
    dev: false,
    dir: browserRootDir,
    quiet: true,
  }) as {
    prepare(): Promise<void>;
    getRequestHandler(): (req: unknown, res: unknown) => Promise<void>;
  };
  await app.prepare();
  const handler = app.getRequestHandler();
  const httpServer: Server = createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  browserServer = {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      ),
  };
  return browserServer.url;
}

export const nextAppRouterAdapter: AppFrameworkAdapter = {
  name: "next-app-router",
  version: nextPackageJson.version,
  async setup() {
    // fixture is built lazily on first call (next build is heavy)
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
      throw new Error("next-app-router renderToString did not include the last node");
    }

    return html;
  },
  async renderToStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/stream-page`);
    const html = await response.text();

    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("next-app-router renderToStream did not include the last node");
    }

    return html;
  },
  async renderToRealStream(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/real-stream-page`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("next-app-router renderToRealStream did not include the last node");
    }
    return html;
  },
  async renderWaterfall(): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/waterfall-page`);
    const html = await response.text();
    if (!html.includes(`data-a="A"`) || !html.includes(`data-b="B"`)) {
      throw new Error("next-app-router renderWaterfall did not include both branches");
    }
    return html;
  },
  async renderStaticCachedRoute(nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}/static-page`);
    const html = await response.text();
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error("next-app-router renderStaticCachedRoute did not include the last node");
    }
    return html;
  },
  async renderDynamicAttrGrid(cellCount: number): Promise<string> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/data-grid`);
    const html = await response.text();
    if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
      throw new Error(
        "next-app-router renderDynamicAttrGrid did not include the last escaped text",
      );
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
      throw new Error("next-app-router fixture not initialized");
    }

    return measureBuildOutputGzipBytes([
      join(rootDir, ".next", "server"),
      join(rootDir, ".next", "static"),
    ]);
  },
  async measureSsrHtmlGzipBytes(): Promise<number> {
    const url = await ensureFixture(1000);
    const response = await fetch(`${url}/`);
    const html = await response.text();

    if (!html.includes(`<span>999</span>`)) {
      throw new Error("next-app-router SSR HTML gzip probe did not include the last node");
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
        throw new Error("next-app-router concurrent response did not include the last node");
      }
    },
  });
}
