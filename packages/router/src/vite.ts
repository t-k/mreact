import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { dirname, relative, sep } from "node:path";
import { formatDiagnostic } from "@reckona/mreact-compiler";
import {
  createCompilerModuleContext,
  transformCompilerModuleContext,
} from "@reckona/mreact-compiler/internal";
import {
  normalizePath,
  type Connect,
  type Plugin,
  type PluginOption,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterCache } from "./cache.js";
import {
  resolveAppRouterProjectOptions,
  type AppRouterProjectOptions,
  type ResolvedAppRouterProject,
} from "./config.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import {
  collectClientRouteReferences,
  createClientRouteInferenceCache,
  isClientRouteSource,
  resolveNavigationRuntime,
  type ClientRouteInferenceCache,
} from "./client-route-inference.js";
import {
  buildNavigationRuntimeBundle,
  buildClientRouteBundle,
  buildClientRouteEntrySource,
  clientScriptForPath,
  navigationRuntimeScriptForDev,
} from "./navigation-runtime.js";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";
import { renderAppRequest } from "./render.js";
import { stripRouteClientOnlyExports } from "./route-source.js";
import {
  collectRouteCssHrefs,
  collectSpecialBoundaryFiles,
  createCachedRouteSourceReader,
} from "./route-styles.js";
import { createRouteMatcher, scanAppRoutes, type AppRoute } from "./routes.js";
import { resolveRequestHost, type RequestHostPolicy } from "./serve.js";
import { hasJsxSyntax } from "./source-jsx.js";
import { workspacePackageFile } from "./workspace-packages.js";

export interface AppRouterViteMiddlewareOptions extends AppRouterProjectOptions {
  allowedHosts?: readonly string[] | undefined;
  define?: UserConfig["define"] | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}

type AppRouterViteRuntimeMiddlewareOptions = AppRouterViteMiddlewareOptions & {
  clientRouteInferenceCache?: ClientRouteInferenceCache | undefined;
  navigationScanVitePlugins?: readonly PluginOption[] | undefined;
  viteDevServer?: ViteDevServer | undefined;
};

