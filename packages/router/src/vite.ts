import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { normalizePath, type Connect, type Plugin } from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterCache } from "./cache.js";
import {
  resolveAppRouterProjectOptions,
  type AppRouterProjectOptions,
  type ResolvedAppRouterProject,
} from "./config.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import {
  buildNavigationRuntimeBundle,
  buildClientRouteBundle,
  clientScriptForPath,
  collectClientRouteReferences,
  detectNavigationRuntimeHint,
  isClientRouteSource,
  navigationRuntimeScriptForDev,
} from "./client.js";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";
import { renderAppRequest } from "./render.js";
import { stripRouteClientOnlyExports } from "./route-source.js";
import { collectRouteCssHrefs } from "./route-styles.js";
import { scanAppRoutes } from "./routes.js";
import { resolveRequestHost, type RequestHostPolicy } from "./serve.js";

export interface AppRouterViteMiddlewareOptions extends AppRouterProjectOptions {
  allowedHosts?: readonly string[] | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

export interface AppRouterVitePluginOptions extends AppRouterProjectOptions {
  allowedHosts?: readonly string[] | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

const clientPrefix = "/_mreact/client/";
const devCssPrefix = "/_mreact/dev-css/";
const virtualClientPrefix = "\0mreact-router-client:";
const mreactRouterConfigKey = "__mreactRouterConfig";

type MreactRouterPlugin = Plugin & {
  [mreactRouterConfigKey]: ResolvedAppRouterProject;
};

export function createAppRouterVitePlugin(
  options: AppRouterVitePluginOptions,
): Plugin {
  const project = resolveAppRouterProjectOptions(options);
  const normalizedSourceDirs = project.allowedSourceDirs.map((directory) => normalizePath(directory));

  const plugin: MreactRouterPlugin = {
    [mreactRouterConfigKey]: project,
    name: "mreact-router",
    configureServer(server) {
      server.middlewares.use(createDevCssProxyMiddleware());

      return () => {
        server.middlewares.use(createAppRouterViteMiddleware(options));
      };
    },
    handleHotUpdate(context) {
      const normalizedFile = normalizePath(context.file);

      if (!normalizedSourceDirs.some((directory) => normalizedFile.startsWith(directory))) {
        return;
      }

      const timestamp = Date.now();
      const updates = Array.from(context.server.moduleGraph.idToModuleMap.values())
        .filter((moduleNode) => moduleNode.id?.startsWith(virtualClientPrefix) === true)
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
      if (!id.startsWith(virtualClientPrefix)) {
        return;
      }

      return renderAppRouterClientAsset(
        project.routesDir,
        id.slice(virtualClientPrefix.length),
        { dev: true },
      ).then(async (response) => {
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `MReact client route asset was not found: ${id}`);
        }

        return response.text();
      });
    },
    resolveId(id) {
      return id.startsWith(clientPrefix) ? `${virtualClientPrefix}${id}` : undefined;
    },
  };

  return plugin;
}

export const mreactRouter = createAppRouterVitePlugin;

export function mreactRouterConfigFromPlugins(
  plugins: readonly unknown[],
): ResolvedAppRouterProject | undefined {
  for (const plugin of plugins.flat(Infinity)) {
    if (
      plugin !== null &&
      typeof plugin === "object" &&
      mreactRouterConfigKey in plugin
    ) {
      return (plugin as MreactRouterPlugin)[mreactRouterConfigKey];
    }
  }

  return undefined;
}

export function createAppRouterViteMiddleware(
  options: AppRouterViteMiddlewareOptions,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    void handleAppRouterViteRequest(options, request, response, next);
  };
}

async function handleAppRouterViteRequest(
  options: AppRouterViteMiddlewareOptions,
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
      await sendResponse(
        outgoing,
        await renderAppRouterClientAsset(project.routesDir, url.pathname),
      );
      return;
    }

    const request = nodeRequestToWebRequest(incoming, origin);

    await sendResponse(
      outgoing,
      await renderAppRequest({
        appDir: project.routesDir,
        importPolicy: {
          ...options.importPolicy,
          allowedSourceDirs: project.allowedSourceDirs,
          projectRoot: project.projectRoot,
        },
        clientStyles: await devRouteStyles(project),
        navigationScripts: await devNavigationScripts(project.routesDir),
        request,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function renderAppRouterClientAsset(
  appDir: string,
  pathname: string,
  options: { dev?: boolean } = {},
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
  const clientSource = stripRouteClientOnlyExports(code);
  let references: Awaited<ReturnType<typeof collectClientRouteReferences>>;

  try {
    references = await collectClientRouteReferences({
      appDir,
      code: clientSource,
      filename: route.file,
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
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: route.file,
      routePath: route.path,
    });
  } catch (error) {
    return clientAssetBuildErrorResponse(route.file, error);
  }

  return new Response(options.dev === true ? withViteHmrRuntime(bundle) : bundle, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
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
): Promise<ReadonlyMap<string, readonly string[]>> {
  const entries = await Promise.all(
    (await scanAppRoutes({ appDir: project.routesDir })).map(async (route) => {
      if (route.kind !== "page") {
        return undefined;
      }

      const hrefs = await collectRouteCssHrefs({
        appDir: project.routesDir,
        hrefPrefix: devCssPrefix,
        pageFile: route.file,
        projectRoot: project.projectRoot,
      });

      return hrefs.length === 0 ? undefined : ([route.path, hrefs as readonly string[]] as const);
    }),
  );
  const routeStyles = entries.filter(
    (entry): entry is readonly [string, readonly string[]] => entry !== undefined,
  );

  return new Map<string, readonly string[]>(routeStyles);
}

async function devNavigationScripts(appDir: string): Promise<ReadonlyMap<string, string>> {
  const entries = await Promise.all(
    (await scanAppRoutes({ appDir })).map(async (route) => {
      if (route.kind !== "page") {
        return undefined;
      }

      const source = await readFile(route.file, "utf8");

      return detectNavigationRuntimeHint(source)
        ? ([route.path, navigationRuntimeScriptForDev()] as const)
        : undefined;
    }),
  );

  return new Map(entries.filter((entry): entry is readonly [string, string] => entry !== undefined));
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

    incoming.url = `${sourcePath}${url.search}`;
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
