import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  nodeRequestPath,
  type AppRouterLogger,
} from "./logger.js";

export type HttpUpgradeDisposition = "declined" | "handled";

/**
 * Explicitly claims or declines one HTTP upgrade before asynchronous verification begins.
 */
export interface HttpUpgradeContext {
  accept(): HttpUpgradeDisposition;
  decline(): HttpUpgradeDisposition;
}

/** Handles an HTTP upgrade using the legacy three-argument callback contract. */
export type HttpUpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

/**
 * Handles a managed HTTP upgrade on the app-router Node server.
 *
 * Existing `HttpUpgradeHandler` callbacks remain assignable. Handlers that defer verification must
 * call `context.accept()` synchronously; returning without writing a handshake is treated as a
 * decline.
 */
export type ManagedHttpUpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  context: HttpUpgradeContext,
) => void;

export type HttpUpgradeOriginFailureReason =
  | "disallowed-origin"
  | "malformed-origin"
  | "missing-origin"
  | "opaque-origin";

export type HttpUpgradeOriginValidation =
  | { ok: true; origin: string | undefined }
  | { ok: false; reason: HttpUpgradeOriginFailureReason };

export interface ValidateHttpUpgradeOriginOptions {
  allowedOrigins: readonly string[];
  allowMissingOrigin?: boolean | undefined;
}

export type HttpUpgradeOriginPolicy =
  | "same-origin"
  | "unchecked"
  | {
      allowedOrigins: readonly string[];
      allowMissingOrigin?: boolean | undefined;
    };

export function assertValidHttpUpgradeOriginPolicy(
  policy: HttpUpgradeOriginPolicy | undefined,
): void {
  if (typeof policy === "object") {
    for (const origin of policy.allowedOrigins) {
      normalizeConfiguredOrigin(origin);
    }
  }
}

/**
 * Validates a WebSocket/HTTP upgrade Origin against exact serialized origins.
 *
 * Missing origins are rejected by default. Configured origins must contain only an HTTP(S)
 * scheme, host, and optional port; paths, credentials, queries, and fragments are invalid.
 */
export function validateHttpUpgradeOrigin(
  request: IncomingMessage,
  options: ValidateHttpUpgradeOriginOptions,
): HttpUpgradeOriginValidation {
  const allowedOrigins = options.allowedOrigins.map(normalizeConfiguredOrigin);
  const value = request.headers.origin;

  if (value === undefined) {
    return options.allowMissingOrigin === true
      ? { ok: true, origin: undefined }
      : { ok: false, reason: "missing-origin" };
  }
  if (Array.isArray(value) || value.includes(",")) {
    return { ok: false, reason: "malformed-origin" };
  }
  if (value === "null") {
    return { ok: false, reason: "opaque-origin" };
  }

  const origin = normalizeRequestOrigin(value);
  if (origin === undefined) {
    return { ok: false, reason: "malformed-origin" };
  }

  return allowedOrigins.includes(origin)
    ? { ok: true, origin }
    : { ok: false, reason: "disallowed-origin" };
}

function normalizeConfiguredOrigin(value: string): string {
  const origin = normalizeOrigin(value);
  if (origin === undefined) {
    throw new TypeError(`Invalid HTTP upgrade allowed origin: ${value}`);
  }
  return origin;
}

function normalizeRequestOrigin(value: string): string | undefined {
  return normalizeOrigin(value);
}

function normalizeOrigin(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin === "null"
  ) {
    return undefined;
  }

  return url.origin;
}

export interface ManagedHttpUpgradeOptions {
  decisionTimeoutMs: number;
  handler: ManagedHttpUpgradeHandler;
  isOriginAllowed(request: IncomingMessage): HttpUpgradeOriginValidation;
  logger?: AppRouterLogger | undefined;
  shouldBypass?: ((request: IncomingMessage) => boolean) | undefined;
}