export interface AppRouterVitePluginOptions extends AppRouterProjectOptions {
  allowedHosts?: readonly string[] | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

const clientPrefix = "/_mreact/client/";
const devCssPrefix = "/_mreact/dev-css/";
const devCssSourceQuery = "mreact-router-dev-css-source";
const clientRouteModuleQuery = "mreact-router-client-route";
const virtualClientPrefix = "\0mreact-router-client:";
const virtualReactiveCoreId = "\0mreact-router-reactive-core";
const virtualReactiveDevtoolsId = "\0mreact-router-reactive-devtools";
const mreactRouterConfigKey = "__mreactRouterConfig";

type MreactRouterPluginConfig = ResolvedAppRouterProject & {
  importPolicy?: AppRouterImportPolicy | undefined;
};

type MreactRouterPlugin = Plugin & {
  [mreactRouterConfigKey]: MreactRouterPluginConfig;
};

export function createAppRouterVitePlugin(options: AppRouterVitePluginOptions): Plugin {
  const project = resolveAppRouterProjectOptions(options);
  const normalizedSourceDirs = project.allowedSourceDirs.map((directory) =>
    normalizePath(directory),
  );
  const packageFile = (monorepoDir: string, packageName: string, entry: string): string =>
    workspacePackageFile({
      currentFileUrl: import.meta.url,
      entry,
      monorepoDir,
      packageName,
    });
  const reactiveCorePath = packageFile("reactive-core", "@reckona/mreact-reactive-core", "index");
  const reactiveCoreDir = normalizePath(dirname(reactiveCorePath));
  const reactiveDomPath = packageFile("reactive-dom", "@reckona/mreact-reactive-dom", "index");
  const reactiveDomDir = normalizePath(dirname(reactiveDomPath));
  const reactPath = packageFile("react", "@reckona/mreact", "index");
  const reactDir = normalizePath(dirname(reactPath));
  const reactCompatPath = packageFile("react-compat", "@reckona/mreact-compat", "index");
  const reactCompatDir = normalizePath(dirname(reactCompatPath));
  const runtimePackageDirs = [reactiveCoreDir, reactiveDomDir, reactDir, reactCompatDir];
  const runtimePackageNames = [
    "@reckona/mreact",
    "@reckona/mreact-reactive-core",
    "@reckona/mreact-reactive-dom",
    "@reckona/mreact-compat",
  ];
  const runtimePaths = new Map([
    ["react", reactCompatPath],
    ["react-dom", reactCompatPath],
    ["react-dom/client", reactCompatPath],
    ["react-dom/server", reactCompatPath],
    [
      "react/jsx-dev-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-dev-runtime"),
    ],
    ["react/jsx-runtime", packageFile("react-compat", "@reckona/mreact-compat", "jsx-runtime")],
    ["@reckona/mreact", reactPath],
    [
      "@reckona/mreact-reactive-core/internal",
      packageFile("reactive-core", "@reckona/mreact-reactive-core", "internal"),
    ],
    ["@reckona/mreact-reactive-dom", reactiveDomPath],
    ["@reckona/mreact-compat", reactCompatPath],
    [
      "@reckona/mreact-compat/event-priority",
      packageFile("react-compat", "@reckona/mreact-compat", "event-priority"),
    ],
    [
      "@reckona/mreact-compat/flight",
      packageFile("react-compat", "@reckona/mreact-compat", "flight"),
    ],
    [
      "@reckona/mreact-compat/hooks",
      packageFile("react-compat", "@reckona/mreact-compat", "hooks-entry"),
    ],
    [
      "@reckona/mreact-compat/internal",
      packageFile("react-compat", "@reckona/mreact-compat", "internal"),
    ],
    [
      "@reckona/mreact-compat/jsx-dev-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-dev-runtime"),
    ],
    [
      "@reckona/mreact-compat/jsx-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-runtime"),
    ],
    [
      "@reckona/mreact-compat/scheduler",
      packageFile("react-compat", "@reckona/mreact-compat", "scheduler"),
    ],
    ["@reckona/mreact-router/link", packageFile("router", "@reckona/mreact-router", "link")],
    [
      "@reckona/mreact-router/navigation-state",
      packageFile("router", "@reckona/mreact-router", "navigation-state"),
    ],
    [
      "@reckona/mreact-shared/url-safety",
      packageFile("shared", "@reckona/mreact-shared", "url-safety"),
    ],
  ]);

  // User-declared plugins captured from the resolving config. Unlike the fully
  // resolved `server.config.plugins`, this excludes Vite internals (e.g. the
  // built-in CSS plugin) whose `transform` requires a dev-server environment the
  // lightweight navigation scan cannot provide. Mirrors what the build forwards.
  let userVitePlugins: readonly PluginOption[] | undefined;

  const plugin: MreactRouterPlugin = {
    [mreactRouterConfigKey]: {
      ...project,
      ...(options.importPolicy === undefined ? {} : { importPolicy: options.importPolicy }),
    },
    enforce: "pre",
    name: "mreact-router",
    config(userConfig) {
      userVitePlugins = routeTransformUserVitePlugins(userConfig.plugins);

      return {
        optimizeDeps: {
          // Every client-importable mreact package must resolve through the
          // same dev module graph. Prebundling any of them inlines a second
          // reactive-core (and devtools) copy into the deps chunk, which
          // silently breaks cross-package cell tracking, and also bypasses the
          // react/react-dom alias resolution this plugin provides.
          exclude: [
            "react",
            "react-dom",
            "react-dom/client",
            "react-dom/server",
            "react/jsx-dev-runtime",
            "react/jsx-runtime",
            "@reckona/mreact",
            "@reckona/mreact-auth",
            "@reckona/mreact-compat",
            "@reckona/mreact-devtools",
            "@reckona/mreact-dom",
            "@reckona/mreact-forms",
            "@reckona/mreact-next",
            "@reckona/mreact-query",
            "@reckona/mreact-reactive-core",
            "@reckona/mreact-reactive-dom",
            "@reckona/mreact-router",
            "@reckona/mreact-scheduler",
            "@reckona/mreact-shared",
            "@reckona/mreact-store",
            "@reckona/mreact-test-utils",
            "@reckona/mreact-virtual",
          ],
        },
      };
    },
    configureServer(server) {
      server.middlewares.use(createDevCssProxyMiddleware());

      return () => {
        const middlewareOptions: AppRouterViteRuntimeMiddlewareOptions = {
          ...options,
          define: server.config.define,
          navigationScanVitePlugins: userVitePlugins ?? [],
          viteDevServer: server,
          vitePlugins: server.config.plugins,
        };

        server.middlewares.use(createAppRouterViteMiddleware(middlewareOptions));
      };
    },
    handleHotUpdate(context) {
      const normalizedFile = normalizePath(context.file);

      if (!normalizedSourceDirs.some((directory) => normalizedFile.startsWith(directory))) {
        return;
      }

      const timestamp = Date.now();
      const updates = Array.from(context.server.moduleGraph.idToModuleMap.values())
        .filter((moduleNode) => isMreactClientDevModuleId(moduleNode.id))
        .map((moduleNode) => {
          context.server.moduleGraph.invalidateModule(moduleNode);

          return {
            acceptedPath: moduleNode.url,
            path: moduleNode.url,
            timestamp,
            type: "js-update" as const,
          };
        });

      if (updates.length > 0) {
        context.server.ws.send({ type: "update", updates });
      }

      return [];
    },
    load(id) {
      if (isDevCssSourceModuleId(id)) {
        return loadDevCssSourceModule({
          cssFile: clientRequestPath(id),
          sourceDirs: project.allowedSourceDirs,
        });
      }

      if (id === virtualReactiveCoreId) {
        return `import { cell as nativeCell } from ${JSON.stringify(reactiveCorePath)};
export * from ${JSON.stringify(reactiveCorePath)};
export function cell(initial) {
  const routeCell = globalThis.__mreactRouteCell;
  return typeof routeCell === "function" ? routeCell(nativeCell, initial) : nativeCell(initial);
}`;
      }

      if (id === virtualReactiveDevtoolsId) {
        return `export function emitReactiveDevtoolsEvent() {}
export function hasReactiveDevtoolsEmitter() { return false; }
export function currentDevtoolsEmitter() { return undefined; }`;
      }

      if (id.startsWith(virtualClientPrefix)) {
        return renderAppRouterClientAsset(project.routesDir, id.slice(virtualClientPrefix.length), {
          dev: true,
        }).then(async (response) => {
          if (!response.ok) {
            const message = await response.text();
            throw new Error(message || `MReact client route asset was not found: ${id}`);
          }

          return response.text();
        });
      }

      const requestPath = clientRouteModuleRequestPath(id);

      return requestPath === undefined
        ? undefined
        : renderAppRouterClientRouteDevModule(project.routesDir, requestPath);
    },
    transform(code, id, options) {
      if (options?.ssr === true) {
        return undefined;
      }

      if (isMreactClientDevModuleId(id)) {
        return undefined;
      }

      const filename = clientRequestPath(id);

      if (!isMreactClientSourceDependency(filename, normalizedSourceDirs)) {
        return undefined;
      }

      const moduleContext = createCompilerModuleContext({ code, filename });

      if (!hasJsxSyntax(moduleContext.program)) {
        return undefined;
      }

      const output = transformCompilerModuleContext({
        code,
        dev: true,
        filename,
        mode: isCompatSourcePath(filename) ? "compat" : "reactive",
        moduleContext,
        target: "client",
      });

      if (output.diagnostics.length > 0) {
        throw new Error(
          output.diagnostics.map((diagnostic) => formatDiagnostic(filename, diagnostic)).join("\n"),
        );
      }

      return {
        code: output.code,
        map: null,
      };
    },
    async resolveId(id, importer) {
      const runtimePath = runtimePaths.get(id);

      if (id === "@reckona/mreact-reactive-core") {
        if (importerInRuntimePackage(importer, runtimePackageDirs, runtimePackageNames)) {
          return reactiveCorePath;
        }

        return virtualReactiveCoreId;
      }

      if (
        id === "./devtools.js" &&
        importerInRuntimePackage(importer, [reactiveCoreDir], ["@reckona/mreact-reactive-core"])
      ) {
        return virtualReactiveDevtoolsId;
      }

      if (runtimePath !== undefined) {
        return runtimePath;
      }

      const requestPath = clientRequestPath(id);

      if (requestPath === `${clientPrefix}${navigationRuntimeScriptForDev()}`) {
        return `${virtualClientPrefix}${requestPath}`;
      }

      if (!requestPath.startsWith(clientPrefix)) {
        return undefined;
      }

      const route = await clientRouteForRequestPath(project.routesDir, requestPath);

      return route === undefined ? undefined : clientRouteModuleId(route.file, requestPath);
    },
  };

  return plugin;
}

