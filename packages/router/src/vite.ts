import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { normalizePath, type Connect, type Plugin } from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterCache } from "./cache.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import {
  buildClientRouteBundle,
  clientScriptForPath,
  isClientRouteSource,
} from "./client.js";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";
import { renderAppRequest } from "./render.js";
import { scanAppRoutes } from "./routes.js";
import { resolveRequestHost } from "./serve.js";

export interface AppRouterViteMiddlewareOptions {
  appDir: string;
  allowedHosts?: readonly string[] | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

export interface AppRouterVitePluginOptions {
  appDir: string;
  allowedHosts?: readonly string[] | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

const clientPrefix = "/_mreact/client/";
const virtualClientPrefix = "\0mreact-router-client:";

export function createAppRouterVitePlugin(
  options: AppRouterVitePluginOptions,
): Plugin {
  const normalizedAppDir = normalizePath(options.appDir);

  return {
    name: "mreact-router",
    configureServer(server) {
      return () => {
        server.middlewares.use(createAppRouterViteMiddleware(options));
      };
    },
    handleHotUpdate(context) {
      if (!normalizePath(context.file).startsWith(normalizedAppDir)) {
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
        options.appDir,
        id.slice(virtualClientPrefix.length),
        { dev: true },
      ).then(async (response) => {
        if (!response.ok) {
          throw new Error(`MReact client route asset was not found: ${id}`);
        }

        return response.text();
      });
    },
    resolveId(id) {
      return id.startsWith(clientPrefix) ? `${virtualClientPrefix}${id}` : undefined;
    },
  };
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
    const host = resolveRequestHost({
      allowedHosts: options.allowedHosts,
      fallbackHost: "localhost",
      rawHost: incoming.headers.host,
    });
    const origin = `http://${host}`;
    const url = new URL(incoming.url ?? "/", origin);

    if (url.pathname.startsWith(clientPrefix)) {
      await sendResponse(
        outgoing,
        await renderAppRouterClientAsset(options.appDir, url.pathname),
      );
      return;
    }

    const request = nodeRequestToWebRequest(incoming, origin);

    await sendResponse(
      outgoing,
      await renderAppRequest({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
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

  if (!isClientRouteSource(code)) {
    return new Response("Not Found", { status: 404 });
  }

  const bundle = await buildClientRouteBundle({
    code,
    filename: route.file,
    routePath: route.path,
  });

  return new Response(options.dev === true ? withViteHmrRuntime(bundle) : bundle, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
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