export interface ManagedHttpUpgradeLifecycle {
  beginClose(): void;
  handle(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  waitForSockets(timeoutMs: number): Promise<void>;
}

export function createManagedHttpUpgradeLifecycle(
  options: ManagedHttpUpgradeOptions,
): ManagedHttpUpgradeLifecycle {
  const sockets = new Set<Duplex>();
  const emptyWaiters = new Set<() => void>();
  const pendingDecisionCancels = new Set<() => void>();
  let closing = false;

  function track(socket: Duplex): void {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
      if (sockets.size === 0) {
        for (const resolve of emptyWaiters) {
          resolve();
        }
        emptyWaiters.clear();
      }
    });
  }

  function destroy(socket: Duplex): void {
    if (!socket.destroyed) {
      socket.destroy();
    }
  }

  function emitError(request: IncomingMessage, startedAt: number, error: unknown): void {
    emitRouterLog(options.logger, "error", {
      durationMs: logDurationMs(startedAt),
      error: logError(error),
      method: request.method ?? "GET",
      path: nodeRequestPath(request.url),
      runtime: "node",
      type: "router:upgrade:error",
    });
    if (options.logger === undefined) {
      try {
        console.error("[mreact] HTTP upgrade handler failed:", error);
      } catch {
        // Failure reporting must never escape the HTTP upgrade listener.
      }
    }
  }

  function handle(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const startedAt = logNow();
    if (closing) {
      destroy(socket);
      return;
    }
    let bypass = false;
    try {
      bypass = options.shouldBypass?.(request) === true;
    } catch (error) {
      emitError(request, startedAt, error);
      destroy(socket);
      return;
    }
    if (bypass) {
      return;
    }

    track(socket);

    let origin: HttpUpgradeOriginValidation;
    try {
      origin = options.isOriginAllowed(request);
    } catch (error) {
      emitError(request, startedAt, error);
      destroy(socket);
      return;
    }
    if (!origin.ok) {
      emitRouterLog(options.logger, "warn", {
        method: request.method ?? "GET",
        path: nodeRequestPath(request.url),
        reason: origin.reason,
        runtime: "node",
        type: "router:upgrade:rejected",
      });
      destroy(socket);
      return;
    }

    let disposition: HttpUpgradeDisposition | undefined;
    let decisionTimer: ReturnType<typeof setTimeout> | undefined;
    let failureReported = false;
    let socketClosed = false;
    const clearDecisionTimer = (): void => {
      if (decisionTimer !== undefined) {
        clearTimeout(decisionTimer);
        decisionTimer = undefined;
      }
      pendingDecisionCancels.delete(clearDecisionTimer);
    };
    socket.once("close", () => {
      socketClosed = true;
      clearDecisionTimer();
    });
    const before = {
      bytesWritten: socketBytesWritten(socket),
      destroyed: socket.destroyed,
      writableEnded: socket.writableEnded,
    };

    const decide = (next: HttpUpgradeDisposition): HttpUpgradeDisposition => {
      if (disposition !== undefined) {
        return disposition;
      }
      disposition = next;
      clearDecisionTimer();
      if (next === "declined") {
        destroy(socket);
      }
      return next;
    };
    const context: HttpUpgradeContext = {
      accept: () => decide("handled"),
      decline: () => decide("declined"),
    };

    const fail = (error: unknown): void => {
      if (failureReported) {
        return;
      }
      failureReported = true;
      clearDecisionTimer();
      emitError(request, startedAt, error);
      disposition ??= "declined";
      destroy(socket);
    };

    let result: unknown;
    try {
      result = (
        options.handler as (
          request: IncomingMessage,
          socket: Duplex,
          head: Buffer,
          context: HttpUpgradeContext,
        ) => unknown
      )(request, socket, head, context);
    } catch (error) {
      fail(error);
      return;
    }

    if ((typeof result === "object" || typeof result === "function") && result !== null) {
      if (disposition === undefined && !closing && !socketClosed) {
        decisionTimer = setTimeout(() => {
          if (disposition === undefined) {
            fail(
              new Error(`HTTP upgrade decision timed out after ${options.decisionTimeoutMs}ms.`),
            );
          }
        }, options.decisionTimeoutMs);
        decisionTimer.unref?.();
        pendingDecisionCancels.add(clearDecisionTimer);
      }

      void Promise.resolve(result as PromiseLike<HttpUpgradeDisposition | void>).then(
        (value) => {
          if (socketClosed) {
            return;
          }
          if (value === "declined" || value === "handled") {
            decide(value);
          } else if (disposition === undefined) {
            decide(legacySocketAction(socket, before) ? "handled" : "declined");
          }
        },
        (error) => {
          fail(error);
        },
      );
      return;
    }

    if (result === "declined" || result === "handled") {
      decide(result);
    } else if (disposition === undefined) {
      decide(legacySocketAction(socket, before) ? "handled" : "declined");
    }
  }

  return {
    beginClose() {
      if (closing) {
        return;
      }
      closing = true;
      for (const cancel of pendingDecisionCancels) {
        cancel();
      }
    },
    handle,
    async waitForSockets(timeoutMs) {
      if (sockets.size === 0) {
        return;
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          emptyWaiters.delete(finish);
          resolve();
        };
        const timer = setTimeout(() => {
          for (const socket of sockets) {
            destroy(socket);
          }
          finish();
        }, timeoutMs);
        timer.unref?.();
        emptyWaiters.add(finish);
      });
    },
  };
}

export function closeServerWithUpgrades(options: {
  lifecycle: ManagedHttpUpgradeLifecycle;
  server: Server;
  timeoutMs: number;
}): Promise<void> {
  options.lifecycle.beginClose();
  const serverClosed = new Promise<void>((resolve, reject) => {
    options.server.close((error) => (error ? reject(error) : resolve()));
  });

  return Promise.all([serverClosed, options.lifecycle.waitForSockets(options.timeoutMs)]).then(
    () => undefined,
  );
}

function legacySocketAction(
  socket: Duplex,
  before: { bytesWritten: number | undefined; destroyed: boolean; writableEnded: boolean },
): boolean {
  return (
    socketBytesWritten(socket) !== before.bytesWritten ||
    socket.destroyed !== before.destroyed ||
    socket.writableEnded !== before.writableEnded
  );
}

function socketBytesWritten(socket: Duplex): number | undefined {
  return (socket as Duplex & { bytesWritten?: number }).bytesWritten;
}