function isMreactClientSourceDependency(
  filename: string,
  normalizedSourceDirs: readonly string[],
): boolean {
  const normalized = normalizePath(filename);

  return (
    /\.(?:mreact\.)?[cm]?[jt]sx?$/.test(normalized) &&
    !normalized.includes("/node_modules/") &&
    normalizedSourceDirs.some(
      (directory) => normalized === directory || normalized.startsWith(`${directory}/`),
    )
  );
}

function isCompatSourcePath(filename: string): boolean {
  return /\.compat(?:\.mreact)?(?:\.[cm]?[jt]sx?)?$/.test(filename);
}

export const mreactRouter = createAppRouterVitePlugin;

function routeTransformUserVitePlugins(
  pluginOptions: readonly PluginOption[] | undefined,
): PluginOption[] {
  const plugins: PluginOption[] = [];
  const visit = (option: PluginOption | null | false | undefined): void => {
    if (option === false || option === null || option === undefined) {
      return;
    }

    if (Array.isArray(option)) {
      for (const child of option) {
        visit(child);
      }
      return;
    }

    if (typeof option === "object" && "then" in option) {
      return;
    }

    if (typeof option === "object" && mreactRouterConfigKey in option) {
      return;
    }

    plugins.push(option);
  };

  for (const option of pluginOptions ?? []) {
    visit(option);
  }

  return plugins;
}

