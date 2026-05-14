import type { BuiltPrerenderedRoute, BuiltServerManifest } from "../build.js";
import type { ClientRouteManifestEntry } from "../client.js";

export interface CloudflareExecutionContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

export interface CloudflareAssetLoader<Env = unknown> {
  fetch?:
    | ((
        pathname: string,
        request: Request,
        env: Env,
        context: CloudflareExecutionContext,
      ) => Response | Promise<Response | undefined> | undefined)
    | undefined;
}

export interface CloudflareRenderContext<Env = unknown> {
  clientManifest: CloudflareClientManifest;
  context: CloudflareExecutionContext;
  env: Env;
  serverManifest: BuiltServerManifest;
}

export interface CloudflareRequestHandlerOptions<Env = unknown> {
  assets?: CloudflareAssetLoader<Env> | undefined;
  clientManifest: CloudflareClientManifest;
  onError?:
    | ((
        error: unknown,
        request: Request,
        env: Env,
        context: CloudflareExecutionContext,
      ) => Response | Promise<Response>)
    | undefined;
  render?:
    | ((request: Request, context: CloudflareRenderContext<Env>) => Response | Promise<Response>)
    | undefined;
  serverManifest: BuiltServerManifest;
}

export interface CloudflareRequestHandler<Env = unknown> {
  fetch(request: Request, env: Env, context: CloudflareExecutionContext): Promise<Response>;
}

export interface CloudflareClientManifest {
  routes: ClientRouteManifestEntry[];
}

const clientPrefix = "/_mreact/client/";

export function createCloudflareRequestHandler<Env = unknown>(
  options: CloudflareRequestHandlerOptions<Env>,
): CloudflareRequestHandler<Env> {
  return {
    async fetch(request, env, context) {
      try {
        return await handleCloudflareRequest(options, request, env, context);
      } catch (error) {
        emitRouterDevtoolsEvent({
          method: request.method,
          type: "router:request:error",
          url: request.url,
        });

        return options.onError === undefined
          ? new Response("Internal Server Error", {
              headers: { "content-type": "text/plain; charset=utf-8" },
              status: 500,
            })
          : await options.onError(error, request, env, context);
      }
    },
  };
}

async function handleCloudflareRequest<Env>(
  options: CloudflareRequestHandlerOptions<Env>,
  request: Request,
  env: Env,
  context: CloudflareExecutionContext,
): Promise<Response> {
  emitRouterDevtoolsEvent({
    method: request.method,
    type: "router:request:start",
    url: request.url,
  });

  const url = new URL(request.url);

  if (url.pathname.startsWith(clientPrefix)) {
    const response = await options.assets?.fetch?.(url.pathname, request, env, context);
    return response ?? new Response("Not Found", { status: 404 });
  }

  const staticResponse = prerenderedResponse(
    options.serverManifest.prerenderedRoutes,
    normalizeRoutePath(url.pathname),
    request.method,
  );

  if (staticResponse !== undefined) {
    emitRouterDevtoolsEvent({
      method: request.method,
      status: staticResponse.status,
      type: "router:request:end",
      url: request.url,
    });
    return staticResponse;
  }

  if (options.render === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  const response = await options.render(request, {
    clientManifest: options.clientManifest,
    context,
    env,
    serverManifest: options.serverManifest,
  });
  emitRouterDevtoolsEvent({
    method: request.method,
    status: response.status,
    type: "router:request:end",
    url: request.url,
  });

  return response;
}

function prerenderedResponse(
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute> | undefined,
  path: string,
  method: string,
): Response | undefined {
  if (method !== "GET" && method !== "HEAD") {
    return undefined;
  }

  const prerendered = prerenderedRoutes?.[path];

  if (prerendered === undefined) {
    return undefined;
  }

  return new Response(method === "HEAD" ? null : prerendered.html, {
    headers: prerendered.headers,
    status: prerendered.status,
  });
}

function normalizeRoutePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function emitRouterDevtoolsEvent(event: Record<string, unknown>): void {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: (event: Record<string, unknown>) => void };
    }
  ).__mreactDevtools;

  devtools?.emit?.({
    package: "@modular-react/router",
    timestamp: Date.now(),
    ...event,
  });
}
