import type { IncomingMessage, ServerResponse } from "node:http";
import type { DehydrateOptions } from "@reckona/mreact-query";
import type { AppRouterCache } from "../cache.js";
import { nodeRequestToWebRequest, sendResponse } from "../http.js";
import type { AppRouterServerActionOptions } from "../actions.js";
import type { AppRouterImportPolicy } from "../import-policy.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  nodeRequestPath,
  requestLogFields,
  type AppRouterLogger,
} from "../logger.js";
import type { AppRouterResponseHook } from "../render.js";
import type { RouterInstrumentation } from "../trace.js";
import { resolveNodeRequestProtocol } from "../node-server.js";

/** Re-exports cache contracts used by Node handlers. */
export type { AppRouterCache, AppRouterCacheEntry } from "../cache.js";
/** Re-exports server action contracts used by Node handlers. */
export type {
  AppRouterAllowedServerAction,
  AppRouterServerActionOptions,
} from "../actions.js";
/** Re-exports import policy contracts used by Node handlers. */
export type { AppRouterImportPolicy } from "../import-policy.js";
/** Re-exports logger contracts used by Node handlers. */
export type {
  AppRouterCspInlineNonceWarningLogEvent,
  AppRouterLogger,
  AppRouterLogError,
  AppRouterLogEvent,
  AppRouterRenderTimingLogEvent,
  AppRouterRequestEndLogEvent,
  AppRouterRequestErrorLogEvent,
  AppRouterRequestStartLogEvent,
  AppRouterRequestTimingLogEvent,
  AppRouterRuntime,
} from "../logger.js";
/** Re-exports response hook contracts used by Node handlers. */
export type { AppRouterResponseHook, AppRouterResponseHookContext } from "../render.js";
/** Re-exports build contracts referenced by Node handler options. */
export type { BuiltPrerenderedRoute } from "../build.js";
/** Re-exports router instrumentation hooks and events for Node handlers. */
export type {
  RouterInstrumentation,
  RouterMiddlewareEndInstrumentationEvent,
  RouterMiddlewareInstrumentationEvent,
  RouterRequestEndInstrumentationEvent,
  RouterRequestInstrumentationEvent,
  RouterRouteEndInstrumentationEvent,
  RouterRouteInstrumentationEvent,
  RouterTraceContext,
} from "../trace.js";
import {
  renderBuiltAppRequest,
  resolveRequestHost,
  warnIfImplicitHostTrust,
  type AppRouterPrerenderStore,
  type RequestHostPolicy,
  type ResponseSinkStrategy,
} from "../serve.js";

/** Re-exports request and rendering contracts used by Node handlers. */
export type {
  AppRouterPrerenderStore,
  RequestHostPolicy,
  ResponseSinkStrategy,
} from "../serve.js";

/**
 * Configures a Node request handler for built app-router output.
 */
export interface NodeRequestHandlerOptions {
  allowedHosts?: readonly string[] | undefined;
  dehydrateOptions?: DehydrateOptions | undefined;
  errorHandler?:
    | ((error: unknown) => {
        body: string;
        headers?: Record<string, string>;
        status: number;
      })
    | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  hostname?: string | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  logger?: AppRouterLogger | undefined;
  onResponse?: AppRouterResponseHook | undefined;
  outDir: string;
  port?: number | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy | undefined;
  /**
   * Trusts the first `X-Forwarded-Proto` value when the socket is not TLS.
   *
   * Defaults to `false`. Enable only behind a proxy that overwrites the header
   * and prevents untrusted clients from reaching the Node listener directly.
   */
  trustForwardedProto?: boolean | undefined;
}

/**
 * Handles one Node HTTP request/response pair for built app-router output.
 */
export type NodeRequestHandler = (
  incoming: IncomingMessage,
  outgoing: ServerResponse,
) => Promise<void>;

/**
 * Creates a Node `IncomingMessage`/`ServerResponse` handler for built app-router output.
 *
 * The handler converts Node requests to Web `Request` objects, enforces configured host trust, applies the built renderer, and writes the Web `Response` back to the Node socket.
 */
export function createNodeRequestHandler(options: NodeRequestHandlerOptions): NodeRequestHandler {
  warnIfImplicitHostTrust(options);

  return async (incoming, outgoing) => {
    const startedAt = logNow();
    const fallbackRequestFields = {
      method: incoming.method ?? "GET",
      path: nodeRequestPath(incoming.url),
      runtime: "node" as const,
    };

    try {
      const fallbackHost = `${options.hostname ?? "127.0.0.1"}:${options.port ?? 80}`;
      const host = resolveRequestHost({
        allowedHosts: options.allowedHosts,
        fallbackHost,
        hostPolicy: options.hostPolicy,
        rawHost: incoming.headers.host,
      });
      const protocol = resolveNodeRequestProtocol({
        encrypted: (incoming.socket as { encrypted?: boolean }).encrypted === true,
        forwardedProto: incoming.headers["x-forwarded-proto"],
        trustForwardedProto: options.trustForwardedProto,
      });
      const request = nodeRequestToWebRequest(incoming, `${protocol}://${host}`, outgoing);
      const logFields = requestLogFields(request, "node");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        type: "router:request:start",
      });
      const response = await renderBuiltAppRequest({
        dehydrateOptions: options.dehydrateOptions,
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        instrumentation: options.instrumentation,
        logger: options.logger,
        onResponse: options.onResponse,
        prerenderStore: options.prerenderStore,
        request,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      });
      emitRouterLog(options.logger, "info", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        status: response.status,
        type: "router:request:end",
      });

      await sendResponse(outgoing, response);
    } catch (error) {
      emitRouterLog(options.logger, "error", {
        ...fallbackRequestFields,
        durationMs: logDurationMs(startedAt),
        error: logError(error),
        type: "router:request:error",
      });
      const payload = options.errorHandler
        ? options.errorHandler(error)
        : { body: "Internal Server Error", status: 500 };
      outgoing.statusCode = payload.status;
      outgoing.setHeader(
        "content-type",
        payload.headers?.["content-type"] ?? "text/plain; charset=utf-8",
      );

      for (const [name, value] of Object.entries(payload.headers ?? {})) {
        if (name.toLowerCase() !== "content-type") {
          outgoing.setHeader(name, value);
        }
      }

      outgoing.end(payload.body);
    }
  };
}
