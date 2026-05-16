import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { access, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  transform,
  type ClientReferenceMetadata,
  type ServerOutputMode,
  type TransformOutput,
} from "@reckona/mreact-compiler";
import {
  createQueryClient,
  dehydrate,
  __MREACT_QUERY_STATE_SCRIPT_ID,
  runWithQueryClient,
  type DehydratedQueryClient,
  type QueryClient,
} from "@reckona/mreact-query";
import { build as bundle } from "esbuild";
import {
  createStringSink,
  type HtmlSink,
  renderAsyncBoundary,
  renderOutOfOrderReorderScript,
  renderToReadableStream,
} from "@reckona/mreact-server";
import {
  hydrationMarkerParts,
  inferClientRouteModule,
  type ClientRouteInferenceResult,
  withHydrationMarkers,
  withRouteMarkers,
} from "./client.js";
import {
  escapeHtmlAttribute,
  escapeHtmlText as escapeHtml,
} from "@reckona/mreact-shared/html-escape";
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
  beginRouteCacheContext,
  cachedRouteResponse,
  cacheRouteResponse,
  routeCacheKey,
  routeCachePolicyFromSource,
} from "./cache.js";
import { importAppRouterFileModule, importAppRouterSourceModule } from "./module-runner.js";
import { contentSecurityPolicy } from "./csp.js";
import { htmlResponse } from "./http.js";
import { isNotFoundError, isRedirectError, rewriteLocation } from "./navigation.js";
import { createAppRouterImportPolicyPlugin, type AppRouterImportPolicy } from "./import-policy.js";
import type { BuiltServerModuleArtifact } from "./build.js";
import { hasLoaderExport, isStreamRouteSource, stripRouteModuleExports } from "./route-source.js";
import type { AppRouterLogger } from "./logger.js";

const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@reckona/mreact-router/internal/native-escape",
} as const;
const authRuntimeStateKey = "__mreactAuthRuntimeState";
const authSessionScriptId = "__mreact_auth_session";

interface AuthRuntimeRequestState {
  claims?: unknown;
}

interface AuthRuntimeState {
  storage?: AsyncLocalStorage<AuthRuntimeRequestState> | undefined;
}

export interface RenderAppRequestOptions {
  appDir: string;
  clientScripts?: ReadonlyMap<string, string>;
  importPolicy?: AppRouterImportPolicy | undefined;
  logger?: AppRouterLogger | undefined;
  queryClient?: QueryClient | undefined;
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
  data: unknown;
  params: Record<string, string>;
  queryClient: QueryClient;
  request: Request;
}

type ServerComponent = (props: ServerComponentProps) => string | PromiseLike<string>;
type RouteSlotValue = string | ServerComponent;
type RouteSlotExports = Record<string, RouteSlotValue>;
type ServerModuleExports = Record<string, unknown> & {
  App?: ServerComponent;
  default?: ServerComponent;
  slots?: RouteSlotExports;
};
type StreamComponent = (sink: HtmlSink, props: ServerComponentProps) => void | PromiseLike<void>;
type StreamRouteSlotValue = string | StreamComponent;
type StreamRouteSlotExports = Record<string, StreamRouteSlotValue>;
type StreamModuleExports = Record<string, unknown> & {
  App?: StreamComponent;
  default?: StreamComponent;
  slots?: StreamRouteSlotExports;
};

interface SlotRenderContext {
  consumedSlots: Set<string>;
  namedSlots: Readonly<Record<string, string>>;
}

const serverTransformCache = new Map<string, TransformOutput>();
const serverSourceFileCache = new Map<string, Promise<string>>();
const routeSourceAnalysisCache = new Map<string, Promise<RouteSourceAnalysis>>();
const composedRouteMetadataCache = new Map<string, Promise<RouteMetadata | undefined>>();
const maxServerTransformCacheEntries = 512;
const maxServerSourceFileCacheEntries = 512;
const maxRouteSourceAnalysisCacheEntries = 512;
const maxComposedRouteMetadataCacheEntries = 512;

// Issue 086: per-shell prefix/suffix cache. Pure layouts (whose
// exported component takes zero arguments and therefore cannot
// depend on the request props) produce the same HTML for every
// request, so we cache the already-split { prefix, suffix } strings
// keyed by appDir + shellFile + serverModuleCacheVersion. Impure
// layouts (function.length > 0) are tagged "impure" so we skip the
// detection on subsequent requests but still render per-request.
//
// The cache is only active when a version is present (production
// builds); dev mode keeps the previous behaviour so reloads pick up
// edits without server restart.
const renderedShellCache = new Map<string, RenderedShell | "impure">();
const MAX_RENDERED_SHELL_CACHE_ENTRIES = 1024;

interface RenderedShell {
  prefix: string;
  suffix: string;
}

interface RouteSourceAnalysis {
  authIncludesClaims: boolean;
  cachePolicy: ReturnType<typeof routeCachePolicyFromSource>;
  clientInference: ClientRouteInferenceResult;
  hasLoader: boolean;
  routeCode: string;
  streamRoute: boolean;
  usesRuntimeCacheControl: boolean;
}

