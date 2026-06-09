/**
 * Names the severity channel used for app-router structured logs.
 */
export type AppRouterLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Names the runtime that handled an app-router request.
 */
export type AppRouterRuntime = "aws-lambda" | "cloudflare" | "edge" | "node";

/**
 * Receives structured app-router log events by severity.
 */
export interface AppRouterLogger {
  debug?: ((event: AppRouterLogEvent) => void | Promise<void>) | undefined;
  error?: ((event: AppRouterLogEvent) => void | Promise<void>) | undefined;
  info?: ((event: AppRouterLogEvent) => void | Promise<void>) | undefined;
  warn?: ((event: AppRouterLogEvent) => void | Promise<void>) | undefined;
}

/**
 * Represents every structured log event emitted by the app router.
 */
export type AppRouterLogEvent =
  | AppRouterRequestStartLogEvent
  | AppRouterRequestEndLogEvent
  | AppRouterRequestErrorLogEvent
  | AppRouterRequestTimingLogEvent
  | AppRouterRenderTimingLogEvent
  | AppRouterCspInlineNonceWarningLogEvent;

/**
 * Logs the start of an app-router request.
 */
export interface AppRouterRequestStartLogEvent {
  method: string;
  path: string;
  runtime: AppRouterRuntime;
  type: "router:request:start";
}

/**
 * Logs the successful completion of an app-router request.
 */
export interface AppRouterRequestEndLogEvent {
  durationMs: number;
  method: string;
  path: string;
  runtime: AppRouterRuntime;
  status: number;
  type: "router:request:end";
}

/**
 * Logs a request that ended with an app-router error response.
 */
export interface AppRouterRequestErrorLogEvent {
  durationMs: number;
  error: AppRouterLogError;
  method: string;
  path: string;
  runtime: AppRouterRuntime;
  type: "router:request:error";
}

/**
 * Logs per-phase timings for a complete app-router request.
 */
export interface AppRouterRequestTimingLogEvent {
  durationMs: number;
  method: string;
  path: string;
  phases: Record<string, number>;
  runtime: AppRouterRuntime;
  status: number;
  type: "router:request:timing";
}

/**
 * Logs per-phase timings for route rendering.
 */
export interface AppRouterRenderTimingLogEvent {
  method: string;
  path: string;
  phases: Record<string, number>;
  status: number;
  type: "router:render:timing";
}

/**
 * Logs an inline CSP nonce warning emitted while rendering a route.
 */
export interface AppRouterCspInlineNonceWarningLogEvent {
  directive: "script-src" | "style-src";
  path: string;
  tag: "script" | "style";
  type: "router:csp:inline-nonce-warning";
}

/**
 * Serializes an error for app-router structured logs.
 */
export interface AppRouterLogError {
  message: string;
  name: string;
}

export interface RouterRequestLogFields {
  method: string;
  path: string;
  runtime: AppRouterRuntime;
}

export function emitRouterLog(
  logger: AppRouterLogger | undefined,
  level: AppRouterLogLevel,
  event: AppRouterLogEvent,
): void {
  const sink = logger?.[level];

  if (sink === undefined) {
    return;
  }

  queueMicrotask(() => {
    try {
      const result = sink(event);

      if (isPromiseLike(result)) {
        result.catch(() => {});
      }
    } catch {
      // Logger sinks are best-effort and must never affect request handling.
    }
  });
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    "catch" in value &&
    typeof value.catch === "function"
  );
}

export function requestLogFields(
  request: Request,
  runtime: AppRouterRuntime,
): RouterRequestLogFields {
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    runtime,
  };
}

export function nodeRequestPath(url: string | undefined): string {
  if (url === undefined || url === "") {
    return "/";
  }

  try {
    return new URL(url, "http://mreact.local").pathname;
  } catch {
    return "/";
  }
}

export function logNow(): number {
  return performance.now();
}

export function logDurationMs(startedAt: number): number {
  return Math.max(0, Math.round((logNow() - startedAt) * 1000) / 1000);
}

export function logError(error: unknown): AppRouterLogError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: "Error",
  };
}
