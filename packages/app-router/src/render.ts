import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { transform, type ServerOutputMode, type TransformOutput } from "@modular-react/compiler";
import { build as bundle } from "esbuild";
import {
  createStringSink,
  type HtmlSink,
  renderAsyncBoundary,
  renderOutOfOrderReorderScript,
  renderToReadableStream,
} from "@modular-react/server";
import {
  hydrationMarkerParts,
  isClientRouteSource,
  withHydrationMarkers,
  withRouteMarkers,
} from "./client.js";
import { matchRoute, scanAppRoutes } from "./routes.js";
import type { AppRoute, RouteMatcher } from "./routes.js";
import {
  type AppRouterServerActionOptions,
  dispatchServerActionRequest,
  prepareRouteServerActions,
  serverActionCookie,
} from "./actions.js";
import {
  type AppRouterCache,
  cachedRouteResponse,
  cacheRouteResponse,
  routeCacheKey,
  routeCachePolicyFromSource,
  stripRevalidateExport,
} from "./cache.js";
import {
  importAppRouterFileModule,
  importAppRouterSourceModule,
} from "./module-runner.js";
import { htmlResponse } from "./http.js";
import { isNotFoundError, isRedirectError, rewriteLocation } from "./navigation.js";
import {
  createAppRouterImportPolicyPlugin,
  type AppRouterImportPolicy,
} from "./import-policy.js";
import type { BuiltServerModuleArtifact } from "./build.js";

const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@modular-react/app-router/internal/native-escape",
} as const;

export interface RenderAppRequestOptions {
  appDir: string;
  clientScripts?: ReadonlyMap<string, string>;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
  routeCache?: AppRouterCache | undefined;
  routeMatcher?: RouteMatcher | undefined;
  routes?: readonly AppRoute[] | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  skipMiddleware?: boolean | undefined;
}

interface ServerComponentProps {
  params: Record<string, string>;
  request: Request;
  data: unknown;
}

const serverTransformCache = new Map<string, TransformOutput>();
const serverSourceFileCache = new Map<string, Promise<string>>();
const maxServerTransformCacheEntries = 512;
const maxServerSourceFileCacheEntries = 512;

