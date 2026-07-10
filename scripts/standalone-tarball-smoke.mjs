#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withStandaloneSmokeWorkspace } from "./standalone-tarball-smoke-workspace.mjs";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const packagesDir = join(rootDir, "packages");

await withStandaloneSmokeWorkspace(async ({ appDir, packDir }) => {
  await run("pnpm", ["build"], { cwd: rootDir });
  const tarballs = await packWorkspacePackages(packDir);
  await createStandaloneApp(appDir, tarballs);
  await run("pnpm", ["--dir", appDir, "install", "--ignore-scripts=false"], {
    cwd: rootDir,
  });
  await run("pnpm", ["--dir", appDir, "exec", "tsc", "--noEmit"], { cwd: rootDir });
  await smokeDevServer(appDir);
  await run("pnpm", ["--dir", appDir, "exec", "mreact-router", "build", "--target=node"], {
    cwd: rootDir,
  });
  await smokeBuiltServer(appDir);
  console.log("Standalone tarball smoke passed.");
});

async function packWorkspacePackages(packDir) {
  await mkdir(packDir, { recursive: true });
  const packageInfos = await readPublicPackageInfos();
  const tarballs = new Map();

  for (const packageInfo of packageInfos) {
    const result = await run(
      "corepack",
      ["pnpm", "--dir", packageInfo.dir, "pack", "--pack-destination", packDir],
      { cwd: rootDir },
    );

    const tarballName = result.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    if (tarballName === undefined) {
      throw new Error(`Could not determine packed tarball for ${packageInfo.name}`);
    }

    tarballs.set(packageInfo.name, join(packDir, basename(tarballName)));
  }

  return tarballs;
}

async function readPublicPackageInfos() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const infos = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dir = join(packagesDir, entry.name);
    const manifestPath = join(dir, "package.json");
    let manifest;

    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    if (manifest.private === true || typeof manifest.name !== "string") {
      continue;
    }

    infos.push({ dir, name: manifest.name });
  }

  return infos.sort((left, right) => left.name.localeCompare(right.name));
}