export function mreactRouterConfigFromPlugins(
  plugins: readonly unknown[],
): ResolvedAppRouterProject | undefined {
  for (const plugin of plugins.flat(Infinity)) {
    if (plugin !== null && typeof plugin === "object" && mreactRouterConfigKey in plugin) {
      const config = (plugin as MreactRouterPlugin)[mreactRouterConfigKey];

      if ("project" in config) {
        return (config as unknown as { project: ResolvedAppRouterProject }).project;
      }

      return config as unknown as ResolvedAppRouterProject;
    }
  }

  return undefined;
}

export function createAppRouterViteMiddleware(
  options: AppRouterViteMiddlewareOptions,
): Connect.NextHandleFunction {
  // Reused across requests so dev navigation-script detection memoizes module
  // contexts/analyses instead of re-walking every route's import graph per
  // request. The source-keyed caches keep only the latest content version per
  // file (see setLatestModuleCacheEntry), so repeated edits do not accumulate
  // stale entries over a long dev session.
  const runtimeOptions: AppRouterViteRuntimeMiddlewareOptions = {
    ...options,
    clientRouteInferenceCache: createClientRouteInferenceCache(),
  };

  return (request, response, next) => {
    void handleAppRouterViteRequest(runtimeOptions, request, response, next);
  };
}