export async function renderAppRequest(
  options: RenderAppRequestOptions,
): Promise<Response> {
  const routes = options.routes ?? await scanAppRoutes({ appDir: options.appDir });
  const url = new URL(options.request.url);
  const middlewareResponse = options.skipMiddleware === true
    ? undefined
    : await runMiddleware({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        request: options.request,
      });

  if (middlewareResponse !== undefined) {
    const location = rewriteLocation(middlewareResponse);

    if (location !== undefined) {
      const rewriteUrl = new URL(location, options.request.url);

      return renderAppRequest({
        ...options,
        request: new Request(rewriteUrl, options.request),
        skipMiddleware: true,
      });
    }

    return middlewareResponse;
  }

  if (url.pathname === "/_mreact/actions") {
    return dispatchServerActionRequest({
      appDir: options.appDir,
      importPolicy: options.importPolicy,
      request: options.request,
      routeCache: options.routeCache,
      serverActions: options.serverActions,
    });
  }

  const matched = options.routeMatcher?.match(url.pathname) ?? matchRoute(routes, url.pathname);

  if (matched === undefined) {
    const notFoundFile = await nearestBoundaryFileForPath({
      appDir: options.appDir,
      filename: "not-found.mreact.tsx",
      pathname: url.pathname,
    });

    return renderSpecialRoute({
      appDir: options.appDir,
      error: undefined,
      request: options.request,
      routeFile: notFoundFile,
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
      status: 404,
      textFallback: "Not Found",
    });
  }

  let recoveryRoute:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;

  try {
    if (matched.route.kind === "server") {
      return await dispatchServerRoute(matched.route.file, options.request);
    }

    const clientScript = options.clientScripts?.get(matched.route.path);
    const originalCode = await readServerSourceFile(
      matched.route.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const cachePolicy = routeCachePolicyFromSource(originalCode);
    const cacheKey = routeCacheKey(options.appDir, matched.route.path, url);
    const cachedResponse = cachePolicy?.revalidateSeconds === 0
      ? undefined
      : await cachedRouteResponse({
          cache: options.routeCache,
          key: cacheKey,
        });

    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    const preparedActions = await prepareRouteServerActions({
      appDir: options.appDir,
      code: originalCode,
      pageFile: matched.route.file,
    });
    const code = preparedActions.code;
    const dataPromise = loadRouteData({
      code,
      context: {
        params: matched.params,
        request: options.request,
      },
      appDir: options.appDir,
      filename: matched.route.file,
      importPolicy: options.importPolicy,
    });
    const routeCode = stripRouteModuleExports(code);
    const streamRoute = isStreamRouteSource(code);
    const clientRoute = isClientRouteSource(routeCode);
    recoveryRoute = {
      clientRoute,
      props: {
        params: matched.params,
        request: { url: options.request.url },
      },
      routePath: matched.route.path,
      script: clientScript,
    };
    const output = transformServerModule({
      code: routeCode,
      filename: matched.route.file,
      serverModules: options.serverModules,
      serverOutput: streamRoute ? "stream" : "string",
      serverAwaitHydration: streamRoute && clientRoute,
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      return new Response(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"), {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (streamRoute) {
      const loadingFile = await nearestExistingBoundaryFileForPage({
        appDir: options.appDir,
        filename: "loading.mreact.tsx",
        pageFile: matched.route.file,
      });
      const streamShellResponseHeaders = {
        "content-type": "text/html; charset=utf-8",
        "x-mreact-stream": "1",
      };

      if (loadingFile !== undefined) {
        const stream = await runServerStreamModuleWithLoading(output.code, {
          appDir: options.appDir,
          clientRoute: isClientRouteSource(routeCode),
          data: dataPromise,
          loadingFile,
          pageFile: matched.route.file,
          params: matched.params,
          request: options.request,
          routePath: matched.route.path,
          serverModules: options.serverModules,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
          script: clientScript,
        });

        return withOptionalActionCookie(
          new Response(stream, {
            headers: streamShellResponseHeaders,
          }),
          preparedActions.csrfToken,
        );
      }

      const data = await dataPromise;
      const props = {
        params: matched.params,
        request: options.request,
        data,
      };
      const stream = await runServerStreamModule(output.code, {
        appDir: options.appDir,
        pageFile: matched.route.file,
        props,
        routePath: matched.route.path,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
        clientRoute: isClientRouteSource(routeCode),
        script: clientScript,
      });

      return withOptionalActionCookie(
        new Response(stream, {
          headers: streamShellResponseHeaders,
        }),
        preparedActions.csrfToken,
      );
    }

    const data = await dataPromise;
    const pageHtml = await runServerModule(
      output.code,
      {
        params: matched.params,
        request: options.request,
        data,
      },
      matched.route.file,
      options.serverModules,
      options.serverModuleCacheVersion,
    );
    // Wrap the page (not the full document) with the hydration marker so
    // the marker sits inside <body>, not around <html>. Wrapping <html>
    // forces the browser HTML parser to strip the wrappers and promote
    // <head> / <body> children up to the marker, which flattens the
    // layout into the marker and breaks the hydration target lookup.
    const pageHtmlForLayout = clientRoute
      ? withHydrationMarkers({
          html: pageHtml,
          routePath: matched.route.path,
          script: clientScript,
          props: {
            params: matched.params,
            request: { url: options.request.url },
            data,
          },
        })
      : isNavigationRequest(options.request)
        ? withRouteMarkers({
            html: pageHtml,
            routePath: matched.route.path,
          })
        : pageHtml;
    let html = await applyLayouts({
      appDir: options.appDir,
      pageFile: matched.route.file,
      html: pageHtmlForLayout,
      props: {
        params: matched.params,
        request: options.request,
        data,
      },
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
    });
    const metadata = await loadRouteMetadata({
      appDir: options.appDir,
      code: originalCode,
      filename: matched.route.file,
      importPolicy: options.importPolicy,
    });
    html = injectHeadMetadata(html, metadata);

    const response = withOptionalActionCookie(
      htmlResponse(`<!DOCTYPE html>${modulePreloadTags(clientRoute ? clientScript : undefined)}${html}`, {
        headers: responseHeadersForMetadata(metadata),
      }),
      preparedActions.csrfToken,
    );

    return preparedActions.hasFormActions
      ? withRouteCacheHeader(response, cachePolicy)
      : await cacheRouteResponse({
          key: cacheKey,
          cache: options.routeCache,
          path: matched.route.path,
          policy: cachePolicy,
          response,
        });
  } catch (error) {
    if (isRedirectError(error)) {
      return new Response(null, {
        headers: { location: error.location },
        status: error.status,
      });
    }

    if (isNotFoundError(error)) {
      const notFoundFile = await nearestBoundaryFileForPage({
        appDir: options.appDir,
        filename: "not-found.mreact.tsx",
        pageFile: matched.route.file,
      });

      return renderSpecialRoute({
        appDir: options.appDir,
        error: undefined,
        request: options.request,
        routeFile: notFoundFile,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
        navigation: recoveryRoute,
        status: 404,
        textFallback: "Not Found",
      });
    }

    const errorFile = await nearestBoundaryFileForPage({
      appDir: options.appDir,
      filename: "error.mreact.tsx",
      pageFile: matched.route.file,
    });

    return renderSpecialRoute({
      appDir: options.appDir,
      error,
      request: options.request,
      routeFile: errorFile,
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
      navigation: recoveryRoute,
      status: 500,
      textFallback: error instanceof Error ? error.message : String(error),
    });
  }
}

function withOptionalActionCookie(response: Response, csrfToken: string | undefined): Response {
  if (csrfToken !== undefined) {
    response.headers.append("set-cookie", serverActionCookie(csrfToken));
  }

  return response;
}

function modulePreloadTags(script: string | undefined): string {
  return script === undefined
    ? ""
    : `<link rel="modulepreload" href="/_mreact/client/${escapeHtmlAttribute(script)}">`;
}

function isNavigationRequest(request: Request): boolean {
  return request.headers.get("x-mreact-navigation") === "1";
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function nearestBoundaryFileForPage(options: {
  appDir: string;
  filename: string;
  pageFile: string;
}): Promise<string> {
  const relativeDir = relative(options.appDir, dirname(options.pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);

  return nearestBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestExistingBoundaryFileForPage(options: {
  appDir: string;
  filename: string;
  pageFile: string;
}): Promise<string | undefined> {
  const relativeDir = relative(options.appDir, dirname(options.pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);

  return nearestExistingBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestBoundaryFileForPath(options: {
  appDir: string;
  filename: string;
  pathname: string;
}): Promise<string> {
  const parts = options.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part.length > 0);

  return nearestBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestBoundaryFileFromParts(options: {
  appDir: string;
  filename: string;
  parts: string[];
}): Promise<string> {
  for (let count = options.parts.length; count >= 0; count -= 1) {
    for (const filename of boundaryFilenameCandidates(options.filename)) {
      const candidate = join(options.appDir, ...options.parts.slice(0, count), filename);

      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the root boundary.
      }
    }
  }

  return join(options.appDir, boundaryFilenameCandidates(options.filename)[0] ?? options.filename);
}

async function nearestExistingBoundaryFileFromParts(options: {
  appDir: string;
  filename: string;
  parts: string[];
}): Promise<string | undefined> {
  for (let count = options.parts.length; count >= 0; count -= 1) {
    for (const filename of boundaryFilenameCandidates(options.filename)) {
      const candidate = join(options.appDir, ...options.parts.slice(0, count), filename);

      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the root boundary.
      }
    }
  }

  return undefined;
}

function boundaryFilenameCandidates(filename: string): string[] {
  if (!filename.endsWith(".mreact.tsx")) {
    return [filename];
  }

  const standardFilename = filename.replace(".mreact.tsx", ".tsx");

  return [standardFilename, filename];
}

async function renderSpecialRoute(options: {
  appDir: string;
  error: unknown;
  navigation?:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;
  request: Request;
  routeFile: string;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  status: number;
  textFallback: string;
}): Promise<Response> {
  try {
    await access(options.routeFile);
  } catch {
    return new Response(options.textFallback, { status: options.status });
  }

  const props = {
    data: undefined,
    error: normalizeErrorForProps(options.error),
    params: {},
    request: options.request,
  };
  const pageHtml = await renderServerFileToHtml(
    options.routeFile,
    props,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  const pageHtmlForLayout = options.navigation?.clientRoute === true
    ? withHydrationMarkers({
        html: pageHtml,
        props: options.navigation.props,
        routePath: options.navigation.routePath,
        script: options.navigation.script,
      })
    : pageHtml;
  const html = await applyLayouts({
    appDir: options.appDir,
    pageFile: options.routeFile,
    html: pageHtmlForLayout,
    props,
    serverModules: options.serverModules,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    serverSourceFiles: options.serverSourceFiles,
  });

  return new Response(
    `<!DOCTYPE html>${modulePreloadTags(
      options.navigation?.clientRoute === true ? options.navigation.script : undefined,
    )}${html}`,
    {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: options.status,
    },
  );
}

async function renderServerFileToHtml(
  file: string,
  props: ServerComponentProps,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
): Promise<string> {
  const code = await readServerSourceFile(file, serverModuleCacheVersion, serverSourceFiles);
  const output = transformServerModule({
    code,
    filename: file,
    serverModules,
    serverOutput: "string",
  });
  const fatalDiagnostics = output.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );

  if (fatalDiagnostics.length > 0) {
    throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  return runServerModule(output.code, props, file, serverModules, serverModuleCacheVersion);
}

function normalizeErrorForProps(error: unknown): { message: string } {
  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

async function dispatchServerRoute(file: string, request: Request): Promise<Response> {
  const module = await importAppRouterFileModule<Record<string, unknown>>(file);
  const handler = module[request.method] ?? module.ALL ?? module.default;

  if (typeof handler !== "function") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const response = await handler(request);

  return response instanceof Response
    ? response
    : new Response("Invalid route response", { status: 500 });
}

async function runMiddleware(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
}): Promise<Response | undefined> {
  const candidates = [
    join(options.appDir, "middleware.ts"),
    join(options.appDir, "middleware.mreact.ts"),
  ];

  for (const file of candidates) {
    try {
      await access(file);
    } catch {
      continue;
    }

    const module = await loadMiddlewareModule({
      appDir: options.appDir,
      file,
      importPolicy: options.importPolicy,
    });

    if (!middlewareMatches(module.config, new URL(options.request.url).pathname)) {
      return undefined;
    }

    const middleware = module.middleware ?? module.default;

    if (typeof middleware !== "function") {
      return undefined;
    }

    const response = await middleware(options.request);

    return response instanceof Response ? response : undefined;
  }

  return undefined;
}

interface MiddlewareModule {
  config?: {
    matcher?: string | RegExp | readonly string[] | undefined;
  };
  default?: unknown;
  middleware?: unknown;
}

async function loadMiddlewareModule(options: {
  appDir: string;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<MiddlewareModule> {
  const code = await readFile(options.file, "utf8");
  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Middleware",
      }),
    ],
    write: false,
    jsx: "transform",
    jsxFactory: "__mreact_jsx",
    jsxFragment: "__mreact_fragment",
    stdin: {
      contents: code,
      loader: "ts",
      resolveDir: dirname(options.file),
      sourcefile: options.file,
    },
  });
  const compiled = output.outputFiles[0]?.text;

  if (compiled === undefined) {
    throw new Error(`Failed to compile middleware for ${options.file}.`);
  }

  return importAppRouterSourceModule<MiddlewareModule>({
    code: compiled,
    label: `middleware:${options.file}`,
  });
}

function middlewareMatches(
  config: MiddlewareModule["config"],
  pathname: string,
): boolean {
  const matcher = config?.matcher;

  if (matcher === undefined) {
    return true;
  }

  if (matcher instanceof RegExp) {
    return matcher.test(pathname);
  }

  if (Array.isArray(matcher)) {
    return matcher.some((item) => middlewarePatternMatches(item, pathname));
  }

  return typeof matcher === "string" && middlewarePatternMatches(matcher, pathname);
}

function middlewarePatternMatches(pattern: string, pathname: string): boolean {
  if (pattern === pathname) {
    return true;
  }

  if (pattern.endsWith("/:path*")) {
    const prefix = pattern.slice(0, -"/:path*".length);

    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }

  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);

    return pathname.startsWith(prefix);
  }

  return false;
}

function transformServerModule(options: {
  code: string;
  filename: string;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverOutput: ServerOutputMode;
  serverAwaitHydration?: boolean;
}): TransformOutput {
  const sourceHash = memoizedHashText(options.code);
  const artifact = options.serverModules?.get(options.filename)?.[options.serverOutput];

  if (
    artifact !== undefined &&
    artifact.sourceHash === sourceHash &&
    options.serverAwaitHydration !== true
  ) {
    return {
      code: artifact.code,
      diagnostics: [],
      map: null,
      metadata: {
        compiler: {
          frontend: "oxc",
          typescriptFallback: false,
        },
        components: [],
        filename: options.filename,
        imports: [],
        serverOutput: options.serverOutput,
        target: "server",
      },
    };
  }

  const awaitHydrationKey = options.serverAwaitHydration === true ? "1" : "0";
  const key = `${options.filename}\0${options.serverOutput}\0${sourceHash}\0${awaitHydrationKey}`;
  const cached = serverTransformCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const output = transform({
    code: options.code,
    dev: true,
    filename: options.filename,
    serverEscape: nativeEscapeTransform,
    serverOutput: options.serverOutput,
    target: "server",
    ...(options.serverAwaitHydration === true ? { serverAwaitHydration: true } : {}),
  });

  setBoundedCacheEntry(serverTransformCache, key, output, maxServerTransformCacheEntries);

  return output;
}

// Per-request hashText (SHA-256) is one of the hot path's dominant
// costs. Cache hashes for `code` strings we have already seen this
// process (common case: the prepared code is identical across requests
// when the source file is unchanged).
const codeHashCache = new Map<string, string>();
const MAX_CODE_HASH_ENTRIES = 256;

function memoizedHashText(code: string): string {
  const cached = codeHashCache.get(code);
  if (cached !== undefined) {
    return cached;
  }

  const hash = hashText(code);
  if (codeHashCache.size >= MAX_CODE_HASH_ENTRIES) {
    // Simple LRU eviction: drop the oldest entry (Map keeps insertion order).
    const oldestKey = codeHashCache.keys().next().value;
    if (oldestKey !== undefined) {
      codeHashCache.delete(oldestKey);
    }
  }
  codeHashCache.set(code, hash);
  return hash;
}

async function runServerModule(
  code: string,
  props: ServerComponentProps,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
): Promise<string> {
  const artifact = serverModules?.get(sourcefile)?.string;
  const codeHash = memoizedHashText(code);
  const moduleCode = artifact !== undefined && artifact.sourceHash === codeHash
    ? artifact.code
    : code;
  const cacheKey = serverModuleCacheVersion === undefined
    ? undefined
    : `server-component:${serverModuleCacheVersion}:${sourcefile}:${
        moduleCode === code ? codeHash : memoizedHashText(moduleCode)
      }`;
  const module = await importAppRouterSourceModule<
    Record<string, (props: ServerComponentProps) => string | PromiseLike<string>>
  >({
    cacheKey,
    code: moduleCode,
    label: `server-component:${sourcefile}`,
    resolveDir: dirname(sourcefile),
    sourcefile,
  });
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (component === undefined) {
    throw new Error("No page component export was found.");
  }

  return component(props);
}

async function runServerStreamModule(
  code: string,
  options: {
    appDir: string;
    pageFile: string;
    props: ServerComponentProps;
    routePath: string;
    clientRoute: boolean;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
    serverSourceFiles?: ReadonlyMap<string, string> | undefined;
    script?: string | undefined;
  },
): Promise<ReadableStream<Uint8Array>> {
  const layoutShells = await layoutShellsForPage(
    options.appDir,
    options.pageFile,
    options.props,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  const marker = options.clientRoute
    ? hydrationMarkerParts({
        routePath: options.routePath,
        script: options.script,
        props: {
          params: options.props.params,
          request: { url: options.props.request.url },
          data: options.props.data,
        },
      })
    : undefined;

  return renderToReadableStream(async (sink) => {
    sink.append("<!DOCTYPE html>");
    sink.append(modulePreloadTags(options.clientRoute ? options.script : undefined));

    for (const shell of layoutShells) {
      sink.append(shell.prefix);
    }

    sink.append(marker?.prefix ?? "");

    await appendServerStreamModule(
      code,
      sink,
      options.props,
      options.pageFile,
      options.serverModules,
      options.serverModuleCacheVersion,
    );

    sink.append(marker?.suffix ?? "");

    for (const shell of [...layoutShells].reverse()) {
      sink.append(shell.suffix);
    }

    renderOutOfOrderReorderScript(sink);
  });
}

async function runServerStreamModuleWithLoading(
  code: string,
  options: {
    appDir: string;
    clientRoute: boolean;
    data: Promise<unknown>;
    loadingFile: string;
    pageFile: string;
    params: Record<string, string>;
    request: Request;
    routePath: string;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
    serverSourceFiles?: ReadonlyMap<string, string> | undefined;
    script?: string | undefined;
  },
): Promise<ReadableStream<Uint8Array>> {
  const loadingProps = {
    data: undefined,
    params: options.params,
    request: options.request,
  };
  const layoutShells = await layoutShellsForPage(
    options.appDir,
    options.pageFile,
    loadingProps,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  const loadingHtml = await renderServerFileToHtml(
    options.loadingFile,
    loadingProps,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  const marker = options.clientRoute
    ? hydrationMarkerParts({
        routePath: options.routePath,
        script: options.script,
        props: {
          params: options.params,
          request: { url: options.request.url },
        },
      })
    : undefined;

  return renderToReadableStream((sink) => {
    sink.append("<!DOCTYPE html>");
    sink.append(modulePreloadTags(options.clientRoute ? options.script : undefined));

    for (const shell of layoutShells) {
      sink.append(shell.prefix);
    }

    sink.append(marker?.prefix ?? "");

    renderVisibleOutOfOrderBoundary(
      sink,
      "mreact-route",
      options.data,
      async (boundarySink, data) => {
        await appendServerStreamModule(
          code,
          boundarySink,
          {
            data,
            params: options.params,
            request: options.request,
          },
          options.pageFile,
          options.serverModules,
          options.serverModuleCacheVersion,
        );
      },
      {
        placeholder(boundarySink) {
          boundarySink.append(loadingHtml);
        },
      },
    );

    sink.append(marker?.suffix ?? "");

    for (const shell of [...layoutShells].reverse()) {
      sink.append(shell.suffix);
    }

    renderOutOfOrderReorderScript(sink);
  });
}

function renderVisibleOutOfOrderBoundary<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: (sink: HtmlSink, value: Awaited<T>) => void | PromiseLike<void>,
  options: {
    catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
    placeholder?: (sink: HtmlSink) => void | PromiseLike<void>;
  } = {},
): void {
  const placeholderSink = createStringSink();
  void options.placeholder?.(placeholderSink);
  sink.append(
    `<span data-mreact-oob-placeholder="${escapeHtmlAttribute(id)}">${placeholderSink.toString()}</span>`,
  );

  const task = renderVisibleOutOfOrderFragment(sink, id, value, render, options);

  if (sink.defer === undefined) {
    void task;
    return;
  }

  sink.defer(task);
}

async function renderVisibleOutOfOrderFragment<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: (sink: HtmlSink, value: Awaited<T>) => void | PromiseLike<void>,
  options: {
    catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
  },
): Promise<void> {
  const fragmentSink = createStringSink();

  await renderAsyncBoundary(
    fragmentSink,
    value,
    render,
    options.catch === undefined ? {} : { catch: options.catch },
  );

  sink.append(
    `<template data-mreact-oob-fragment="${escapeHtmlAttribute(id)}">${fragmentSink.toString()}</template>`,
  );
}

async function appendServerStreamModule(
  code: string,
  sink: HtmlSink,
  props: ServerComponentProps,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
): Promise<void> {
  const artifactCode = serverModules?.get(sourcefile)?.stream;
  const codeHash = memoizedHashText(code);
  const moduleCode = artifactCode !== undefined && artifactCode.sourceHash === codeHash
    ? artifactCode.code
    : code;
  const cacheKey = serverModuleCacheVersion === undefined
    ? undefined
    : `server-stream-component:${serverModuleCacheVersion}:${sourcefile}:${
        moduleCode === code ? codeHash : memoizedHashText(moduleCode)
      }`;
  const module = await importAppRouterSourceModule<
    Record<string, (sink: HtmlSink, props: ServerComponentProps) => void | PromiseLike<void>>
  >({
    cacheKey,
    code: moduleCode,
    label: `server-stream-component:${sourcefile}`,
    resolveDir: dirname(sourcefile),
    sourcefile,
  });
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (component === undefined) {
    throw new Error("No page component export was found.");
  }

  await component(sink, props);
}

function isStreamRouteSource(code: string): boolean {
  return /^\s*export\s+const\s+stream\s*=\s*true\s*;?/m.test(code);
}

function stripRouteConfigExports(code: string): string {
  return stripPrerenderExport(
    stripRevalidateExport(
      code.replace(/^\s*export\s+const\s+stream\s*=\s*true\s*;?\s*/m, ""),
    ),
  );
}

function stripPrerenderExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+prerender\s*=\s*true\s*;?\s*/m, "");
}

function stripRouteModuleExports(code: string): string {
  return stripGenerateStaticParamsExport(stripLoaderExport(stripRouteConfigExports(code)));
}

function stripGenerateStaticParamsExport(code: string): string {
  return code
    .replace(
      /export\s+(?:async\s+)?function\s+generateStaticParams\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{[\s\S]*?^\}\s*/m,
      "",
    )
    .replace(
      /export\s+const\s+generateStaticParams\s*=\s*(?:async\s+)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*[\s\S]*?;?\s*(?=\nexport|\n$)/m,
      "",
    );
}

async function applyLayouts(options: {
  appDir: string;
  pageFile: string;
  html: string;
  props: ServerComponentProps;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<string> {
  const layoutFiles = await shellFilesForPage(
    options.appDir,
    options.pageFile,
    options.serverModuleCacheVersion,
  );
  let html = options.html;

  for (const shell of layoutFiles.reverse()) {
    const code = await readServerSourceFile(
      shell.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const output = transformServerModule({
      code,
      filename: shell.file,
      serverModules: options.serverModules,
      serverOutput: "string",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    html = replaceLayoutSlot(
      markShellBoundary(
        await runServerModule(
          output.code,
          options.props,
          shell.file,
          options.serverModules,
          options.serverModuleCacheVersion,
        ),
        shell,
      ),
      html,
    );
  }

  return html;
}

async function layoutShellsForPage(
  appDir: string,
  pageFile: string,
  props: ServerComponentProps,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
): Promise<Array<{ prefix: string; suffix: string }>> {
  const layoutFiles = await shellFilesForPage(appDir, pageFile, serverModuleCacheVersion);
  const shells: Array<{ prefix: string; suffix: string }> = [];

  for (const shell of layoutFiles) {
    const code = await readServerSourceFile(shell.file, serverModuleCacheVersion, serverSourceFiles);
    const output = transformServerModule({
      code,
      filename: shell.file,
      serverModules,
      serverOutput: "string",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    shells.push(
      splitLayoutSlot(
        markShellBoundary(
          await runServerModule(output.code, props, shell.file, serverModules, serverModuleCacheVersion),
          shell,
        ),
      ),
    );
  }

  return shells;
}

function splitLayoutSlot(layoutHtml: string): { prefix: string; suffix: string } {
  const slotPattern = /<slot><\/slot>|<slot><\/slot\s*>|<slot\s*\/>/;
  const match = slotPattern.exec(layoutHtml);

  if (match === null) {
    return { prefix: layoutHtml, suffix: "" };
  }

  return {
    prefix: layoutHtml.slice(0, match.index),
    suffix: layoutHtml.slice(match.index + match[0].length),
  };
}

interface ShellFile {
  file: string;
  id: string;
  kind: "layout" | "template";
}

// Layout/template files for a given page do not change during a server's
// lifetime in production. Each cache miss costs up to N×4 filesystem
// `access()` syscalls (~5-10μs each on a fast SSD), making this one of
// the largest fixed costs in `renderBuiltAppRequest` for a minimal page.
//
// We cache by `appDir + pageFile + serverModuleCacheVersion` so the cache
// is only active when a server-module manifest version is available
// (= production builds). In dev mode the version is `undefined`, so we
// skip the cache and pick up newly added layout / template files on the
// next request.
const shellFilesCache = new Map<string, ShellFile[]>();
const MAX_SHELL_FILES_CACHE_ENTRIES = 1024;

async function shellFilesForPage(
  appDir: string,
  pageFile: string,
  serverModuleCacheVersion?: string,
): Promise<ShellFile[]> {
  const cacheKey =
    serverModuleCacheVersion === undefined
      ? undefined
      : `${appDir}\0${pageFile}\0${serverModuleCacheVersion}`;
  if (cacheKey !== undefined) {
    const cached = shellFilesCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const relativeDir = relative(appDir, dirname(pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split("/");
  const directories = [appDir];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(join(appDir, ...parts.slice(0, index + 1)));
  }

  const files: ShellFile[] = [];

  for (const directory of directories) {
    const shellId = shellBoundaryId(appDir, directory);
    for (const [filename, kind] of [
      ["layout.tsx", "layout"],
      ["layout.mreact.tsx", "layout"],
      ["template.tsx", "template"],
      ["template.mreact.tsx", "template"],
    ] as const) {
      const candidate = join(directory, filename);

      try {
        await access(candidate);
        files.push({ file: candidate, id: shellId, kind });
      } catch {
        // Missing shell files are allowed.
      }
    }
  }

  if (cacheKey !== undefined) {
    if (shellFilesCache.size >= MAX_SHELL_FILES_CACHE_ENTRIES) {
      const oldestKey = shellFilesCache.keys().next().value;
      if (oldestKey !== undefined) {
        shellFilesCache.delete(oldestKey);
      }
    }
    shellFilesCache.set(cacheKey, files);
  }
  return files;
}

function withRouteCacheHeader(
  response: Response,
  policy: ReturnType<typeof routeCachePolicyFromSource>,
): Response {
  if (policy !== undefined) {
    response.headers.set("cache-control", policy.cacheControl);
  }

  return response;
}

function shellBoundaryId(appDir: string, directory: string): string {
  const relativeDirectory = relative(appDir, directory);

  return relativeDirectory === ""
    ? "root"
    : relativeDirectory.replaceAll(sep, "/").replace(/[^A-Za-z0-9_$/-]/g, "_");
}

function markShellBoundary(html: string, shell: ShellFile): string {
  const attributeName =
    shell.kind === "layout"
      ? "data-mreact-layout-boundary"
      : "data-mreact-template-boundary";

  if (html.includes(`${attributeName}=`)) {
    return html;
  }

  return html.replace(
    /<([A-Za-z][^\s/>]*)([^>]*)>/,
    `<$1$2 ${attributeName}="${escapeHtmlAttribute(shell.id)}">`,
  );
}

function replaceLayoutSlot(layoutHtml: string, childHtml: string): string {
  const slotPattern = /<slot><\/slot>|<slot><\/slot\s*>|<slot\s*\/>/;

  return slotPattern.test(layoutHtml)
    ? layoutHtml.replace(slotPattern, childHtml)
    : `${layoutHtml}${childHtml}`;
}

interface RouteDataContext {
  params: Record<string, string>;
  request: Request;
}

interface RouteMetadata {
  alternates?: {
    canonical?: string;
  };
  description?: string;
  csp?: {
    directives?: Record<string, readonly string[] | string>;
    nonce?: string;
  };
  head?: readonly RouteHeadDescriptor[];
  icons?: {
    apple?: string;
    icon?: string;
  };
  openGraph?: {
    description?: string;
    image?: string;
    images?: readonly string[];
    title?: string;
  };
  robots?: string | {
    follow?: boolean;
    index?: boolean;
  };
  themeColor?: string;
  title?: string;
  viewport?: string;
}

interface RouteHeadDescriptor {
  attrs?: Record<string, boolean | number | string | undefined>;
  content?: string;
  nonce?: boolean | string;
  tag: "base" | "link" | "meta" | "script" | "style";
}

async function loadRouteData(options: {
  appDir: string;
  code: string;
  context: RouteDataContext;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<unknown> {
  if (!hasLoaderExport(options.code)) {
    return undefined;
  }

  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Loader",
      }),
    ],
    write: false,
    jsx: "transform",
    jsxFactory: "__mreact_jsx",
    jsxFragment: "__mreact_fragment",
    stdin: {
      contents: options.code,
      loader: "tsx",
      resolveDir: dirname(options.filename),
      sourcefile: options.filename,
    },
  });
  const code = output.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to compile loader for ${options.filename}.`);
  }

  const module = await importAppRouterSourceModule<{
    loader?: (context: RouteDataContext) => unknown;
  }>({
    code,
    label: `loader:${options.filename}`,
  });

  return module.loader === undefined ? undefined : await module.loader(options.context);
}

async function loadRouteMetadata(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<RouteMetadata | undefined> {
  if (!hasMetadataExport(options.code)) {
    return undefined;
  }

  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Metadata",
      }),
    ],
    write: false,
    jsx: "transform",
    jsxFactory: "__mreact_jsx",
    jsxFragment: "__mreact_fragment",
    stdin: {
      contents: options.code,
      loader: "tsx",
      resolveDir: dirname(options.filename),
      sourcefile: options.filename,
    },
  });
  const code = output.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to compile metadata for ${options.filename}.`);
  }

  const module = await importAppRouterSourceModule<{ metadata?: RouteMetadata }>({
    code,
    label: `metadata:${options.filename}`,
  });

  return module.metadata;
}

function hasMetadataExport(code: string): boolean {
  return /\bexport\s+const\s+metadata\s*=/.test(code);
}

function injectHeadMetadata(html: string, metadata: RouteMetadata | undefined): string {
  if (metadata === undefined) {
    return html;
  }

  const tags = [
    metadata.title === undefined ? undefined : `<title>${escapeHtml(metadata.title)}</title>`,
    metadata.description === undefined
      ? undefined
      : `<meta name="description" content="${escapeHtmlAttribute(metadata.description)}">`,
    metadata.alternates?.canonical === undefined
      ? undefined
      : `<link rel="canonical" href="${escapeHtmlAttribute(metadata.alternates.canonical)}">`,
    metadata.openGraph?.title === undefined
      ? undefined
      : `<meta property="og:title" content="${escapeHtmlAttribute(metadata.openGraph.title)}">`,
    metadata.openGraph?.description === undefined
      ? undefined
      : `<meta property="og:description" content="${escapeHtmlAttribute(metadata.openGraph.description)}">`,
    ...openGraphImages(metadata.openGraph).map((image) =>
      `<meta property="og:image" content="${escapeHtmlAttribute(image)}">`
    ),
    metadata.icons?.icon === undefined
      ? undefined
      : `<link rel="icon" href="${escapeHtmlAttribute(metadata.icons.icon)}">`,
    metadata.icons?.apple === undefined
      ? undefined
      : `<link rel="apple-touch-icon" href="${escapeHtmlAttribute(metadata.icons.apple)}">`,
    metadata.robots === undefined
      ? undefined
      : `<meta name="robots" content="${escapeHtmlAttribute(robotsContent(metadata.robots))}">`,
    metadata.themeColor === undefined
      ? undefined
      : `<meta name="theme-color" content="${escapeHtmlAttribute(metadata.themeColor)}">`,
    metadata.viewport === undefined
      ? undefined
      : `<meta name="viewport" content="${escapeHtmlAttribute(metadata.viewport)}">`,
    ...headDescriptorTags(metadata.head, metadata.csp?.nonce),
  ].filter((tag): tag is string => tag !== undefined).join("");

  if (tags === "") {
    return html;
  }

  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${tags}`);
  }

  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${tags}</head>`);
  }

  return `<head>${tags}</head>${html}`;
}

function responseHeadersForMetadata(metadata: RouteMetadata | undefined): HeadersInit {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  const csp = contentSecurityPolicy(metadata?.csp);

  if (csp !== undefined) {
    headers.set("content-security-policy", csp);
  }

  return headers;
}

function contentSecurityPolicy(csp: RouteMetadata["csp"]): string | undefined {
  if (csp?.directives === undefined) {
    return undefined;
  }

  return Object.entries(csp.directives)
    .map(([name, value]) => {
      const values = Array.isArray(value) ? [...value] : [value];

      if (csp.nonce !== undefined && (name === "script-src" || name === "style-src")) {
        values.push(`'nonce-${csp.nonce}'`);
      }

      return `${name} ${values.join(" ")}`;
    })
    .join("; ");
}

function headDescriptorTags(
  descriptors: readonly RouteHeadDescriptor[] | undefined,
  nonce: string | undefined,
): string[] {
  return (descriptors ?? []).flatMap((descriptor) => {
    const descriptorNonce = descriptor.nonce === true ? nonce : descriptor.nonce || undefined;
    const attrs: Record<string, boolean | number | string | undefined> = {
      ...descriptor.attrs,
      ...(descriptorNonce === undefined ? {} : { nonce: descriptorNonce }),
    };
    const attrText = Object.entries(attrs)
      .flatMap(([name, value]) => {
        if (value === undefined || value === false) {
          return [];
        }

        return value === true
          ? [escapeHtmlAttribute(name)]
          : [`${escapeHtmlAttribute(name)}="${escapeHtmlAttribute(String(value))}"`];
      })
      .join(" ");
    const open = attrText === "" ? `<${descriptor.tag}>` : `<${descriptor.tag} ${attrText}>`;

    if (descriptor.tag === "meta" || descriptor.tag === "link" || descriptor.tag === "base") {
      return [open.slice(0, -1) + ">"];
    }

    return [`${open}${escapeHeadTextContent(descriptor.content ?? "")}</${descriptor.tag}>`];
  });
}

function escapeHeadTextContent(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

function openGraphImages(openGraph: RouteMetadata["openGraph"]): readonly string[] {
  if (openGraph?.images !== undefined) {
    return openGraph.images;
  }

  return openGraph?.image === undefined ? [] : [openGraph.image];
}

function robotsContent(robots: NonNullable<RouteMetadata["robots"]>): string {
  if (typeof robots === "string") {
    return robots;
  }

  return [
    robots.index === false ? "noindex" : "index",
    robots.follow === false ? "nofollow" : "follow",
  ].join(",");
}

function hasLoaderExport(code: string): boolean {
  return /\bexport\s+(?:async\s+)?function\s+loader\s*\(/.test(code) ||
    /\bexport\s+const\s+loader\s*=/.test(code);
}

function stripLoaderExport(code: string): string {
  return code
    .replace(
      /export\s+(?:async\s+)?function\s+loader\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{[\s\S]*?^\}\s*/m,
      "",
    )
    .replace(
      /export\s+const\s+loader\s*=\s*(?:async\s+)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*[\s\S]*?;?\s*(?=\nexport|\n$)/m,
      "",
    );
}

function readServerSourceFile(
  file: string,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
): Promise<string> {
  const manifestSource = serverSourceFiles?.get(file);

  if (manifestSource !== undefined) {
    return Promise.resolve(manifestSource);
  }

  if (serverModuleCacheVersion === undefined) {
    return readFile(file, "utf8");
  }

  const key = `${serverModuleCacheVersion}:${file}`;
  const cached = serverSourceFileCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const loaded = readFile(file, "utf8").catch((error) => {
    serverSourceFileCache.delete(key);
    throw error;
  });
  setBoundedCacheEntry(serverSourceFileCache, key, loaded, maxServerSourceFileCacheEntries);

  return loaded;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function setBoundedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
): void {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value as K | undefined;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, value);
}
