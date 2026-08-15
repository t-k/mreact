import { createServer, type Server } from "node:http";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  nodeRequestPath,
  requestLogFields,
  type AppRouterLogger,
} from "./logger.js";
import type { HttpUpgradeHandler } from "./upgrade.js";

export interface StartNodeRequestServerOptions {
  allowedHosts?: readonly string[] | undefined;
  errorHandler?: ((error: unknown) => {
    body: string;
    status: number;
    headers?: Record<string, string>;
  }) | undefined;
  hostname?: string | undefined;
  hostPolicy?: "strict" | "trusted-proxy" | undefined;
  logger?: AppRouterLogger | undefined;
  onUpgrade?: HttpUpgradeHandler | undefined;
  port: number;
  render(request: Request): Promise<Response>;
  resolveHost?: ((options: {
    allowedHosts?: readonly string[] | undefined;
    fallbackHost: string;
    hostPolicy?: "strict" | "trusted-proxy" | undefined;
    rawHost: string | undefined;
  }) => string) | undefined;
  trustForwardedProto?: boolean | undefined;
}

export function resolveNodeRequestProtocol(options: {
  encrypted: boolean;
  forwardedProto: string | readonly string[] | undefined;
  trustForwardedProto?: boolean | undefined;
}): "http" | "https" {
  if (options.encrypted) {
    return "https";
  }

  if (options.trustForwardedProto !== true) {
    return "http";
  }

  const forwarded = Array.isArray(options.forwardedProto)
    ? options.forwardedProto[0]
    : options.forwardedProto;
  const first = forwarded?.split(",", 1)[0]?.trim().toLowerCase();
  return first === "https" ? "https" : "http";
}

export async function startNodeRequestServer(
  options: StartNodeRequestServerOptions,
): Promise<{ close(): Promise<void>; server: Server; url: string }> {
  const server = createServer(async (incoming, outgoing) => {
    const startedAt = logNow();
    const fallbackRequestFields = {
      method: incoming.method ?? "GET",
      path: nodeRequestPath(incoming.url),
      runtime: "node" as const,
    };

    try {
      const fallbackHost = `${options.hostname ?? "127.0.0.1"}:${options.port}`;
      const host = (options.resolveHost ?? defaultResolveRequestHost)({
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
      const response = await options.render(request);
      emitRouterLog(options.logger, "info", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        status: response.status,
        type: "router:request:end",
      });

      await sendResponse(outgoing, response);
    } catch (error) {
      // Log the full stack to stderr for operator visibility; never put
      // it in the response body where attackers can scrape it.
      emitRouterLog(options.logger, "error", {
        ...fallbackRequestFields,
        durationMs: logDurationMs(startedAt),
        error: logError(error),
        type: "router:request:error",
      });
      if (options.logger === undefined) {
        console.error("[mreact] startServer request failed:", error);
      }
      const payload = options.errorHandler
        ? options.errorHandler(error)
        : { body: "Internal Server Error", status: 500 };
      outgoing.statusCode = payload.status;
      outgoing.setHeader(
        "content-type",
        payload.headers?.["content-type"] ?? "text/plain; charset=utf-8",
      );
      for (const [name, value] of Object.entries(payload.headers ?? {})) {
        if (name.toLowerCase() === "content-type") continue;
        outgoing.setHeader(name, value);
      }
      outgoing.end(payload.body);
    }
  });

  if (options.onUpgrade !== undefined) {
    server.on("upgrade", options.onUpgrade);
  }

  await new Promise<void>((resolve) =>
    server.listen(options.port, options.hostname ?? "127.0.0.1", resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    server,
    url: `http://${options.hostname ?? "127.0.0.1"}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function defaultResolveRequestHost(options: {
  allowedHosts?: readonly string[] | undefined;
  fallbackHost: string;
  hostPolicy?: "strict" | "trusted-proxy" | undefined;
  rawHost: string | undefined;
}): string {
  const raw = options.rawHost;
  if (raw === undefined || raw === "") return options.fallbackHost;
  if (options.allowedHosts === undefined) {
    return options.hostPolicy === "strict" ? options.fallbackHost : raw;
  }
  return options.allowedHosts.includes(raw) ? raw : options.fallbackHost;
}