export async function renderAppRequest(options: RenderAppRequestOptions): Promise<Response> {
  const authStorage = authRequestStorage();

  if (authStorage.getStore() === undefined) {
    return authStorage.run({}, () => renderAppRequest(options));
  }

  const routes = options.routes ?? (await scanAppRoutes({ appDir: options.appDir }));
  const url = new URL(options.request.url);
  const middlewareResponse =
    options.skipMiddleware === true
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
      ...(options.serverModuleCacheVersion === undefined
        ? {}
        : { serverActionCacheVersion: options.serverModuleCacheVersion }),
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

  const queryClient = options.queryClient ?? createQueryClient();
  let recoveryRoute:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;
  let routeCacheContext: ReturnType<typeof beginRouteCacheContext> | undefined;

  try {
    if (matched.route.kind === "server") {
      return await dispatchServerRoute(matched.route.file, options.request);
    }

    // Issue 080: page routes render HTML for GET / HEAD only. Other
    // methods (PUT, PATCH, DELETE, PROPFIND, ...) get 405 with an
    // Allow header so the response shape complies with RFC 9110 §9
    // and so caching intermediaries do not cross-cache method results.
    const method = options.request.method;
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { allow: "GET, HEAD, OPTIONS" },
      });
    }
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD, OPTIONS" },
      });
    }

    routeCacheContext = beginRouteCacheContext(options.routeCache);
    const clientScript = options.clientScripts?.get(matched.route.path);
    const originalCode = await readServerSourceFile(
      matched.route.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const originalAnalysis = await analyzeRouteSource({
      code: originalCode,
      filename: matched.route.file,
      routePath: matched.route.path,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });
    const cachePolicy = originalAnalysis.cachePolicy;
    const cacheKey = routeCacheKey(options.appDir, matched.route.path, url);
    const mayUseRouteCache =
      cachePolicy === undefined
        ? originalAnalysis.usesRuntimeCacheControl
        : cachePolicy.revalidateSeconds !== 0;
    const cachedResponse = !mayUseRouteCache
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
      request: options.request,
    });
    const code = preparedActions.code;
    const routeAnalysis =
      code === originalCode
        ? originalAnalysis
        : await analyzeRouteSource({
            code,
            filename: matched.route.file,
            routePath: matched.route.path,
            serverModuleCacheVersion: undefined,
          });
    const routeCode = routeAnalysis.routeCode;
    const streamRoute = routeAnalysis.streamRoute;
    const clientInference = routeAnalysis.clientInference;
    const clientRoute = clientInference.client;
    const dataPromise = routeAnalysis.hasLoader
      ? loadRouteData({
          code,
          context: {
            params: matched.params,
            queryClient,
            request: options.request,
          },
          appDir: options.appDir,
          filename: matched.route.file,
          importPolicy: options.importPolicy,
        })
      : undefined;
    recoveryRoute = {
      clientRoute,
      props: {
        params: matched.params,
        request: { url: options.request.url },
      },
      routePath: matched.route.path,
      script: clientScript,
    };
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

      if (loadingFile === undefined && !mayRenderOutOfOrderBoundary(routeCode)) {
        const stringOutput = transformServerModule({
          code: routeCode,
          clientBoundaryImports: clientInference.clientBoundaryImports,
          filename: matched.route.file,
          serverModules: options.serverModules,
          serverOutput: "string",
        });
        const stringFatalDiagnostics = stringOutput.diagnostics.filter(
          (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
        );

        if (stringFatalDiagnostics.length > 0) {
          return new Response(
            stringFatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"),
            {
              status: 500,
              headers: { "content-type": "text/plain; charset=utf-8" },
            },
          );
        }

        const data = dataPromise === undefined ? undefined : await dataPromise;
        const renderedPage = await runWithQueryClient(queryClient, () =>
          runServerModuleWithSlots(
            stringOutput.code,
            {
              data,
              params: matched.params,
              queryClient,
              request: options.request,
            },
            matched.route.file,
            options.serverModules,
            options.serverModuleCacheVersion,
          ),
        );
        const pageHtml = renderedPage.html;
        const pageHtmlForLayout = clientRoute
          ? withHydrationMarkers({
              clientReferenceManifest: stringOutput.metadata.clientReferenceManifest,
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
        let html = await runWithQueryClient(queryClient, () =>
          applyLayouts({
            appDir: options.appDir,
            pageFile: matched.route.file,
            html: pageHtmlForLayout,
            props: {
              data,
              params: matched.params,
              queryClient,
              request: options.request,
            },
            slots: renderedPage.slots,
            serverModules: options.serverModules,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
          }),
        );
        const metadata = await loadComposedRouteMetadata({
          appDir: options.appDir,
          code: originalCode,
          filename: matched.route.file,
          importPolicy: options.importPolicy,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
        });
        html = injectHeadMetadata(html, metadata);
        html = injectAuthSessionClaims(
          html,
          originalAnalysis.authIncludesClaims ? currentAuthClaims() : undefined,
        );
        html = injectQueryState(html, dehydrate(queryClient));
        const headers = new Headers(responseHeadersForMetadata(metadata));
        headers.set("x-mreact-stream", "1");

        return withOptionalActionCookie(
          htmlResponse(
            `<!DOCTYPE html>${modulePreloadTags(clientRoute ? clientScript : undefined)}${html}`,
            { headers },
          ),
          preparedActions.csrfToken,
          preparedActions.csrfTokenIsNew === true,
        );
      }

      const output = transformServerModule({
        code: routeCode,
        clientBoundaryImports: clientInference.clientBoundaryImports,
        filename: matched.route.file,
        serverModules: options.serverModules,
        serverOutput: "stream",
        serverAwaitHydration: clientRoute,
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

      if (loadingFile !== undefined) {
        const stream = await runServerStreamModuleWithLoading(output.code, {
          appDir: options.appDir,
          clientRoute,
          data: dataPromise ?? Promise.resolve(undefined),
          loadingFile,
          pageFile: matched.route.file,
          params: matched.params,
          queryClient,
          request: options.request,
          routePath: matched.route.path,
          serverModules: options.serverModules,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
          script: clientScript,
          clientReferenceManifest: output.metadata.clientReferenceManifest,
        });

        return withOptionalActionCookie(
          new Response(stream, {
            headers: streamShellResponseHeaders,
          }),
          preparedActions.csrfToken,
          preparedActions.csrfTokenIsNew === true,
        );
      }

      const data = dataPromise === undefined ? undefined : await dataPromise;
      const props = {
        data,
        params: matched.params,
        queryClient,
        request: options.request,
      };
      const stream = runServerStreamModule(output.code, {
        appDir: options.appDir,
        pageFile: matched.route.file,
        props,
        routePath: matched.route.path,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
        clientRoute,
        script: clientScript,
        clientReferenceManifest: output.metadata.clientReferenceManifest,
      });

      return withOptionalActionCookie(
        new Response(stream, {
          headers: streamShellResponseHeaders,
        }),
        preparedActions.csrfToken,
        preparedActions.csrfTokenIsNew === true,
      );
    }

    const output = transformServerModule({
      code: routeCode,
      clientBoundaryImports: clientInference.clientBoundaryImports,
      filename: matched.route.file,
      serverModules: options.serverModules,
      serverOutput: "string",
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

    const data = dataPromise === undefined ? undefined : await dataPromise;
    const renderedPage = await runWithQueryClient(queryClient, () =>
      runServerModuleWithSlots(
        output.code,
        {
          data,
          params: matched.params,
          queryClient,
          request: options.request,
        },
        matched.route.file,
        options.serverModules,
        options.serverModuleCacheVersion,
      ),
    );
    const pageHtml = renderedPage.html;
    // Wrap the page (not the full document) with the hydration marker so
    // the marker sits inside <body>, not around <html>. Wrapping <html>
    // forces the browser HTML parser to strip the wrappers and promote
    // <head> / <body> children up to the marker, which flattens the
    // layout into the marker and breaks the hydration target lookup.
    const pageHtmlForLayout = clientRoute
      ? withHydrationMarkers({
          clientReferenceManifest: output.metadata.clientReferenceManifest,
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
    let html = await runWithQueryClient(queryClient, () =>
      applyLayouts({
        appDir: options.appDir,
        pageFile: matched.route.file,
        html: pageHtmlForLayout,
        props: {
          data,
          params: matched.params,
          queryClient,
          request: options.request,
        },
        slots: renderedPage.slots,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
      }),
    );
    const metadata = await loadComposedRouteMetadata({
      appDir: options.appDir,
      code: originalCode,
      filename: matched.route.file,
      importPolicy: options.importPolicy,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
    });
    html = injectHeadMetadata(html, metadata);
    html = injectAuthSessionClaims(
      html,
      originalAnalysis.authIncludesClaims ? currentAuthClaims() : undefined,
    );
    html = injectQueryState(html, dehydrate(queryClient));

    const response = withOptionalActionCookie(
      htmlResponse(
        `<!DOCTYPE html>${modulePreloadTags(clientRoute ? clientScript : undefined)}${html}`,
        {
          headers: responseHeadersForMetadata(metadata),
        },
      ),
      preparedActions.csrfToken,
      preparedActions.csrfTokenIsNew === true,
    );

    const effectiveCachePolicy = cachePolicy ?? routeCacheContext.cachePolicy;

    return preparedActions.hasFormActions
      ? withRouteCacheHeader(response, effectiveCachePolicy)
      : await cacheRouteResponse({
          key: cacheKey,
          cache: options.routeCache,
          path: matched.route.path,
          policy: effectiveCachePolicy,
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
  } finally {
    await routeCacheContext?.dispose();
  }
}

function withOptionalActionCookie(
  response: Response,
  csrfToken: string | undefined,
  csrfTokenIsNew: boolean,
): Response {
  // Only re-issue Set-Cookie when this render minted the token. Reusing
  // an incoming cookie value (Issue 070) means no Set-Cookie is needed
  // and avoids stomping on a concurrent tab's hidden form input.
  if (csrfToken !== undefined && csrfTokenIsNew) {
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
    queryClient: createQueryClient(),
    request: options.request,
  };
  const pageHtml = await renderServerFileToHtml(
    options.routeFile,
    props,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  const pageHtmlForLayout =
    options.navigation?.clientRoute === true
      ? withHydrationMarkers({
          clientReferenceManifest: undefined,
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

    try {
      const response = await middleware(options.request);

      return response instanceof Response ? response : undefined;
    } catch (error) {
      if (isRedirectError(error)) {
        return new Response(null, {
          headers: { location: error.location },
          status: error.status,
        });
      }

      if (isNotFoundError(error)) {
        return new Response("Not Found", { status: 404 });
      }

      throw error;
    }
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

function middlewareMatches(config: MiddlewareModule["config"], pathname: string): boolean {
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
  clientBoundaryImports?: readonly string[];
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
      metadata: artifact.metadata ?? {
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
    ...(options.clientBoundaryImports === undefined
      ? {}
      : { clientBoundaryImports: options.clientBoundaryImports }),
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

async function analyzeRouteSource(options: {
  code: string;
  filename: string;
  routePath: string;
  serverModuleCacheVersion: string | undefined;
}): Promise<RouteSourceAnalysis> {
  const sourceHash = memoizedHashText(options.code);
  const cacheKey = `${options.serverModuleCacheVersion ?? "dev"}\0${options.filename}\0${sourceHash}`;
  const cached = routeSourceAnalysisCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pending = analyzeRouteSourceUncached(options).catch((error) => {
    routeSourceAnalysisCache.delete(cacheKey);
    throw error;
  });
  setBoundedCacheEntry(
    routeSourceAnalysisCache,
    cacheKey,
    pending,
    maxRouteSourceAnalysisCacheEntries,
  );

  return pending;
}

async function analyzeRouteSourceUncached(options: {
  code: string;
  filename: string;
  routePath: string;
}): Promise<RouteSourceAnalysis> {
  const routeCode = stripRouteModuleExports(options.code);
  const clientInference = await inferClientRouteModule({
    code: routeCode,
    filename: options.filename,
    routePath: options.routePath,
  });

  return {
    authIncludesClaims: authIncludesClaims(options.code),
    cachePolicy: routeCachePolicyFromSource(options.code),
    clientInference,
    hasLoader: hasLoaderExport(options.code),
    routeCode,
    streamRoute: isStreamRouteSource(options.code),
    usesRuntimeCacheControl: usesRuntimeCacheControl(options.code),
  };
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
  const component = await loadServerComponent(
    code,
    sourcefile,
    serverModules,
    serverModuleCacheVersion,
  );

  return component(props);
}

async function runServerModuleWithSlots(
  code: string,
  props: ServerComponentProps,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
): Promise<{ html: string; slots: Record<string, string> }> {
  const module = await loadServerModule(code, sourcefile, serverModules, serverModuleCacheVersion);
  const component = selectServerComponent(module);

  return {
    html: await component(props),
    slots: await renderRouteSlots(module.slots, props),
  };
}

async function loadServerModule(
  code: string,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
): Promise<ServerModuleExports> {
  const artifact = serverModules?.get(sourcefile)?.string;
  const codeHash = memoizedHashText(code);
  const moduleCode =
    artifact !== undefined && artifact.sourceHash === codeHash ? artifact.code : code;
  const cacheKey =
    serverModuleCacheVersion === undefined
      ? undefined
      : `server-component:${serverModuleCacheVersion}:${sourcefile}:${
          moduleCode === code ? codeHash : memoizedHashText(moduleCode)
        }`;
  return await importAppRouterSourceModule<ServerModuleExports>({
    cacheKey,
    code: moduleCode,
    label: `server-component:${sourcefile}`,
    resolveDir: dirname(sourcefile),
    sourcefile,
  });
}

async function loadServerComponent(
  code: string,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
): Promise<ServerComponent> {
  const module = await loadServerModule(code, sourcefile, serverModules, serverModuleCacheVersion);
  return selectServerComponent(module);
}

function selectServerComponent(module: ServerModuleExports): ServerComponent {
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (typeof component !== "function") {
    throw new Error("No page component export was found.");
  }

  return component as ServerComponent;
}

async function renderRouteSlots(
  slots: RouteSlotExports | undefined,
  props: ServerComponentProps,
): Promise<Record<string, string>> {
  if (slots === undefined) {
    return {};
  }

  const rendered: Record<string, string> = {};

  for (const [name, value] of Object.entries(slots)) {
    rendered[name] = typeof value === "function" ? await value(props) : value;
  }

  return rendered;
}

function runServerStreamModule(
  code: string,
  options: {
    appDir: string;
    pageFile: string;
    props: ServerComponentProps;
    routePath: string;
    clientRoute: boolean;
    clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
    serverSourceFiles?: ReadonlyMap<string, string> | undefined;
    script?: string | undefined;
  },
): ReadableStream<Uint8Array> {
  return renderToReadableStream(async (sink) => {
    const slots = await renderServerStreamSlots(code, {
      pageFile: options.pageFile,
      props: options.props,
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });
    const layoutShells = await layoutShellsForPage(
      options.appDir,
      options.pageFile,
      options.props,
      slots,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const marker = options.clientRoute
      ? hydrationMarkerParts({
          clientReferenceManifest: options.clientReferenceManifest,
          routePath: options.routePath,
          script: options.script,
          props: {
            params: options.props.params,
            request: { url: options.props.request.url },
            data: options.props.data,
          },
        })
      : undefined;

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

    if (hasOutOfOrderBoundary(code)) {
      renderOutOfOrderReorderScript(sink);
    }
  });
}

function hasOutOfOrderBoundary(code: string): boolean {
  return code.includes("renderOutOfOrderBoundary");
}

function mayRenderOutOfOrderBoundary(code: string): boolean {
  return (
    code.includes("<Await") || code.includes("Await(") || code.includes("renderOutOfOrderBoundary")
  );
}

async function runServerStreamModuleWithLoading(
  code: string,
  options: {
    appDir: string;
    clientRoute: boolean;
    clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
    data: Promise<unknown>;
    loadingFile: string;
    pageFile: string;
    params: Record<string, string>;
    queryClient: QueryClient;
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
    queryClient: options.queryClient,
    request: options.request,
  };
  const layoutShells = await layoutShellsForPage(
    options.appDir,
    options.pageFile,
    loadingProps,
    {},
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
        clientReferenceManifest: options.clientReferenceManifest,
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
            queryClient: options.queryClient,
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
  const module = await loadServerStreamModule(
    code,
    sourcefile,
    serverModules,
    serverModuleCacheVersion,
  );
  const component = selectStreamComponent(module);

  await component(sink, props);
}

async function renderServerStreamSlots(
  code: string,
  options: {
    pageFile: string;
    props: ServerComponentProps;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
  },
): Promise<Record<string, string>> {
  if (!hasRouteSlotsExport(code)) {
    return {};
  }

  const module = await loadServerStreamModule(
    code,
    options.pageFile,
    options.serverModules,
    options.serverModuleCacheVersion,
  );

  if (module.slots === undefined) {
    return {};
  }

  const rendered: Record<string, string> = {};

  for (const [name, value] of Object.entries(module.slots)) {
    if (typeof value !== "function") {
      rendered[name] = value;
      continue;
    }

    const sink = createStringSink();
    await value(sink, options.props);
    await sink.drain();
    rendered[name] = sink.toString();
  }

  return rendered;
}

function hasRouteSlotsExport(code: string): boolean {
  return /^\s*export\s+const\s+slots\s*=/m.test(code);
}

async function loadServerStreamModule(
  code: string,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
): Promise<StreamModuleExports> {
  const artifactCode = serverModules?.get(sourcefile)?.stream;
  const codeHash = memoizedHashText(code);
  const moduleCode =
    artifactCode !== undefined && artifactCode.sourceHash === codeHash ? artifactCode.code : code;
  const cacheKey =
    serverModuleCacheVersion === undefined
      ? undefined
      : `server-stream-component:${serverModuleCacheVersion}:${sourcefile}:${
          moduleCode === code ? codeHash : memoizedHashText(moduleCode)
        }`;
  return await importAppRouterSourceModule<StreamModuleExports>({
    cacheKey,
    code: moduleCode,
    label: `server-stream-component:${sourcefile}`,
    resolveDir: dirname(sourcefile),
    sourcefile,
  });
}

function selectStreamComponent(module: StreamModuleExports): StreamComponent {
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (typeof component !== "function") {
    throw new Error("No page component export was found.");
  }

  return component as StreamComponent;
}

async function applyLayouts(options: {
  appDir: string;
  pageFile: string;
  html: string;
  props: ServerComponentProps;
  slots?: Record<string, string> | undefined;
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
  const slotContext = createSlotRenderContext(options.slots);

  for (const shell of layoutFiles.reverse()) {
    const rendered = await renderShellPrefixSuffix(
      options.appDir,
      shell,
      options.props,
      slotContext,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    html = `${rendered.prefix}${html}${rendered.suffix}`;
  }

  warnUnconsumedRouteSlots({
    appDir: options.appDir,
    pageFile: options.pageFile,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    slotContext,
  });

  return html;
}

async function layoutShellsForPage(
  appDir: string,
  pageFile: string,
  props: ServerComponentProps,
  slots: Readonly<Record<string, string>>,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
): Promise<RenderedShell[]> {
  const layoutFiles = await shellFilesForPage(appDir, pageFile, serverModuleCacheVersion);
  const shells: RenderedShell[] = [];
  const slotContext = createSlotRenderContext(slots);

  for (const shell of layoutFiles) {
    shells.push(
      await renderShellPrefixSuffix(
        appDir,
        shell,
        props,
        slotContext,
        serverModules,
        serverModuleCacheVersion,
        serverSourceFiles,
      ),
    );
  }

  warnUnconsumedRouteSlots({
    appDir,
    pageFile,
    serverModuleCacheVersion,
    slotContext,
  });

  return shells;
}

async function renderShellPrefixSuffix(
  appDir: string,
  shell: ShellFile,
  props: ServerComponentProps,
  slotContext: SlotRenderContext,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
): Promise<RenderedShell> {
  const hasNamedSlots = Object.keys(slotContext.namedSlots).length > 0;
  const cacheKey =
    serverModuleCacheVersion === undefined || hasNamedSlots
      ? undefined
      : `${appDir}\0${shell.file}\0${serverModuleCacheVersion}`;
  if (cacheKey !== undefined) {
    const cached = renderedShellCache.get(cacheKey);
    if (cached !== undefined && cached !== "impure") {
      return cached;
    }
  }

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

  const component = await loadServerComponent(
    output.code,
    shell.file,
    serverModules,
    serverModuleCacheVersion,
  );
  const rendered = splitLayoutSlot(markShellBoundary(await component(props), shell), slotContext);
  const cached = cacheKey !== undefined ? renderedShellCache.get(cacheKey) : undefined;

  // Detect purity: a zero-arg component cannot depend on props. The
  // markShellBoundary + splitLayoutSlot output is then constant for
  // the (appDir, shellFile, version) tuple. We only set the cache
  // entry on the first request that observes the function arity; on
  // an "impure" tag we never overwrite it.
  if (cacheKey !== undefined && cached !== "impure") {
    if (component.length === 0) {
      if (renderedShellCache.size >= MAX_RENDERED_SHELL_CACHE_ENTRIES) {
        const oldestKey = renderedShellCache.keys().next().value;
        if (oldestKey !== undefined) {
          renderedShellCache.delete(oldestKey);
        }
      }
      renderedShellCache.set(cacheKey, rendered);
    } else {
      // Impure — stamp the cache so subsequent lookups short-circuit
      // without re-checking arity. We still run the per-request
      // render path above so the props are honoured.
      renderedShellCache.set(cacheKey, "impure");
    }
  }

  return rendered;
}

function splitLayoutSlot(
  layoutHtml: string,
  slotContext: SlotRenderContext = createSlotRenderContext(),
): { prefix: string; suffix: string } {
  const html = replaceNamedLayoutSlots(layoutHtml, slotContext);
  const match = findDefaultLayoutSlot(html);

  if (match === null) {
    return { prefix: html, suffix: "" };
  }

  return {
    prefix: html.slice(0, match.index),
    suffix: html.slice(match.index + match[0].length),
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
    shell.kind === "layout" ? "data-mreact-layout-boundary" : "data-mreact-template-boundary";

  if (html.includes(`${attributeName}=`)) {
    return html;
  }

  return html.replace(
    /<([A-Za-z][^\s/>]*)([^>]*)>/,
    `<$1$2 ${attributeName}="${escapeHtmlAttribute(shell.id)}">`,
  );
}

function replaceLayoutSlot(
  layoutHtml: string,
  childHtml: string,
  slotContext: SlotRenderContext = createSlotRenderContext(),
): string {
  const html = replaceNamedLayoutSlots(layoutHtml, slotContext);
  const match = findDefaultLayoutSlot(html);

  return match === null
    ? `${html}${childHtml}`
    : `${html.slice(0, match.index)}${childHtml}${html.slice(match.index + match[0].length)}`;
}

function replaceNamedLayoutSlots(layoutHtml: string, slotContext: SlotRenderContext): string {
  return layoutHtml.replace(SLOT_TAG_PATTERN, (source, openAttributes: string) => {
    const name = readSlotName(openAttributes);

    if (name === undefined || name === "default") {
      return source;
    }

    if (Object.hasOwn(slotContext.namedSlots, name)) {
      slotContext.consumedSlots.add(name);
      return slotContext.namedSlots[name] ?? "";
    }

    return "";
  });
}

const SLOT_TAG_PATTERN = /<slot\b([^>]*)>(?:<\/slot\s*>)?/g;

function findDefaultLayoutSlot(html: string): RegExpExecArray | null {
  SLOT_TAG_PATTERN.lastIndex = 0;

  for (;;) {
    const match = SLOT_TAG_PATTERN.exec(html);

    if (match === null) {
      return null;
    }

    const name = readSlotName(match[1] ?? "");

    if (name === undefined || name === "default") {
      return match;
    }
  }
}

function readSlotName(attributes: string): string | undefined {
  const match = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attributes);

  return match?.[1] ?? match?.[2];
}

function createSlotRenderContext(
  namedSlots: Readonly<Record<string, string>> = {},
): SlotRenderContext {
  return {
    consumedSlots: new Set(),
    namedSlots,
  };
}

function warnUnconsumedRouteSlots(options: {
  appDir: string;
  pageFile: string;
  serverModuleCacheVersion: string | undefined;
  slotContext: SlotRenderContext;
}): void {
  if (options.serverModuleCacheVersion !== undefined) {
    return;
  }

  const slotNames = Object.keys(options.slotContext.namedSlots);
  if (slotNames.length === 0) {
    return;
  }

  const routeLabel = relative(options.appDir, options.pageFile).replaceAll(sep, "/");

  for (const name of slotNames) {
    if (name === "default") {
      console.warn(
        `[mreact] ${routeLabel}: slots.default does not target <Slot />; use the page body for default slot content.`,
      );
      continue;
    }

    if (!options.slotContext.consumedSlots.has(name)) {
      console.warn(
        `[mreact] ${routeLabel}: slots.{${name}} is not consumed by any ancestor layout or template.`,
      );
    }
  }
}

interface RouteDataContext {
  params: Record<string, string>;
  queryClient: QueryClient;
  request: Request;
}

interface RouteMetadata {
  alternates?: {
    canonical?: MetadataScalar;
  };
  description?: MetadataScalar;
  csp?: {
    directives?: Record<string, readonly string[] | string>;
    nonce?: string;
  };
  head?: readonly RouteHeadDescriptor[];
  icons?: {
    apple?: MetadataScalar;
    icon?: MetadataScalar;
  };
  openGraph?: {
    description?: MetadataScalar;
    image?: MetadataScalar;
    images?: readonly MetadataScalar[];
    title?: MetadataScalar;
  };
  robots?:
    | string
    | {
        follow?: boolean;
        index?: boolean;
      };
  themeColor?: MetadataScalar | MetadataThemeColor;
  title?: MetadataScalar;
  viewport?: MetadataScalar | MetadataViewport;
}

type MetadataScalar = boolean | number | string;

type MetadataViewport = Record<string, MetadataScalar | null | undefined>;

interface MetadataThemeColor {
  color?: MetadataScalar;
  media?: MetadataScalar;
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

async function loadComposedRouteMetadata(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<RouteMetadata | undefined> {
  const cacheKey =
    options.serverModuleCacheVersion === undefined
      ? undefined
      : `${options.appDir}\0${options.filename}\0${options.serverModuleCacheVersion}\0${memoizedHashText(options.code)}`;
  if (cacheKey !== undefined) {
    const cached = composedRouteMetadataCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const loaded = loadComposedRouteMetadataUncached(options).catch((error) => {
    if (cacheKey !== undefined) {
      composedRouteMetadataCache.delete(cacheKey);
    }
    throw error;
  });
  if (cacheKey !== undefined) {
    setBoundedCacheEntry(
      composedRouteMetadataCache,
      cacheKey,
      loaded,
      maxComposedRouteMetadataCacheEntries,
    );
  }

  return loaded;
}

async function loadComposedRouteMetadataUncached(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<RouteMetadata | undefined> {
  const layoutFiles = await shellFilesForPage(
    options.appDir,
    options.filename,
    options.serverModuleCacheVersion,
  );
  const metadata: RouteMetadata[] = [];

  for (const shell of layoutFiles) {
    if (shell.kind !== "layout") {
      continue;
    }

    const code = await readServerSourceFile(
      shell.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const shellMetadata = await loadRouteMetadata({
      appDir: options.appDir,
      code,
      filename: shell.file,
      importPolicy: options.importPolicy,
    });

    if (shellMetadata !== undefined) {
      metadata.push(shellMetadata);
    }
  }

  const pageMetadata = await loadRouteMetadata({
    appDir: options.appDir,
    code: options.code,
    filename: options.filename,
    importPolicy: options.importPolicy,
  });

  if (pageMetadata !== undefined) {
    metadata.push(pageMetadata);
  }

  return mergeRouteMetadata(metadata);
}

function mergeRouteMetadata(metadata: readonly RouteMetadata[]): RouteMetadata | undefined {
  if (metadata.length === 0) {
    return undefined;
  }

  return metadata.reduce<RouteMetadata>((merged, next) => {
    const mergedMetadata: RouteMetadata = { ...merged, ...next };
    const alternates = mergeObject(merged.alternates, next.alternates);
    const csp = mergeCspMetadata(merged.csp, next.csp);
    const head = mergeReadonlyArrays(merged.head, next.head);
    const icons = mergeObject(merged.icons, next.icons);
    const openGraph = mergeOpenGraphMetadata(merged.openGraph, next.openGraph);

    if (alternates !== undefined) {
      mergedMetadata.alternates = alternates;
    }
    if (csp !== undefined) {
      mergedMetadata.csp = csp;
    }
    if (head !== undefined) {
      mergedMetadata.head = head;
    }
    if (icons !== undefined) {
      mergedMetadata.icons = icons;
    }
    if (openGraph !== undefined) {
      mergedMetadata.openGraph = openGraph;
    }

    return mergedMetadata;
  }, {});
}

function mergeObject<T extends object>(left: T | undefined, right: T | undefined): T | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return { ...left, ...right };
}

function mergeReadonlyArrays<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
): readonly T[] | undefined {
  if (left === undefined || left.length === 0) {
    return right;
  }

  if (right === undefined || right.length === 0) {
    return left;
  }

  return [...left, ...right];
}

function mergeCspMetadata(
  left: RouteMetadata["csp"],
  right: RouteMetadata["csp"],
): RouteMetadata["csp"] | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  const merged: NonNullable<RouteMetadata["csp"]> = {
    ...left,
    ...right,
  };
  const directives = mergeObject(left.directives, right.directives);

  if (directives !== undefined) {
    merged.directives = directives;
  }

  return merged;
}

function mergeOpenGraphMetadata(
  left: RouteMetadata["openGraph"],
  right: RouteMetadata["openGraph"],
): RouteMetadata["openGraph"] | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  const merged: NonNullable<RouteMetadata["openGraph"]> = {
    ...left,
    ...right,
  };
  const images = mergeReadonlyArrays(openGraphImages(left), openGraphImages(right));

  if (images !== undefined && images.length > 0) {
    merged.images = images;
  }

  return merged;
}

function hasMetadataExport(code: string): boolean {
  return /\bexport\s+const\s+metadata\s*=/.test(code);
}

function usesRuntimeCacheControl(code: string): boolean {
  return /\bcacheControl\s*\(/.test(code);
}

function injectHeadMetadata(html: string, metadata: RouteMetadata | undefined): string {
  if (metadata === undefined) {
    return html;
  }

  const tags = [
    metadata.title === undefined
      ? undefined
      : `<title>${escapeHtml(metadataString(metadata.title, "title"))}</title>`,
    metadata.description === undefined
      ? undefined
      : `<meta name="description" content="${escapeHtmlAttribute(metadataString(metadata.description, "description"))}">`,
    metadata.alternates?.canonical === undefined
      ? undefined
      : `<link rel="canonical" href="${escapeHtmlAttribute(metadataString(metadata.alternates.canonical, "alternates.canonical"))}">`,
    metadata.openGraph?.title === undefined
      ? undefined
      : `<meta property="og:title" content="${escapeHtmlAttribute(metadataString(metadata.openGraph.title, "openGraph.title"))}">`,
    metadata.openGraph?.description === undefined
      ? undefined
      : `<meta property="og:description" content="${escapeHtmlAttribute(metadataString(metadata.openGraph.description, "openGraph.description"))}">`,
    ...openGraphImages(metadata.openGraph).map(
      (image) => `<meta property="og:image" content="${escapeHtmlAttribute(image)}">`,
    ),
    metadata.icons?.icon === undefined
      ? undefined
      : `<link rel="icon" href="${escapeHtmlAttribute(metadataString(metadata.icons.icon, "icons.icon"))}">`,
    metadata.icons?.apple === undefined
      ? undefined
      : `<link rel="apple-touch-icon" href="${escapeHtmlAttribute(metadataString(metadata.icons.apple, "icons.apple"))}">`,
    metadata.robots === undefined
      ? undefined
      : `<meta name="robots" content="${escapeHtmlAttribute(robotsContent(metadata.robots))}">`,
    metadata.themeColor === undefined ? undefined : themeColorTag(metadata.themeColor),
    metadata.viewport === undefined
      ? undefined
      : `<meta name="viewport" content="${escapeHtmlAttribute(viewportContent(metadata.viewport))}">`,
    ...headDescriptorTags(metadata.head, metadata.csp?.nonce),
  ]
    .filter((tag): tag is string => tag !== undefined)
    .join("");

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

function injectQueryState(html: string, state: DehydratedQueryClient): string {
  if (state.queries.length === 0) {
    return html;
  }

  const script = `<script type="application/json" id="${__MREACT_QUERY_STATE_SCRIPT_ID}">${escapeJsonForHtml(
    JSON.stringify(state),
  )}</script>`;

  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${script}</body>`)
    : `${html}${script}`;
}

function injectAuthSessionClaims(html: string, claims: unknown): string {
  if (claims === undefined) {
    return html;
  }

  const script = `<script type="application/json" id="${authSessionScriptId}">${escapeJsonForHtml(
    JSON.stringify(claims),
  )}</script>`;

  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${script}</body>`)
    : `${html}${script}`;
}

function authIncludesClaims(code: string): boolean {
  return /\bexport\s+const\s+auth\s*=\s*["']include-claims["']\s*;?/.test(code);
}

function currentAuthClaims(): unknown {
  return authRequestStorage().getStore()?.claims;
}

function authRequestStorage(): AsyncLocalStorage<AuthRuntimeRequestState> {
  const global = globalThis as typeof globalThis & {
    [authRuntimeStateKey]?: AuthRuntimeState | undefined;
  };
  global[authRuntimeStateKey] ??= {};
  global[authRuntimeStateKey].storage ??= new AsyncLocalStorage<AuthRuntimeRequestState>();
  return global[authRuntimeStateKey].storage;
}

function escapeJsonForHtml(value: string): string {
  return value
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
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

function metadataString(value: MetadataScalar, path: string): string {
  if (isMetadataScalar(value)) {
    return String(value);
  }

  throw new Error(`Invalid metadata field ${path}: expected string, number, or boolean.`);
}

function metadataKebabName(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function viewportContent(viewport: MetadataScalar | MetadataViewport): string {
  if (isMetadataScalar(viewport)) {
    return metadataString(viewport, "viewport");
  }

  return Object.entries(viewport)
    .flatMap(([key, value]) => {
      if (value === undefined || value === null || value === false) {
        return [];
      }

      return [`${metadataKebabName(key)}=${metadataString(value, `viewport.${key}`)}`];
    })
    .join(", ");
}

function themeColorTag(themeColor: MetadataScalar | MetadataThemeColor): string {
  if (isMetadataScalar(themeColor)) {
    return `<meta name="theme-color" content="${escapeHtmlAttribute(metadataString(themeColor, "themeColor"))}">`;
  }

  const content = themeColor.color;
  if (!isMetadataScalar(content)) {
    throw new Error(
      "Invalid metadata field themeColor.color: expected string, number, or boolean.",
    );
  }

  const media =
    themeColor.media === undefined
      ? ""
      : ` media="${escapeHtmlAttribute(metadataString(metadataScalarField(themeColor.media, "themeColor.media"), "themeColor.media"))}"`;

  return `<meta name="theme-color"${media} content="${escapeHtmlAttribute(metadataString(content, "themeColor.color"))}">`;
}

function metadataScalarField(value: unknown, path: string): MetadataScalar {
  if (isMetadataScalar(value)) {
    return value;
  }

  throw new Error(`Invalid metadata field ${path}: expected string, number, or boolean.`);
}

function isMetadataScalar(value: unknown): value is MetadataScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function openGraphImages(openGraph: RouteMetadata["openGraph"]): readonly string[] {
  if (openGraph?.images !== undefined) {
    return openGraph.images.map((image, index) =>
      metadataString(image, `openGraph.images.${index}`),
    );
  }

  return openGraph?.image === undefined ? [] : [metadataString(openGraph.image, "openGraph.image")];
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

function setBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value as K | undefined;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, value);
}
