import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppRouterCache } from "../cache.js";
import { nodeRequestToWebRequest, sendResponse } from "../http.js";
import type { AppRouterServerActionOptions } from "../actions.js";
import type { AppRouterImportPolicy } from "../import-policy.js";
import {
  renderBuiltAppRequest,
  resolveRequestHost,
  type AppRouterPrerenderStore,
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
  hostname?: string | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
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
  return async (incoming, outgoing) => {
    try {
      const fallbackHost = `${options.hostname ?? "127.0.0.1"}:${options.port ?? 80}`;
      const host = resolveRequestHost({
        allowedHosts: options.allowedHosts,
        fallbackHost,
        rawHost: incoming.headers.host,
      });
      const request = nodeRequestToWebRequest(incoming, `http://${host}`);
      const response = await renderBuiltAppRequest({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        prerenderStore: options.prerenderStore,
        request,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      });

      await sendResponse(outgoing, response);
    } catch (error) {
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
