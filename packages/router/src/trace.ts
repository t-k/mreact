/**
 * Represents parsed W3C trace context headers for router instrumentation.
 */
export interface RouterTraceContext {
  parentSpanId: string;
  sampled: boolean;
  traceId: string;
  traceparent: string;
  tracestate?: string;
}

/**
 * Describes a router request lifecycle instrumentation event.
 */
export interface RouterRequestInstrumentationEvent {
  method: string;
  path: string;
  request: Request;
  trace?: RouterTraceContext;
}

/**
 * Describes completion of a router request lifecycle event.
 */
export interface RouterRequestEndInstrumentationEvent
  extends RouterRequestInstrumentationEvent {
  status: number;
}

/**
 * Describes a route-level loader or render instrumentation event.
 */
export interface RouterRouteInstrumentationEvent
  extends RouterRequestInstrumentationEvent {
  routeId: string;
  routePath: string;
}

/**
 * Describes completion of a route-level instrumentation event.
 */
export interface RouterRouteEndInstrumentationEvent
  extends RouterRouteInstrumentationEvent {
  error?: unknown;
}

/**
 * Describes a middleware instrumentation event.
 */
export interface RouterMiddlewareInstrumentationEvent
  extends RouterRequestInstrumentationEvent {
  name: string;
}

/**
 * Describes completion of a middleware instrumentation event.
 */
export interface RouterMiddlewareEndInstrumentationEvent
  extends RouterMiddlewareInstrumentationEvent {
  error?: unknown;
}

/**
 * Registers optional hooks for app-router request, middleware, and route instrumentation.
 */
export interface RouterInstrumentation {
  onLoaderEnd?: (event: RouterRouteEndInstrumentationEvent) => void | Promise<void>;
  onLoaderStart?: (event: RouterRouteInstrumentationEvent) => void | Promise<void>;
  onMiddlewareEnd?: (event: RouterMiddlewareEndInstrumentationEvent) => void | Promise<void>;
  onMiddlewareStart?: (event: RouterMiddlewareInstrumentationEvent) => void | Promise<void>;
  onRequestEnd?: (event: RouterRequestEndInstrumentationEvent) => void | Promise<void>;
  onRequestStart?: (event: RouterRequestInstrumentationEvent) => void | Promise<void>;
}

/**
 * Parses W3C trace context header values for router instrumentation.
 */
export function parseTraceContext(
  traceparent: string | null | undefined,
  tracestate: string | null | undefined,
): RouterTraceContext | undefined {
  if (traceparent === null || traceparent === undefined) {
    return undefined;
  }

  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(
    traceparent,
  );

  if (match === null) {
    return undefined;
  }

  const traceId = match[2]?.toLowerCase() ?? "";
  const parentSpanId = match[3]?.toLowerCase() ?? "";
  const flags = Number.parseInt(match[4] ?? "00", 16);

  if (/^0+$/.test(traceId) || /^0+$/.test(parentSpanId)) {
    return undefined;
  }

  return {
    parentSpanId,
    sampled: (flags & 1) === 1,
    traceId,
    traceparent: traceparent.toLowerCase(),
    ...(tracestate === null || tracestate === undefined ? {} : { tracestate }),
  };
}

/**
 * Reads trace context headers from a request.
 */
export function traceContextFromRequest(request: Request): RouterTraceContext | undefined {
  return parseTraceContext(request.headers.get("traceparent"), request.headers.get("tracestate"));
}

export function invokeRouterInstrumentation<Event>(
  callback: ((event: Event) => void | Promise<void>) | undefined,
  event: Event,
): void {
  if (callback === undefined) {
    return;
  }

  try {
    const result = callback(event);

    if (isPromiseLike(result)) {
      result.catch(() => {});
    }
  } catch {
    // Instrumentation is best-effort and must never affect request handling.
  }
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    "catch" in value &&
    typeof value.catch === "function"
  );
}
