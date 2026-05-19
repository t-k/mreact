export interface RouterTraceContext {
  parentSpanId: string;
  sampled: boolean;
  traceId: string;
  traceparent: string;
  tracestate?: string;
}

export interface RouterRequestInstrumentationEvent {
  method: string;
  path: string;
  request: Request;
  trace?: RouterTraceContext;
}

export interface RouterRequestEndInstrumentationEvent
  extends RouterRequestInstrumentationEvent {
  status: number;
}

export interface RouterRouteInstrumentationEvent
  extends RouterRequestInstrumentationEvent {
  routeId: string;
  routePath: string;
}

export interface RouterRouteEndInstrumentationEvent
  extends RouterRouteInstrumentationEvent {
  error?: unknown;
}

export interface RouterMiddlewareInstrumentationEvent
  extends RouterRequestInstrumentationEvent {
  name: string;
}

export interface RouterMiddlewareEndInstrumentationEvent
  extends RouterMiddlewareInstrumentationEvent {
  error?: unknown;
}

export interface RouterInstrumentation {
  onLoaderEnd?: (event: RouterRouteEndInstrumentationEvent) => void | Promise<void>;
  onLoaderStart?: (event: RouterRouteInstrumentationEvent) => void | Promise<void>;
  onMiddlewareEnd?: (event: RouterMiddlewareEndInstrumentationEvent) => void | Promise<void>;
  onMiddlewareStart?: (event: RouterMiddlewareInstrumentationEvent) => void | Promise<void>;
  onRequestEnd?: (event: RouterRequestEndInstrumentationEvent) => void | Promise<void>;
  onRequestStart?: (event: RouterRequestInstrumentationEvent) => void | Promise<void>;
}

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
