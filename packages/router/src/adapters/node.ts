import type { IncomingMessage, ServerResponse } from "node:http";
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
import {
  renderBuiltAppRequest,
  resolveRequestHost,
  warnIfImplicitHostTrust,
  type AppRouterPrerenderStore,
  type RequestHostPolicy,
  type ResponseSinkStrategy,
} from "../serve.js";

export interface NodeRequestHandlerOptions {
  allowedHosts?: readonly string[] | undefined;
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
  logger?: AppRouterLogger | undefined;
  onResponse?: AppRouterResponseHook | undefined;
  outDir: string;
  port?: number | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy | undefined;
}

export type NodeRequestHandler = (
  incoming: IncomingMessage,
  outgoing: ServerResponse,
) => Promise<void>;

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
      const request = nodeRequestToWebRequest(incoming, `http://${host}`);
      const logFields = requestLogFields(request, "node");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        type: "router:request:start",
      });
      const response = await renderBuiltAppRequest({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
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
