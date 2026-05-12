import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";
import type { BuiltServerManifest } from "./build.js";
import type { AppRouterCache } from "./cache.js";
import type { ClientRouteManifestEntry } from "./client.js";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import { renderAppRequest } from "./render.js";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";

interface BuiltRuntime {
  appDir: string;
  clientScripts: ReadonlyMap<string, string>;
  serverModuleCacheVersion: string;
}

interface BuiltRuntimeCacheEntry {
  clientManifestText: string;
  runtime: Promise<BuiltRuntime>;
  serverManifestText: string;
}

const builtRuntimeCache = new Map<string, BuiltRuntimeCacheEntry>();

export interface RenderBuiltAppRequestOptions {
  outDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

export interface StartServerOptions {
  outDir: string;
  port: number;
  hostname?: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

export async function renderBuiltAppRequest(
  options: RenderBuiltAppRequestOptions,
): Promise<Response> {
  const url = new URL(options.request.url);

  if (url.pathname.startsWith("/_mreact/client/")) {
    return readBuiltClientAsset(options.outDir, url.pathname);
  }

  const runtime = await readBuiltRuntime(options.outDir);

  return renderAppRequest({
    appDir: runtime.appDir,
    clientScripts: runtime.clientScripts,
    importPolicy: options.importPolicy,
    request: options.request,
    routeCache: options.routeCache,
    serverModuleCacheVersion: runtime.serverModuleCacheVersion,
    serverActions: options.serverActions,
  });
}

export async function startServer(
  options: StartServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host ?? `${options.hostname ?? "127.0.0.1"}:${options.port}`}`;
      const request = nodeRequestToWebRequest(incoming, origin);
      const response = await renderBuiltAppRequest({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        request,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
      });

      await sendResponse(outgoing, response);
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.setHeader("content-type", "text/plain; charset=utf-8");
      outgoing.end(error instanceof Error ? error.stack : String(error));
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port, options.hostname ?? "127.0.0.1", resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    url: `http://${options.hostname ?? "127.0.0.1"}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function readBuiltClientAsset(outDir: string, pathname: string): Promise<Response> {
  const clientPrefix = "/_mreact/client/";
  const relativePath = pathname.slice(clientPrefix.length);
  const normalized = normalize(relativePath);

  if (normalized.startsWith("..")) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const code = await readFile(join(outDir, "client", normalized), "utf8");

    return new Response(code, {
      headers: clientAssetHeaders(normalized),
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

async function readBuiltRuntime(outDir: string): Promise<BuiltRuntime> {
  const [serverManifestText, clientManifestText] = await Promise.all([
    readFile(join(outDir, "server", "manifest.json"), "utf8"),
    readFile(join(outDir, "client", "manifest.json"), "utf8"),
  ]);
  const cached = builtRuntimeCache.get(outDir);

  if (
    cached !== undefined &&
    cached.serverManifestText === serverManifestText &&
    cached.clientManifestText === clientManifestText
  ) {
    return cached.runtime;
  }

  const runtime = materializeBuiltRuntime({
    clientManifestText,
    outDir,
    serverManifestText,
  });

  builtRuntimeCache.set(outDir, {
    clientManifestText,
    runtime,
    serverManifestText,
  });

  return runtime;
}

async function materializeBuiltRuntime(options: {
  clientManifestText: string;
  outDir: string;
  serverManifestText: string;
}): Promise<BuiltRuntime> {
  const serverManifest = JSON.parse(options.serverManifestText) as BuiltServerManifest;
  const clientManifest = JSON.parse(options.clientManifestText) as {
    routes: ClientRouteManifestEntry[];
  };
  const appDir = await materializeBuiltServerApp(options.outDir, serverManifest);
  const clientScripts = new Map(
    clientManifest.routes.flatMap((route) =>
      route.client && route.script !== undefined ? [[route.path, route.script]] : [],
    ),
  );
  const serverModuleCacheVersion = createHash("sha256")
    .update(options.serverManifestText)
    .update("\0")
    .update(options.clientManifestText)
    .digest("hex")
    .slice(0, 16);

  return { appDir, clientScripts, serverModuleCacheVersion };
}

async function materializeBuiltServerApp(
  outDir: string,
  manifest: BuiltServerManifest,
): Promise<string> {
  const appDir = join(outDir, "server", "runtime", "app");

  await rm(appDir, { force: true, recursive: true });
  await Promise.all(
    Object.entries(manifest.files).map(async ([file, code]) => {
      const outputFile = join(appDir, safeManifestFilePath(file));

      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, code);
    }),
  );

  return appDir;
}

function safeManifestFilePath(pathname: string): string {
  const normalized = normalize(pathname);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Invalid built app manifest file path: ${pathname}`);
  }

  return normalized;
}

function clientAssetHeaders(pathname: string): HeadersInit {
  if (pathname === "manifest.json") {
    return {
      "cache-control": "no-cache",
      "content-type": "application/json; charset=utf-8",
    };
  }

  return {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": "text/javascript; charset=utf-8",
  };
}
