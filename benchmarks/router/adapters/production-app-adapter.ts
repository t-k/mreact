import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { measureBuildOutputGzipBytes } from "../build-output-size.js";
import {
  measureBackForwardRestore,
  measureClientNavigation,
  measureFirstInteractionAfterNetworkIdle,
  measureFirstInteractionFromDomContentLoaded,
  measureInitialPageLoadBeforeInteraction,
  measureRouteJavaScriptGzipBytes,
  measureSecondInteractionLatency,
} from "../browser-probes.js";
import {
  measureConcurrentRequests,
  type ConcurrentRequestProbeResult,
} from "../http-probes.js";
import type { AppFrameworkAdapter, AppFrameworkName } from "../types.js";

interface ServerHandle {
  close(): Promise<void>;
  url: string;
}

export interface ProductionAppAdapterOptions {
  build: (rootDir: string) => Promise<void>;
  buildOutputPaths?: (rootDir: string) => readonly string[];
  fixturePrefix: string;
  includeAsyncDataRoutes?: boolean;
  name: AppFrameworkName;
  packageName: string;
  start: (rootDir: string) => Promise<ServerHandle>;
  writeFixture: (rootDir: string, nodeCount: number) => Promise<void>;
}

const requireFromHere = createRequire(import.meta.url);
const repoRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureParent = pathResolve(repoRoot, "benchmarks/router/.tmp");

export function createProductionAppAdapter(
  options: ProductionAppAdapterOptions,
): AppFrameworkAdapter {
  let rootDir: string | undefined;
  let server: ServerHandle | undefined;
  let currentNodeCount = 0;

  async function ensureFixture(nodeCount: number): Promise<string> {
    if (rootDir !== undefined && server !== undefined && currentNodeCount === nodeCount) {
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
    rootDir = await mkdtemp(join(fixtureParent, options.fixturePrefix));
    currentNodeCount = nodeCount;

    await options.writeFixture(rootDir, nodeCount);
    await options.build(rootDir);
    server = await options.start(rootDir);
    return server.url;
  }

  async function renderPath(path: string, nodeCount: number): Promise<string> {
    const url = await ensureFixture(nodeCount);
    const response = await fetch(`${url}${path}`);
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`${options.name} ${path} returned ${response.status}: ${html.slice(0, 2000)}`);
    }
    return html;
  }

  function validateNodeHtml(method: string, html: string, nodeCount: number): void {
    if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
      throw new Error(`${options.name} ${method} did not include the last node`);
    }
  }

  function validateDynamicAttrHtml(method: string, html: string, cellCount: number): void {
    if (!html.includes(`Item #${cellCount - 1}`) || !html.includes("&lt;data")) {
      throw new Error(`${options.name} ${method} did not include the last escaped text`);
    }
  }

  async function ensureConcurrentRequestResult(): Promise<ConcurrentRequestProbeResult> {
    return measureConcurrentRequests(await ensureFixture(1000), {
      path: "/",
      validate(html) {
        validateNodeHtml("concurrent response", html, 1000);
      },
    });
  }

  async function interactiveRouteUrl(): Promise<string> {
    return new URL("/interactive-bundle", await ensureFixture(1000)).href;
  }

  const adapter: AppFrameworkAdapter = {
    fixtureKind: "production-app",
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
    async measureServerOnlyClientBundleBytes(): Promise<number> {
      const url = await ensureFixture(1000);
      return measureRouteJavaScriptGzipBytes(`${url}/server-only-bundle`);
    },
    async measureInteractiveClientBundleBytes(): Promise<number> {
      const url = await ensureFixture(1000);
      return measureRouteJavaScriptGzipBytes(`${url}/interactive-bundle`, {
        assertInteractive: true,
      });
    },
    async measureInteractiveClientBundleMinimalBytes(): Promise<number> {
      const url = await ensureFixture(1000);
      return measureRouteJavaScriptGzipBytes(`${url}/interactive-minimal-bundle`, {
        assertInteractive: true,
      });
    },
    async measureClientNavigationMs(): Promise<number> {
      return measureClientNavigation(await interactiveRouteUrl());
    },
    async measureInitialPageLoadBeforeInteractionMs(): Promise<number> {
      return measureInitialPageLoadBeforeInteraction(await interactiveRouteUrl());
    },
    async measureFirstInteractionFromDomContentLoadedMs(): Promise<number> {
      return measureFirstInteractionFromDomContentLoaded(await interactiveRouteUrl());
    },
    async measureFirstInteractionAfterNetworkIdleMs(): Promise<number> {
      return measureFirstInteractionAfterNetworkIdle(await interactiveRouteUrl());
    },
    async measureSecondInteractionLatencyMs(): Promise<number> {
      return measureSecondInteractionLatency(await interactiveRouteUrl());
    },
    async measureBackForwardRestoreMs(): Promise<number> {
      return measureBackForwardRestore(await interactiveRouteUrl(), {
        expectStateRestore: false,
      });
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
      return measureBuildOutputGzipBytes(options.buildOutputPaths?.(rootDir) ?? [rootDir]);
    },
  };

  if (options.includeAsyncDataRoutes !== false) {
    adapter.renderToRealStream = async (nodeCount: number): Promise<string> => {
      const html = await renderPath("/real-stream-page", nodeCount);
      validateNodeHtml("renderToRealStream", html, nodeCount);
      return html;
    };
    adapter.renderWaterfall = async (): Promise<string> => {
      const html = await renderPath("/waterfall-page", 1000);
      if (!/data-a="?A"?/.test(html) || !/data-b="?B"?/.test(html)) {
        throw new Error(`${options.name} renderWaterfall did not include both branches`);
      }
      return html;
    };
  }

  return adapter;
}

export async function spawnAndWait(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
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
        reject(new Error(`${command} ${args.join(" ")} exit ${code}: ${stderr.slice(-4000)}`));
      }
    });
  });
}

export async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server: Server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

export async function startCommandServer(
  command: string,
  args: readonly string[] | ((port: number) => readonly string[]),
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    healthPath?: string;
    timeoutMs?: number;
  },
): Promise<ServerHandle> {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const resolvedArgs = typeof args === "function" ? args(port) : args;
  const child = spawn(command, [...resolvedArgs], {
    cwd: options.cwd,
    detached: true,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const ready = await waitForServer(`${url}${options.healthPath ?? "/"}`, options.timeoutMs ?? 30_000);
  if (!ready) {
    await closeChildProcess(child);
    throw new Error(`${command} ${resolvedArgs.join(" ")} did not start: ${stderr.slice(-4000)}`);
  }

  return {
    url,
    close: () => closeChildProcess(child),
  };
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok || response.status === 404) {
        return true;
      }
    } catch {
      // Server is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function closeChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      killChildProcessGroup(child, "SIGKILL");
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    killChildProcessGroup(child, "SIGTERM");
  });
}

function killChildProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function readPackageVersion(packageName: string): string {
  try {
    const packageJsonPath = requireFromHere.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(requireFromHere("node:fs").readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return packageJson.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
