import { emitRouterDevtoolsEvent } from "./devtools.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  requestLogFields,
  type AppRouterLogger,
} from "../logger.js";

export type EdgeRequestHandler = (request: Request) => Response | Promise<Response>;

export interface EdgeRequestHandlerOptions {
  logger?: AppRouterLogger | undefined;
  onError?: ((error: unknown, request: Request) => Response | Promise<Response>) | undefined;
  render: EdgeRequestHandler;
}

/**
 * Wraps a Web `Request` renderer with edge-runtime logging and error handling.
 *
 * Use this for environments that already provide standard `Request` and `Response` objects and do not need Node or Cloudflare-specific adapters.
 */
export function createEdgeRequestHandler(options: EdgeRequestHandlerOptions): EdgeRequestHandler {
  return async (request) => {
    const startedAt = logNow();
    const logFields = requestLogFields(request, "edge");
    emitRouterLog(options.logger, "info", {
      ...logFields,
      type: "router:request:start",
    });
    emitRouterDevtoolsEvent({
      method: request.method,
      type: "router:request:start",
      url: request.url,
    });

    try {
      const response = await options.render(request);
      emitRouterDevtoolsEvent({
        method: request.method,
        status: response.status,
        type: "router:request:end",
        url: request.url,
      });
      emitRouterLog(options.logger, "info", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        status: response.status,
        type: "router:request:end",
      });

      return response;
    } catch (error) {
      emitRouterDevtoolsEvent({
        method: request.method,
        type: "router:request:error",
        url: request.url,
      });
      emitRouterLog(options.logger, "error", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        error: logError(error),
        type: "router:request:error",
      });

      return options.onError === undefined
        ? new Response("Internal Server Error", {
            headers: { "content-type": "text/plain; charset=utf-8" },
            status: 500,
          })
        : await options.onError(error, request);
    }
  };
}