async function createStandaloneApp(appDir, tarballs) {
  await mkdir(join(appDir, "app"), { recursive: true });
  const packageJson = {
    name: "mreact-standalone-tarball-smoke",
    private: true,
    scripts: {
      build: "mreact-router build --target=node",
      dev: "mreact-router dev --port 0",
      start: "mreact-router start .mreact",
    },
    type: "module",
    dependencies: {
      "@reckona/mreact": tarballSpec(tarballs, "@reckona/mreact"),
      "@reckona/mreact-compat": tarballSpec(tarballs, "@reckona/mreact-compat"),
      "@reckona/mreact-compiler": tarballSpec(tarballs, "@reckona/mreact-compiler"),
      "@reckona/mreact-forms": tarballSpec(tarballs, "@reckona/mreact-forms"),
      "@reckona/mreact-query": tarballSpec(tarballs, "@reckona/mreact-query"),
      "@reckona/mreact-reactive-dom": tarballSpec(tarballs, "@reckona/mreact-reactive-dom"),
      "@reckona/mreact-router": tarballSpec(tarballs, "@reckona/mreact-router"),
      "@reckona/mreact-server": tarballSpec(tarballs, "@reckona/mreact-server"),
      "@reckona/mreact-store": tarballSpec(tarballs, "@reckona/mreact-store"),
      "@types/node": "25.7.0",
      typescript: "7.0.2",
      vite: "8.1.4",
    },
    devDependencies: {},
    pnpm: {
      overrides: Object.fromEntries(
        [...tarballs.entries()]
          .filter(([name]) => name.startsWith("@reckona/"))
          .map(([name, tarball]) => [name, fileUrl(tarball)]),
      ),
      onlyBuiltDependencies: ["@parcel/watcher", "esbuild", "sharp", "workerd"],
    },
  };

  await writeFile(join(appDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(
    join(appDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@reckona/mreact",
          lib: ["ESNext", "DOM"],
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
          types: ["node", "@reckona/mreact-router/app-router-globals"],
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(appDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [mreactRouter({ routesDir: "app" })],
});
`,
  );
  await writeFile(
    join(appDir, "app", "page.tsx"),
    `export default function Page() {
  return <main>Standalone tarball smoke</main>;
}
`,
  );
  await writeFile(
    join(appDir, "public-contract.ts"),
    `import type {
  AppRouterRenderPreload,
  RenderBuiltAppRequestOptions,
  ResponseSinkStrategy,
  StartServerOptions,
} from "@reckona/mreact-router";
import type { ReactElement } from "@reckona/mreact";
import type {
  ComponentConstructor,
  EffectCallback,
  HydrationEventReplayOptions,
  ReactCompatContext,
  ReactCompatElement,
  ReactCompatPortal,
  RootRuntimeOptions,
} from "@reckona/mreact-compat";
import type { FlightObjectModel, HydrateRootOptions } from "@reckona/mreact-compat/flight";
import type { EffectCallback as HooksEffectCallback } from "@reckona/mreact-compat/hooks";
import type {
  ElementType as JsxElementType,
  ReactiveDomBlockProps,
  ReactCompatNode as JsxReactCompatNode,
} from "@reckona/mreact-compat/jsx-runtime";
import type {
  JSXDOMAttributes,
  ReactiveDomBlockResult,
} from "@reckona/mreact-compat/jsx-dev-runtime";
import type {
  SchedulerProfilingEvent,
  unstable_CallbackNode,
  unstable_ProfilingEvent,
} from "@reckona/mreact-compat/scheduler";
import type { ReactCompatContextLike } from "@reckona/mreact-compat/server";
import type { ParserMode } from "@reckona/mreact-compiler";
import type {
  AnalyzeToIrInput,
  AnalyzeToIrOutput,
  CompilerModuleContext,
  ModuleIr,
} from "@reckona/mreact-compiler/oxc";
import type {
  BaseCreateFormOptions,
  StandardSchemaValidationResult,
} from "@reckona/mreact-forms";
import type { QueryClient } from "@reckona/mreact-query";
import type {
  BindListOptions,
  BindStaticKeyedSingleNodeListSelectedClassOptions,
  BindTextBatchOptions,
  BindTextOptions,
  SingleNodeRenderer,
} from "@reckona/mreact-reactive-dom";
import type {
  AppRouterCache,
  CacheControlOptions,
  CookieOptions,
  MemoryRouteCacheOptions,
  RedirectOptions,
  RequestCookies,
} from "@reckona/mreact-router/request";
import type {
  AppRouterCache as NodeAppRouterCache,
  NodeRequestHandler,
  NodeRequestHandlerOptions,
  RequestHostPolicy as NodeRequestHostPolicy,
  ResponseSinkStrategy as NodeResponseSinkStrategy,
  RouterRequestInstrumentationEvent as NodeRequestInstrumentationEvent,
} from "@reckona/mreact-router/adapters/node";
import type {
  AppRouterLogger as EdgeAppRouterLogger,
  EdgeRequestHandler,
  EdgeRequestHandlerOptions,
} from "@reckona/mreact-router/adapters/edge";
import type {
  AppRoute as CloudflareAppRoute,
  BuiltServerManifest as CloudflareBuiltServerManifest,
  CloudflareRequestHandlerOptions,
  CloudflareRequestHandler,
  RouteMetadata as CloudflareRouteMetadata,
} from "@reckona/mreact-router/adapters/cloudflare";
import type {
  AppRouterCache as LambdaAppRouterCache,
  AwsLambdaRequestHandler,
  AwsLambdaRequestHandlerOptions,
  AwsLambdaStreamingRequestHandler,
  RouterRequestInstrumentationEvent as LambdaRequestInstrumentationEvent,
} from "@reckona/mreact-router/adapters/aws-lambda";
import type { LinkSinkProps } from "@reckona/mreact-router/link";
import type { LinkSinkChild } from "@reckona/mreact-router";
import type {
  AppRouterCache as ViteAppRouterCache,
  AppRouterProjectOptions,
  AppRouterRequestStartLogEvent,
  RequestHostPolicy,
  ResolvedAppRouterProject,
} from "@reckona/mreact-router/vite";
import type {
  FlightDateModel,
  FlightObjectModel as ServerFlightObjectModel,
  ReactFlightProtocolCoverage,
} from "@reckona/mreact-server";
import type { NodeBuffer } from "@reckona/mreact-server/buffer-sink";
import type { HydrationScriptOptions, StreamRender } from "@reckona/mreact-server/html-helpers";
import {
  persistedStoreState,
  type LegacyStorePersistedState,
  type StorePersistOptions,
} from "@reckona/mreact-store";

const cacheControl: CacheControlOptions = { sMaxAge: 60 };
const cookie: CookieOptions = { httpOnly: true, path: "/" };
const memory: MemoryRouteCacheOptions = { maxEntries: 10 };
const redirect: RedirectOptions = { status: 303 };
const cache = {} as AppRouterCache;
const cookies = {} as RequestCookies;
const preload = {} as AppRouterRenderPreload;
const sink: ResponseSinkStrategy = "string";
const render = {} as RenderBuiltAppRequestOptions;
const server = {} as StartServerOptions;
const nodeCache = {} as NodeAppRouterCache;
const nodeHostPolicy: NodeRequestHostPolicy = "strict";
const nodeSink: NodeResponseSinkStrategy = "buffer";
const nodeInstrumentation = {} as NodeRequestInstrumentationEvent;
const nodeOptions = {} as NodeRequestHandlerOptions;
const nodeHandler = {} as NodeRequestHandler;
const edgeLogger = {} as EdgeAppRouterLogger;
const edgeOptions = {} as EdgeRequestHandlerOptions;
const edgeHandler = {} as EdgeRequestHandler;
const cloudflareRoute = {} as CloudflareAppRoute;
const cloudflareManifest = {} as CloudflareBuiltServerManifest;
const cloudflareMetadata = {} as CloudflareRouteMetadata;
const cloudflareOptions = {} as CloudflareRequestHandlerOptions;
const cloudflareHandler = {} as CloudflareRequestHandler;
const lambdaCache = {} as LambdaAppRouterCache;
const lambdaInstrumentation = {} as LambdaRequestInstrumentationEvent;
const lambdaOptions = {} as AwsLambdaRequestHandlerOptions;
const lambdaHandler = {} as AwsLambdaRequestHandler;
const lambdaStreamingHandler = {} as AwsLambdaStreamingRequestHandler;
const validSinkProps: LinkSinkProps = { href: "/typed", style: { color: "red" } };
// @ts-expect-error HtmlSink Link props reject browser-only function values.
const invalidSinkProps: LinkSinkProps = { href: "/typed", onClick() {} };
// @ts-expect-error HtmlSink data attributes accept only primitive serializable values.
const invalidSinkData: LinkSinkProps = { href: "/typed", "data-config": { mode: "full" } };
// @ts-expect-error HtmlSink children cannot contain browser DOM nodes.
const invalidSinkChild: LinkSinkProps = { href: "/typed", children: document.createElement("span") };
// @ts-expect-error HtmlSink children cannot contain compat elements.
const invalidSinkElement: LinkSinkProps = { href: "/typed", children: {} as ReactElement };
// @ts-expect-error HtmlSink Link props reject browser refs.
const invalidSinkRef: LinkSinkProps = { href: "/typed", ref: { current: null } };
type PersistedDomainState = { count: number };
const rawPersist: StorePersistOptions<PersistedDomainState> = {
  load: () => ({ count: 1 }),
};
const taggedPersist: StorePersistOptions<PersistedDomainState> = {
  load: () => persistedStoreState({ count: 1 }, 1),
};
const legacyPersist: StorePersistOptions<PersistedDomainState> = {
  acceptLegacyPersistedState: true,
  load: (): LegacyStorePersistedState<PersistedDomainState> => ({
    state: { count: 1 },
    version: 1,
  }),
};
type PublicContractMatrix = [
  ComponentConstructor,
  EffectCallback,
  HydrationEventReplayOptions,
  ReactCompatContext<unknown>,
  ReactCompatElement,
  ReactCompatPortal,
  RootRuntimeOptions,
  FlightObjectModel,
  HydrateRootOptions,
  HooksEffectCallback,
  JsxElementType,
  ReactiveDomBlockProps,
  JsxReactCompatNode,
  JSXDOMAttributes<HTMLElement>,
  ReactiveDomBlockResult,
  SchedulerProfilingEvent,
  unstable_CallbackNode,
  unstable_ProfilingEvent,
  ReactCompatContextLike<unknown>,
  ParserMode,
  AnalyzeToIrInput,
  AnalyzeToIrOutput,
  CompilerModuleContext,
  ModuleIr,
  BaseCreateFormOptions<{ value: string }>,
  StandardSchemaValidationResult<string>,
  QueryClient,
  typeof import("@reckona/mreact-query").isQueryClientScopeUnavailableError,
  BindListOptions<string>,
  BindStaticKeyedSingleNodeListSelectedClassOptions<string, HTMLElement>,
  BindTextBatchOptions,
  BindTextOptions,
  SingleNodeRenderer<string, HTMLElement>,
  LinkSinkChild,
  ViteAppRouterCache,
  AppRouterProjectOptions,
  AppRouterRequestStartLogEvent,
  RequestHostPolicy,
  ResolvedAppRouterProject,
  FlightDateModel,
  ServerFlightObjectModel,
  ReactFlightProtocolCoverage,
  NodeBuffer,
  HydrationScriptOptions,
  StreamRender,
];
const publicContractMatrix = {} as PublicContractMatrix;
// @ts-expect-error Untagged legacy envelopes require explicit opt-in.
const invalidLegacyPersist: StorePersistOptions<PersistedDomainState> = {
  load: () => ({ state: { count: 1 }, version: 1 }),
};
void cacheControl;
void cookie;
void memory;
void redirect;
void cache;
void cookies;
void preload;
void sink;
void render;
void server;
void nodeCache;
void nodeHostPolicy;
void nodeSink;
void nodeInstrumentation;
void nodeOptions;
void nodeHandler;
void edgeLogger;
void edgeOptions;
void edgeHandler;
void cloudflareRoute;
void cloudflareManifest;
void cloudflareMetadata;
void cloudflareOptions;
void cloudflareHandler;
void lambdaCache;
void lambdaInstrumentation;
void lambdaOptions;
void lambdaHandler;
void lambdaStreamingHandler;
void validSinkProps;
void invalidSinkProps;
void invalidSinkData;
void invalidSinkChild;
void invalidSinkElement;
void invalidSinkRef;
void rawPersist;
void taggedPersist;
void legacyPersist;
void invalidLegacyPersist;
void publicContractMatrix;
`,
  );
}

async function smokeDevServer(appDir) {
  const server = spawnLongRunning(
    "pnpm",
    ["--dir", appDir, "exec", "mreact-router", "dev", "--port", "0"],
    { cwd: rootDir },
  );

  try {
    const url = await server.waitForUrl(/mreact app router ready at (?<url>http:\/\/[^\s]+)/u);
    await expectHtml(url, "Standalone tarball smoke");
  } finally {
    await server.stop();
  }
}

async function smokeBuiltServer(appDir) {
  const server = spawnLongRunning(
    "pnpm",
    [
      "--dir",
      appDir,
      "exec",
      "mreact-router",
      "start",
      ".mreact",
      "--host",
      "127.0.0.1",
      "--host-policy",
      "strict",
    ],
    { cwd: rootDir, env: { ...process.env, PORT: "0" } },
  );

  try {
    const url = await server.waitForUrl(
      /mreact app router serving built output at (?<url>http:\/\/[^\s]+)/u,
    );
    await expectHtml(url, "Standalone tarball smoke");
  } finally {
    await server.stop();
  }
}

function spawnLongRunning(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let settled = false;
  const waiters = [];

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (error) => {
    for (const waiter of waiters.splice(0)) {
      waiter.reject(error);
    }
  });
  child.on("exit", (code, signal) => {
    settled = true;
    for (const waiter of waiters.splice(0)) {
      waiter.reject(
        new Error(
          `${command} ${args.join(" ")} exited before becoming ready (${formatExit(code, signal)})\n${output}`,
        ),
      );
    }
  });

  return {
    async stop() {
      if (settled) {
        return;
      }

      killLongRunningChild(child, "SIGTERM");
      await new Promise((resolveStop) => {
        const timeout = setTimeout(() => {
          killLongRunningChild(child, "SIGKILL");
          resolveStop();
        }, 5_000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolveStop();
        });
      });
    },
    waitForUrl(pattern) {
      const matched = pattern.exec(output);

      if (matched?.groups?.url !== undefined) {
        return Promise.resolve(matched.groups.url);
      }

      return new Promise((resolveWaiter, rejectWaiter) => {
        const timeout = setTimeout(() => {
          rejectWaiter(new Error(`${command} ${args.join(" ")} did not become ready\n${output}`));
        }, 60_000);
        waiters.push({
          pattern,
          reject(error) {
            clearTimeout(timeout);
            rejectWaiter(error);
          },
          resolve(url) {
            clearTimeout(timeout);
            resolveWaiter(url);
          },
        });
      });
    },
  };

  function onData(chunk) {
    output += chunk.toString();

    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const matched = waiter.pattern.exec(output);

      if (matched?.groups?.url === undefined) {
        continue;
      }

      waiters.splice(index, 1);
      waiter.resolve(matched.groups.url);
    }
  }
}

function killLongRunningChild(child, signal) {
  if (process.platform === "win32" || child.pid === undefined) {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

async function expectHtml(url, expectedText) {
  const response = await fetch(url);
  const text = await response.text();

  if (response.status !== 200 || !text.includes(expectedText)) {
    throw new Error(
      `Expected ${url} to return 200 with ${JSON.stringify(expectedText)}, got ${response.status}\n${text.slice(0, 500)}`,
    );
  }
}

function tarballSpec(tarballs, name) {
  const tarball = tarballs.get(name);

  if (tarball === undefined) {
    throw new Error(`Missing packed tarball for ${name}`);
  }

  return fileUrl(tarball);
}

function fileUrl(path) {
  return pathToFileURL(path).href;
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolveRun({ stderr, stdout });
        return;
      }

      rejectRun(
        new Error(
          `${command} ${args.join(" ")} failed with ${formatExit(exitCode, signal)}\n${stdout}\n${stderr}`,
        ),
      );
    });
  });
}

function formatExit(exitCode, signal) {
  return signal === null ? `exit code ${exitCode}` : `signal ${signal}`;
}