async function handleAppRouterViteRequest(
  options: AppRouterViteRuntimeMiddlewareOptions,
  incoming: Connect.IncomingMessage,
  outgoing: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  try {
    const project = resolveAppRouterProjectOptions(options);
    const host = resolveRequestHost({
      allowedHosts: options.allowedHosts,
      fallbackHost: "localhost",
      hostPolicy: options.hostPolicy,
      rawHost: incoming.headers.host,
    });
    const origin = `http://${host}`;
    const url = new URL(incoming.url ?? "/", origin);

    if (url.pathname.startsWith(clientPrefix)) {
      if (options.viteDevServer !== undefined) {
        const transformed = await options.viteDevServer.transformRequest(
          `${url.pathname}${url.search}`,
        );

        if (transformed !== null) {
          await sendResponse(
            outgoing,
            new Response(transformed.code, {
              headers: { "content-type": "text/javascript; charset=utf-8" },
            }),
          );
          return;
        }
      }

      await sendResponse(
        outgoing,
        await renderAppRouterClientAsset(project.routesDir, url.pathname, {
          vitePlugins: options.vitePlugins,
        }),
      );
      return;
    }

    const request = nodeRequestToWebRequest(incoming, origin);
    const routeTransformPlugins = options.navigationScanVitePlugins ?? options.vitePlugins;
    const routes = await scanAppRoutes({ appDir: project.routesDir });
    const routeMatcher = createRouteMatcher(routes);
    const readRouteSource = createCachedRouteSourceReader();
    const [clientStyles, clientStylesByFile, navigationScripts] = await Promise.all([
      devRouteStyles(project, routes, readRouteSource),
      devSpecialRouteStyles(project, readRouteSource),
      devNavigationScripts(
        project.routesDir,
        routes,
        readRouteSource,
        options.clientRouteInferenceCache,
        routeTransformPlugins,
      ),
    ]);

    await sendResponse(
      outgoing,
      await renderAppRequest({
        appDir: project.routesDir,
        define: options.define,
        importPolicy: {
          ...options.importPolicy,
          allowedSourceDirs: project.allowedSourceDirs,
          projectRoot: project.projectRoot,
        },
        clientStyles,
        clientStylesByFile,
        clientRouteInferenceCache: options.clientRouteInferenceCache,
        navigationScripts,
        request,
        routeCache: options.routeCache,
        routeMatcher,
        routes,
        serverActions: options.serverActions,
        vitePlugins: routeTransformPlugins,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function renderAppRouterClientAsset(
  appDir: string,
  pathname: string,
  options: { dev?: boolean; vitePlugins?: readonly PluginOption[] | undefined } = {},
): Promise<Response> {
  if (pathname === `/_mreact/client/${navigationRuntimeScriptForDev()}`) {
    const output = await buildNavigationRuntimeBundle();

    return new Response(options.dev === true ? withViteHmrRuntime(output.code) : output.code, {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }

  const routes = await scanAppRoutes({ appDir });
  const route = routes.find(
    (candidate) =>
      candidate.kind === "page" &&
      `/_mreact/client/${clientScriptForPath(candidate.path)}` === pathname,
  );

  if (route === undefined || route.kind !== "page") {
    return new Response("Not Found", { status: 404 });
  }

  const code = await readFile(route.file, "utf8");
  const clientSource = stripRouteClientOnlyExports(code, route.file);
  let references: Awaited<ReturnType<typeof collectClientRouteReferences>>;

  try {
    references = await collectClientRouteReferences({
      appDir,
      code: clientSource,
      filename: route.file,
      vitePlugins: options.vitePlugins,
    });
  } catch (error) {
    return clientAssetBuildErrorResponse(route.file, error);
  }

  if (!references.client) {
    if (isClientRouteSource(clientSource)) {
      return clientAssetBuildErrorResponse(
        route.file,
        new Error(
          [
            "Client route analysis did not produce a client asset.",
            "Browser build cannot import Node builtins or other server-only modules.",
            ...references.diagnostics.map((diagnostic) => diagnostic.message),
          ].join("\n"),
        ),
      );
    }

    return new Response("Not Found", { status: 404 });
  }

  let bundle: string;

  try {
    bundle = await buildClientRouteBundle({
      code: clientSource,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: route.file,
      routePath: route.path,
      vitePlugins: options.vitePlugins,
    });
  } catch (error) {
    return clientAssetBuildErrorResponse(route.file, error);
  }

  return new Response(options.dev === true ? withViteHmrRuntime(bundle) : bundle, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}

async function renderAppRouterClientRouteDevModule(
  appDir: string,
  pathname: string,
  options: { vitePlugins?: readonly PluginOption[] | undefined } = {},
): Promise<string> {
  const route = await clientRouteForRequestPath(appDir, pathname);

  if (route === undefined) {
    throw new Error(`MReact client route asset was not found: ${pathname}`);
  }

  const code = await readFile(route.file, "utf8");
  const clientSource = stripRouteClientOnlyExports(code, route.file);
  const references = await collectClientRouteReferences({
    appDir,
    code: clientSource,
    filename: route.file,
    vitePlugins: options.vitePlugins,
  });

  if (!references.client) {
    throw new Error(
      isClientRouteSource(clientSource)
        ? [
            "Client route analysis did not produce a client asset.",
            "Browser build cannot import Node builtins or other server-only modules.",
            ...references.diagnostics.map((diagnostic) => diagnostic.message),
          ].join("\n")
        : `MReact client route asset was not found: ${pathname}`,
    );
  }

  const entry = await buildClientRouteEntrySource({
    code: clientSource,
    clientBoundaryImports: references.clientBoundaryImports,
    clientReferenceImports: references.clientReferenceImports,
    clientReferenceManifest: references.clientReferenceManifest,
    filename: route.file,
    routePath: route.path,
    vitePlugins: options.vitePlugins,
  });

  return withViteHmrRuntime(entry.code);
}

async function clientRouteForRequestPath(appDir: string, pathname: string) {
  const routes = await scanAppRoutes({ appDir });

  return routes.find(
    (candidate) =>
      candidate.kind === "page" &&
      `/_mreact/client/${clientScriptForPath(candidate.path)}` === pathname,
  );
}

function clientRequestPath(id: string): string {
  const [path] = id.split(/[?#]/, 1);

  return path ?? id;
}

function clientRouteModuleId(filename: string, requestPath: string): string {
  return `${normalizePath(filename)}?${clientRouteModuleQuery}=${encodeURIComponent(requestPath)}`;
}

function clientRouteModuleRequestPath(id: string): string | undefined {
  const queryStart = id.indexOf("?");

  if (queryStart === -1) {
    return undefined;
  }

  const params = new URLSearchParams(id.slice(queryStart + 1));
  const value = params.get(clientRouteModuleQuery);

  return value === null ? undefined : value;
}

function isMreactClientDevModuleId(id: string | null | undefined): boolean {
  return (
    id?.startsWith(virtualClientPrefix) === true ||
    id?.includes(`?${clientRouteModuleQuery}=`) === true ||
    id?.includes(`&${clientRouteModuleQuery}=`) === true
  );
}

function isDevCssSourceModuleId(id: string): boolean {
  return new URLSearchParams(id.slice(id.indexOf("?") + 1)).has(devCssSourceQuery);
}

async function loadDevCssSourceModule(options: {
  cssFile: string;
  sourceDirs: readonly string[];
}): Promise<string | undefined> {
  const code = await readFile(options.cssFile, "utf8");

  return prependDevTailwindSourceDirectives({
    code,
    cssFile: options.cssFile,
    sourceDirs: options.sourceDirs,
  });
}

function prependDevTailwindSourceDirectives(options: {
  code: string;
  cssFile: string;
  sourceDirs: readonly string[];
}): string {
  if (!isTailwindCssEntry(options.code)) {
    return options.code;
  }

  const cssDir = dirname(options.cssFile);
  const directives = [...new Set(options.sourceDirs)]
    .map((sourceDir) => `${devTailwindSourceDirective(cssDir, sourceDir)}\n`)
    .join("");

  return directives.length === 0 ? options.code : `${directives}${options.code}`;
}

function isTailwindCssEntry(code: string): boolean {
  return (
    /@import\s+(?:url\()?["']tailwindcss(?:\/[^"']*)?["']\)?/u.test(code) ||
    /@tailwind\s+(?:base|components|utilities)\b/u.test(code)
  );
}

function devTailwindSourceDirective(cssDir: string, sourceDir: string): string {
  const relativeSourceDir = relative(cssDir, sourceDir).split(sep).join("/");
  const normalizedSourceDir =
    relativeSourceDir === ""
      ? "."
      : relativeSourceDir.startsWith(".")
        ? relativeSourceDir
        : `./${relativeSourceDir}`;

  return `@source ${JSON.stringify(`${normalizedSourceDir}/**/*.{js,jsx,ts,tsx,mdx}`)};`;
}

function importerInRuntimePackage(
  importer: string | undefined,
  directories: readonly string[],
  packageNames: readonly string[],
): boolean {
  if (importer === undefined) {
    return false;
  }

  const normalizedImporter = normalizePath(importer);
  return (
    directories.some((directory) => normalizedImporter.startsWith(`${directory}/`)) ||
    packageNames.some((packageName) => normalizedImporter.includes(`/node_modules/${packageName}/`))
  );
}

function clientAssetBuildErrorResponse(filename: string, error: unknown): Response {
  const message = [
    `Failed to build mreact client route asset for ${filename}.`,
    error instanceof Error ? error.message : String(error),
  ].join("\n");

  return new Response(`throw new Error(${JSON.stringify(message)});\n`, {
    status: 500,
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}

async function devRouteStyles(
  project: ResolvedAppRouterProject,
  routes: readonly AppRoute[],
  readSource: (file: string) => Promise<string | undefined>,
): Promise<ReadonlyMap<string, readonly string[]>> {
  const entries = await Promise.all(
    routes.map(async (route) => {
      if (route.kind !== "page") {
        return undefined;
      }

      const hrefs = await collectRouteCssHrefs({
        appDir: project.routesDir,
        hrefPrefix: devCssPrefix,
        pageFile: route.file,
        projectRoot: project.projectRoot,
        readSource,
      });

      return hrefs.length === 0 ? undefined : ([route.path, hrefs as readonly string[]] as const);
    }),
  );
  const routeStyles = entries.filter(
    (entry): entry is readonly [string, readonly string[]] => entry !== undefined,
  );

  return new Map<string, readonly string[]>(routeStyles);
}

async function devSpecialRouteStyles(
  project: ResolvedAppRouterProject,
  readSource: (file: string) => Promise<string | undefined>,
): Promise<ReadonlyMap<string, readonly string[]>> {
  const entries = await Promise.all(
    (await collectSpecialBoundaryFiles(project.routesDir)).map(async (file) => {
      const hrefs = await collectRouteCssHrefs({
        appDir: project.routesDir,
        hrefPrefix: devCssPrefix,
        pageFile: file,
        projectRoot: project.projectRoot,
        readSource,
      });

      return hrefs.length === 0 ? undefined : ([file, hrefs as readonly string[]] as const);
    }),
  );
  const routeStyles = entries.filter(
    (entry): entry is readonly [string, readonly string[]] => entry !== undefined,
  );

  return new Map<string, readonly string[]>(routeStyles);
}

async function devNavigationScripts(
  appDir: string,
  routes: readonly AppRoute[],
  readSource: (file: string) => Promise<string | undefined>,
  inferenceCache?: ClientRouteInferenceCache | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
): Promise<ReadonlyMap<string, string>> {
  const cache = inferenceCache ?? createClientRouteInferenceCache();
  const entries = await Promise.all(
    routes.map(async (route) => {
      if (route.kind !== "page") {
        return undefined;
      }

      const source = await readSource(route.file);
      if (source === undefined) {
        return undefined;
      }
      const navigation = await resolveNavigationRuntime({
        appDir,
        cache,
        code: source,
        filename: route.file,
        vitePlugins,
      });

      return navigation
        ? ([route.path, navigationRuntimeScriptForDev()] as const)
        : undefined;
    }),
  );

  return new Map(
    entries.filter((entry): entry is readonly [string, string] => entry !== undefined),
  );
}

function createDevCssProxyMiddleware(): Connect.NextHandleFunction {
  return (incoming, outgoing, next) => {
    const originalUrl = incoming.url ?? "/";
    const url = new URL(originalUrl, "http://mreact.local");

    if (!url.pathname.startsWith(devCssPrefix)) {
      next();
      return;
    }

    const sourcePath = `/${url.pathname.slice(devCssPrefix.length)}`;

    if (sourcePath === "/" || sourcePath.includes("\0")) {
      next();
      return;
    }

    const originalAccept = incoming.headers.accept;
    let restored = false;
    const restore = () => {
      if (restored) {
        return;
      }
      restored = true;
      incoming.url = originalUrl;
      if (originalAccept === undefined) {
        delete incoming.headers.accept;
      } else {
        incoming.headers.accept = originalAccept;
      }
    };

    const sourceSearch = new URLSearchParams(url.search);
    sourceSearch.set(devCssSourceQuery, "");
    incoming.url = `${sourcePath}?${sourceSearch.toString()}`;
    incoming.headers.accept = "text/css,*/*;q=0.1";
    outgoing.once("finish", restore);
    outgoing.once("close", restore);
    next();
  };
}

function withViteHmrRuntime(code: string): string {
  return `import "/@vite/client";
if (import.meta.hot?.data.__mreactRouteStates) {
  globalThis.__mreactRouteStates = import.meta.hot.data.__mreactRouteStates;
}
${code}
if (import.meta.hot) {
  const __mreactPreserveRouteState = () => {
    import.meta.hot.data.__mreactRouteStates = globalThis.__mreactRouteStates;
  };
  import.meta.hot.dispose(__mreactPreserveRouteState);
  import.meta.hot.accept((module) => {
    module?.__mreactHydrateRoute?.();
  });
}
`;
}
