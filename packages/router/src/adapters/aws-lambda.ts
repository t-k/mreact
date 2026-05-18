import { Buffer } from "node:buffer";
import type { AppRouterServerActionOptions } from "../actions.js";
import type { AppRouterCache } from "../cache.js";
import type { AppRouterImportPolicy } from "../import-policy.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
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

export interface AwsLambdaHttpEventV2 {
  body?: string | undefined;
  cookies?: string[] | undefined;
  headers?: Record<string, string | undefined> | undefined;
  isBase64Encoded?: boolean | undefined;
  rawPath?: string | undefined;
  rawQueryString?: string | undefined;
  requestContext?: {
    http?: {
      method?: string | undefined;
    } | undefined;
  } | undefined;
  version?: "2.0" | string | undefined;
}

export interface AwsLambdaHttpResultV2 {
  body: string;
  cookies?: string[] | undefined;
  headers?: Record<string, string> | undefined;
  isBase64Encoded: boolean;
  statusCode: number;
}

export interface AwsLambdaStreamingResponseMetadata {
  cookies?: string[] | undefined;
  headers: Record<string, string>;
  statusCode: number;
}

export interface AwsLambdaStreamingResponseStream {
  destroy?: ((error?: unknown) => void) | undefined;
  end(): void;
  once?: ((event: "drain", listener: () => void) => unknown) | undefined;
  write(chunk: string | Uint8Array): boolean;
}

export interface AwsLambdaRequestHandlerOptions {
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
  prerenderStore?: AppRouterPrerenderStore | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy | undefined;
}

export type AwsLambdaRequestHandler = (
  event: AwsLambdaHttpEventV2,
) => Promise<AwsLambdaHttpResultV2>;

export type AwsLambdaStreamingRequestHandler<TContext = unknown> = (
  event: AwsLambdaHttpEventV2,
  responseStream: AwsLambdaStreamingResponseStream,
  context: TContext,
) => Promise<void>;

export function createAwsLambdaRequestHandler(
  options: AwsLambdaRequestHandlerOptions,
): AwsLambdaRequestHandler {
  warnIfImplicitHostTrust(options);

  return async (event) => {
    const startedAt = logNow();
    const request = eventToRequest(event, options);
    const logFields = requestLogFields(request, "aws-lambda");
    emitRouterLog(options.logger, "info", {
      ...logFields,
      type: "router:request:start",
    });

    try {
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

      return responseToLambdaResult(response);
    } catch (error) {
      emitRouterLog(options.logger, "error", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        error: logError(error),
        type: "router:request:error",
      });

      const payload = options.errorHandler
        ? options.errorHandler(error)
        : { body: "Internal Server Error", status: 500 };

      return {
        body: payload.body,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...payload.headers,
        },
        isBase64Encoded: false,
        statusCode: payload.status,
      };
    }
  };
}

export function createAwsLambdaStreamingRequestHandler<TContext = unknown>(
  options: AwsLambdaRequestHandlerOptions,
): AwsLambdaStreamingRequestHandler<TContext> {
  warnIfImplicitHostTrust(options);
  const runtime = awsLambdaRuntime();

  return runtime.streamifyResponse(async (event, responseStream, _context) => {
    const startedAt = logNow();
    const request = eventToRequest(event, options);
    const logFields = requestLogFields(request, "aws-lambda");
    emitRouterLog(options.logger, "info", {
      ...logFields,
      type: "router:request:start",
    });

    try {
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

      await streamResponseToLambda(response, responseStream, runtime);
    } catch (error) {
      emitRouterLog(options.logger, "error", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        error: logError(error),
        type: "router:request:error",
      });

      const payload = options.errorHandler
        ? options.errorHandler(error)
        : { body: "Internal Server Error", status: 500 };
      const response = new Response(payload.body, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...payload.headers,
        },
        status: payload.status,
      });

      await streamResponseToLambda(response, responseStream, runtime);
    }
  });
}

function eventToRequest(
  event: AwsLambdaHttpEventV2,
  options: AwsLambdaRequestHandlerOptions,
): Request {
  const headers = eventHeaders(event);
  const rawHost = firstForwardedValue(headers.get("x-forwarded-host")) ?? headers.get("host");
  const host = resolveRequestHost({
    allowedHosts: options.allowedHosts,
    fallbackHost: options.hostname ?? "lambda.local",
    hostPolicy: options.hostPolicy,
    rawHost: rawHost ?? undefined,
  });
  const protocol = firstForwardedValue(headers.get("x-forwarded-proto")) ?? "https";
  const rawPath = event.rawPath === undefined || event.rawPath === "" ? "/" : event.rawPath;
  const rawQueryString =
    event.rawQueryString === undefined || event.rawQueryString === ""
      ? ""
      : `?${event.rawQueryString}`;
  const method = event.requestContext?.http?.method ?? "GET";
  const init: RequestInit = {
    headers,
    method,
  };

  if (method !== "GET" && method !== "HEAD" && event.body !== undefined) {
    init.body =
      event.isBase64Encoded === true ? Buffer.from(event.body, "base64") : event.body;
  }

  return new Request(`${protocol}://${host}${rawPath}${rawQueryString}`, init);
}

