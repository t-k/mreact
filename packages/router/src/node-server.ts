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
import {
  assertValidHttpUpgradeOriginPolicy,
  closeServerWithUpgrades,
  createManagedHttpUpgradeLifecycle,
  validateHttpUpgradeOrigin,
  type HttpUpgradeOriginPolicy,
  type HttpUpgradeOriginValidation,
  type ManagedHttpUpgradeHandler,
} from "./upgrade.js";

export interface StartNodeRequestServerOptions {
  allowedHosts?: readonly string[] | undefined;
  errorHandler?:
    | ((error: unknown) => {
        body: string;
        status: number;
        headers?: Record<string, string>;
      })
    | undefined;
  hostname?: string | undefined;
  hostPolicy?: "strict" | "trusted-proxy" | undefined;
  logger?: AppRouterLogger | undefined;
  onUpgrade?: ManagedHttpUpgradeHandler | undefined;
  port: number;
  render(request: Request): Promise<Response>;
  resolveHost?:
    | ((options: {
        allowedHosts?: readonly string[] | undefined;
        fallbackHost: string;
        hostPolicy?: "strict" | "trusted-proxy" | undefined;
        rawHost: string | undefined;
      }) => string)
    | undefined;
  trustForwardedProto?: boolean | undefined;
  upgradeCloseTimeoutMs?: number | undefined;
  upgradeDecisionTimeoutMs?: number | undefined;
  upgradeOriginPolicy?: HttpUpgradeOriginPolicy | undefined;
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
  const upgradeCloseTimeoutMs = finiteNonNegativeTimeout(
    options.upgradeCloseTimeoutMs,
    1_000,
    "upgradeCloseTimeoutMs",
  );
  const upgradeDecisionTimeoutMs = finiteNonNegativeTimeout(
    options.upgradeDecisionTimeoutMs,
    1_000,
    "upgradeDecisionTimeoutMs",
  );
  assertValidHttpUpgradeOriginPolicy(options.upgradeOriginPolicy);
  let listeningPort = options.port;
  const server = createServer(async (incoming, outgoing) => {
    const startedAt = logNow();
    const fallbackRequestFields = {
      method: incoming.method ?? "GET",
      path: nodeRequestPath(incoming.url),
      runtime: "node" as const,
    };

    try {
      const fallbackHost = formatNodeAuthority(options.hostname ?? "127.0.0.1", options.port);
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

  const upgradeLifecycle =
    options.onUpgrade === undefined
      ? undefined
      : createManagedHttpUpgradeLifecycle({
          decisionTimeoutMs: upgradeDecisionTimeoutMs,
          handler: options.onUpgrade,
          isOriginAllowed: (request) =>
            validateNodeUpgradeOrigin(request, {
              ...options,
              listeningPort,
            }),
          logger: options.logger,
        });
  if (upgradeLifecycle !== undefined) {
    server.on("upgrade", upgradeLifecycle.handle);
  }

  await new Promise<void>((resolve) =>
    server.listen(options.port, options.hostname ?? "127.0.0.1", resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  listeningPort = port;
  let closePromise: Promise<void> | undefined;

  return {
    server,
    url: `http://${formatNodeAuthority(options.hostname ?? "127.0.0.1", port)}`,
    close: () => {
      closePromise ??=
        upgradeLifecycle === undefined
          ? new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            )
          : closeServerWithUpgrades({
              lifecycle: upgradeLifecycle,
              server,
              timeoutMs: upgradeCloseTimeoutMs,
            });
      return closePromise;
    },
  };
}

function validateNodeUpgradeOrigin(
  request: import("node:http").IncomingMessage,
  options: StartNodeRequestServerOptions & { listeningPort: number },
): HttpUpgradeOriginValidation {
  const policy = options.upgradeOriginPolicy ?? "same-origin";
  if (policy === "unchecked") {
    return { ok: true, origin: request.headers.origin };
  }
  if (typeof policy === "object") {
    return validateHttpUpgradeOrigin(request, policy);
  }

  const fallbackHost = formatNodeAuthority(options.hostname ?? "127.0.0.1", options.listeningPort);
  const host = (options.resolveHost ?? defaultResolveRequestHost)({
    allowedHosts: options.allowedHosts,
    fallbackHost,
    hostPolicy: options.hostPolicy,
    rawHost: request.headers.host,
  });
  const protocol = resolveNodeRequestProtocol({
    encrypted: (request.socket as { encrypted?: boolean }).encrypted === true,
    forwardedProto: request.headers["x-forwarded-proto"],
    trustForwardedProto: options.trustForwardedProto,
  });
  try {
    return validateHttpUpgradeOrigin(request, { allowedOrigins: [`${protocol}://${host}`] });
  } catch {
    return { ok: false, reason: "malformed-origin" };
  }
}

function formatNodeAuthority(hostname: string, port: number): string {
  const host = hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
  return `${host}:${port}`;
}

function finiteNonNegativeTimeout(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const timeout = value ?? fallback;
  if (
    !Number.isFinite(timeout) ||
    timeout < 0 ||
    !Number.isSafeInteger(timeout) ||
    timeout > 2_147_483_647
  ) {
    throw new TypeError(
      `${name} must be a finite non-negative safe integer no greater than 2147483647.`,
    );
  }
  return timeout;
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
