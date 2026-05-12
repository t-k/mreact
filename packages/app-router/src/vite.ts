import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import type { Connect } from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterCache } from "./cache.js";
import {
  buildClientRouteBundle,
  clientScriptForPath,
  isClientRouteSource,
} from "./client.js";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";
import { renderAppRequest } from "./render.js";
import { scanAppRoutes } from "./routes.js";

export interface AppRouterViteMiddlewareOptions {
  appDir: string;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
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
    const origin = `http://${incoming.headers.host ?? "localhost"}`;
    const url = new URL(incoming.url ?? "/", origin);

    if (url.pathname.startsWith("/_mreact/client/")) {
      await sendResponse(
        outgoing,
        await renderClientAsset(options.appDir, url.pathname),
      );
      return;
    }

    const request = nodeRequestToWebRequest(incoming, origin);

    await sendResponse(
      outgoing,
      await renderAppRequest({
        appDir: options.appDir,
        request,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function renderClientAsset(
  appDir: string,
  pathname: string,
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

  return new Response(bundle, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}