function eventHeaders(event: AwsLambdaHttpEventV2): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  if (event.cookies !== undefined && event.cookies.length > 0 && !headers.has("cookie")) {
    headers.set("cookie", event.cookies.join("; "));
  }

  return headers;
}

async function responseToLambdaResult(response: Response): Promise<AwsLambdaHttpResultV2> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") {
      headers[key] = value;
    }
  });

  const cookies = responseCookies(response.headers);

  if (response.body === null) {
    return {
      body: "",
      ...(cookies.length === 0 ? {} : { cookies }),
      headers,
      isBase64Encoded: false,
      statusCode: response.status,
    };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const text = isTextContentType(contentType);

  return {
    body: text ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("base64"),
    ...(cookies.length === 0 ? {} : { cookies }),
    headers,
    isBase64Encoded: !text,
    statusCode: response.status,
  };
}

async function streamResponseToLambda(
  response: Response,
  responseStream: AwsLambdaStreamingResponseStream,
  runtime: AwsLambdaRuntime,
): Promise<void> {
  const stream = runtime.HttpResponseStream.from(
    responseStream,
    responseStreamingMetadata(response),
  );

  try {
    if (response.body === null) {
      stream.end();
      return;
    }

    const reader = response.body.getReader();

    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      await writeStreamingChunk(stream, result.value);
    }

    stream.end();
  } catch (error) {
    if (typeof stream.destroy === "function") {
      stream.destroy(error);
      return;
    }

    throw error;
  }
}

function responseStreamingMetadata(
  response: Response,
): AwsLambdaStreamingResponseMetadata {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") {
      headers[key] = value;
    }
  });

  const cookies = responseCookies(response.headers);

  return {
    ...(cookies.length === 0 ? {} : { cookies }),
    headers,
    statusCode: response.status,
  };
}

async function writeStreamingChunk(
  stream: AwsLambdaStreamingResponseStream,
  chunk: Uint8Array,
): Promise<void> {
  if (stream.write(chunk) !== false) {
    return;
  }

  if (typeof stream.once !== "function") {
    return;
  }

  await new Promise<void>((resolve) => {
    stream.once?.("drain", resolve);
  });
}

interface AwsLambdaRuntime {
  HttpResponseStream: {
    from(
      responseStream: AwsLambdaStreamingResponseStream,
      metadata: AwsLambdaStreamingResponseMetadata,
    ): AwsLambdaStreamingResponseStream;
  };
  streamifyResponse<TContext>(
    handler: AwsLambdaStreamingRequestHandler<TContext>,
  ): AwsLambdaStreamingRequestHandler<TContext>;
}

function awsLambdaRuntime(): AwsLambdaRuntime {
  const runtime = (globalThis as { awslambda?: Partial<AwsLambdaRuntime> | undefined })
    .awslambda;

  if (
    typeof runtime?.streamifyResponse !== "function" ||
    typeof runtime.HttpResponseStream?.from !== "function"
  ) {
    throw new Error(
      "AWS Lambda response streaming requires the Node.js Lambda runtime awslambda.streamifyResponse() and awslambda.HttpResponseStream.from().",
    );
  }

  return runtime as AwsLambdaRuntime;
}

function firstForwardedValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first === undefined || first === "" ? undefined : first;
}

function responseCookies(headers: Headers): string[] {
  const maybeHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof maybeHeaders.getSetCookie === "function") {
    return maybeHeaders.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  return raw === null ? [] : splitSetCookieHeader(raw);
}

function splitSetCookieHeader(header: string): string[] {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < header.length; index += 1) {
    const remaining = header.slice(index).toLowerCase();
    if (remaining.startsWith("expires=")) {
      inExpires = true;
      index += "expires=".length - 1;
      continue;
    }

    const char = header[index];
    if (char === ";") {
      inExpires = false;
      continue;
    }

    if (char === "," && !inExpires) {
      cookies.push(header.slice(start, index).trim());
      start = index + 1;
    }
  }

  cookies.push(header.slice(start).trim());
  return cookies.filter((cookie) => cookie.length > 0);
}

function isTextContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return true;
  }

  const type = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/javascript" ||
    type === "application/x-javascript" ||
    type === "application/xml" ||
    type === "application/x-www-form-urlencoded" ||
    type.endsWith("+json") ||
    type.endsWith("+xml")
  );
}
