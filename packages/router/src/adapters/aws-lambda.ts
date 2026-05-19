import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  type RouterRequestLogFields,
} from "../logger.js";
import type { AppRouterResponseHook } from "../render.js";
import type { RouterInstrumentation } from "../trace.js";

export type { RouterInstrumentation } from "../trace.js";
import {
  preloadBuiltAppRuntime,
  renderBuiltAppRequest,
  resolveRequestHost,
  warnIfImplicitHostTrust,
  type BuiltAppRuntimePreloadStrategy,
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
  instrumentation?: RouterInstrumentation | undefined;
  logger?: AppRouterLogger | undefined;
  onResponse?: AppRouterResponseHook | undefined;
  outDir: string;
  preload?: AwsLambdaPreloadStrategy | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  routeCache?: AppRouterCache | undefined;
  runtimeDir?: string | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy | undefined;
  timings?: boolean | undefined;
}

export type AwsLambdaPreloadStrategy =
  | "all"
  | "hot-route-requests"
  | "middleware"
  | "none"
  | {
      mode: "all" | "hot-route-requests" | "hot-routes" | "middleware" | "none";
      routes?: readonly string[] | undefined;
    };

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
  const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
  const runtimePreloadPromise = startAwsLambdaRuntimePreload(options, runtimeDirPromise);
  void runtimePreloadPromise?.catch(() => {});

  return createAwsLambdaRequestHandlerFromRuntime(options, runtimeDirPromise);
}

export async function createPreloadedAwsLambdaRequestHandler(
  options: AwsLambdaRequestHandlerOptions,
): Promise<AwsLambdaRequestHandler> {
  warnIfImplicitHostTrust(options);
  const runtimeDir = await prepareAwsLambdaRuntimeDir(options);
  await preloadAwsLambdaRuntime(options, runtimeDir);

  return createAwsLambdaRequestHandlerFromRuntime(options, Promise.resolve(runtimeDir));
}

function createAwsLambdaRequestHandlerFromRuntime(
  options: AwsLambdaRequestHandlerOptions,
  runtimeDirPromise: Promise<string>,
): AwsLambdaRequestHandler {
  return async (event) => {
    const startedAt = logNow();
    const phases = createAwsLambdaTimingPhases(options);
    const eventToRequestStartedAt = phaseStartedAt(phases);
    const request = eventToRequest(event, options);
    finishPhase(phases, eventToRequestStartedAt, "eventToRequestMs");
    const logFields = requestLogFields(request, "aws-lambda");
    emitRouterLog(options.logger, "info", {
      ...logFields,
      type: "router:request:start",
    });

    try {
      const runtimeDirStartedAt = phaseStartedAt(phases);
      const runtimeDir = await runtimeDirPromise;
      finishPhase(phases, runtimeDirStartedAt, "runtimeDirMs");
      const renderStartedAt = phaseStartedAt(phases);
      const response = await renderBuiltAppRequest({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        instrumentation: options.instrumentation,
        logger: awsLambdaRenderLogger(options),
        onResponse: options.onResponse,
        prerenderStore: options.prerenderStore,
        request,
        routeCache: options.routeCache,
        runtimeDir,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      });
      finishPhase(phases, renderStartedAt, "renderMs");
      const responseSerializationStartedAt = phaseStartedAt(phases);
      const result = await responseToLambdaResult(response, phases);
      finishPhase(phases, responseSerializationStartedAt, "responseSerializationMs");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        status: result.statusCode,
        type: "router:request:end",
      });
      emitAwsLambdaTiming(options, logFields, result.statusCode, startedAt, phases);

      return result;
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
  const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
  const runtimePreloadPromise = startAwsLambdaRuntimePreload(options, runtimeDirPromise);
  void runtimePreloadPromise?.catch(() => {});

  return createAwsLambdaStreamingRequestHandlerFromRuntime(options, runtime, runtimeDirPromise);
}

export async function createPreloadedAwsLambdaStreamingRequestHandler<TContext = unknown>(
  options: AwsLambdaRequestHandlerOptions,
): Promise<AwsLambdaStreamingRequestHandler<TContext>> {
  warnIfImplicitHostTrust(options);
  const runtime = awsLambdaRuntime();
  const runtimeDir = await prepareAwsLambdaRuntimeDir(options);
  await preloadAwsLambdaRuntime(options, runtimeDir);

  return createAwsLambdaStreamingRequestHandlerFromRuntime<TContext>(
    options,
    runtime,
    Promise.resolve(runtimeDir),
  );
}

function startAwsLambdaRuntimePreload(
  options: AwsLambdaRequestHandlerOptions,
  runtimeDirPromise: Promise<string>,
): Promise<void> | undefined {
  const preload = normalizeAwsLambdaPreload(options.preload);
  if (preload.mode === "none") {
    return undefined;
  }

  return runtimeDirPromise.then((runtimeDir) => preloadAwsLambdaRuntime(options, runtimeDir));
}

async function preloadAwsLambdaRuntime(
  options: AwsLambdaRequestHandlerOptions,
  runtimeDir: string,
): Promise<void> {
  const preload = normalizeAwsLambdaPreload(options.preload);
  if (preload.mode === "none") {
    return;
  }

  await preloadBuiltAppRuntime({
    importPolicy: options.importPolicy,
    outDir: options.outDir,
    preload,
    runtimeDir,
  });
}

function normalizeAwsLambdaPreload(
  strategy: AwsLambdaPreloadStrategy | undefined,
): BuiltAppRuntimePreloadStrategy {
  if (strategy === undefined) {
    return { mode: "all" };
  }

  if (typeof strategy === "string") {
    return { mode: strategy };
  }

  return strategy;
}

function createAwsLambdaStreamingRequestHandlerFromRuntime<TContext = unknown>(
  options: AwsLambdaRequestHandlerOptions,
  runtime: AwsLambdaRuntime,
  runtimeDirPromise: Promise<string>,
): AwsLambdaStreamingRequestHandler<TContext> {
  return runtime.streamifyResponse(async (event, responseStream, _context) => {
    const startedAt = logNow();
    const phases = createAwsLambdaTimingPhases(options);
    const eventToRequestStartedAt = phaseStartedAt(phases);
    const request = eventToRequest(event, options);
    finishPhase(phases, eventToRequestStartedAt, "eventToRequestMs");
    const logFields = requestLogFields(request, "aws-lambda");
    emitRouterLog(options.logger, "info", {
      ...logFields,
      type: "router:request:start",
    });

    try {
      const runtimeDirStartedAt = phaseStartedAt(phases);
      const runtimeDir = await runtimeDirPromise;
      finishPhase(phases, runtimeDirStartedAt, "runtimeDirMs");
      const renderStartedAt = phaseStartedAt(phases);
      const response = await renderBuiltAppRequest({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        instrumentation: options.instrumentation,
        logger: awsLambdaRenderLogger(options),
        onResponse: options.onResponse,
        prerenderStore: options.prerenderStore,
        request,
        routeCache: options.routeCache,
        runtimeDir,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      });
      finishPhase(phases, renderStartedAt, "renderMs");
      const responseStreamingStartedAt = phaseStartedAt(phases);
      await streamResponseToLambda(response, responseStream, runtime, phases);
      finishPhase(phases, responseStreamingStartedAt, "responseStreamingMs");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        status: response.status,
        type: "router:request:end",
      });
      emitAwsLambdaTiming(options, logFields, response.status, startedAt, phases);
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

      await streamResponseToLambda(response, responseStream, runtime, phases);
    }
  });
}

async function prepareAwsLambdaRuntimeDir(options: {
  outDir: string;
  runtimeDir?: string | undefined;
}): Promise<string> {
  const runtimeDir = options.runtimeDir ?? defaultAwsLambdaRuntimeDir(options.outDir);

  await mkdir(runtimeDir, { recursive: true });
  await linkAwsLambdaNodeModules({
    outDir: options.outDir,
    runtimeDir,
  });

  return runtimeDir;
}

async function linkAwsLambdaNodeModules(options: {
  outDir: string;
  runtimeDir: string;
}): Promise<void> {
  const source = join(dirname(options.outDir), "node_modules");
  const target = join(options.runtimeDir, "node_modules");

  try {
    await access(source);
  } catch {
    return;
  }

  try {
    const stats = await lstat(target);

    if (!stats.isSymbolicLink()) {
      return;
    }

    if ((await readlink(target)) === source) {
      return;
    }

    return;
  } catch {
    // Missing target: create it below.
  }

  try {
    await symlink(source, target, "dir");
  } catch (error) {
    if (!isNodeErrorCode(error, "EEXIST")) {
      throw error;
    }
  }
}

function defaultAwsLambdaRuntimeDir(outDir: string): string {
  return join(tmpdir(), "mreact-router", hashText(outDir), "runtime");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
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

async function responseToLambdaResult(
  response: Response,
  phases?: Record<string, number> | undefined,
): Promise<AwsLambdaHttpResultV2> {
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

  const streamDrainStartedAt = phaseStartedAt(phases);
  const bytes = await drainBufferedResponseBody(response.body, phases);
  addPhaseDuration(phases, streamDrainStartedAt, "streamDrainMs");

  const bodyEncodeStartedAt = phaseStartedAt(phases);
  const contentType = response.headers.get("content-type");
  const text = isTextContentType(contentType);
  const result = {
    body: text ? bytes.toString("utf8") : bytes.toString("base64"),
    ...(cookies.length === 0 ? {} : { cookies }),
    headers,
    isBase64Encoded: !text,
    statusCode: response.status,
  };
  addPhaseDuration(phases, bodyEncodeStartedAt, "bodyEncodeMs");

  return result;
}

async function drainBufferedResponseBody(
  body: ReadableStream<Uint8Array>,
  phases?: Record<string, number> | undefined,
): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const readStartedAt = phaseStartedAt(phases);
    const result = await reader.read();
    addPhaseDuration(phases, readStartedAt, "streamReadMs");

    if (result.done) {
      break;
    }

    chunks.push(result.value);
    byteLength += result.value.byteLength;
  }

  const concatStartedAt = phaseStartedAt(phases);
  const bytes = concatUint8ArrayChunks(chunks, byteLength);
  addPhaseDuration(phases, concatStartedAt, "streamConcatMs");

  return bytes;
}

function concatUint8ArrayChunks(chunks: readonly Uint8Array[], byteLength: number): Buffer {
  if (chunks.length === 0 || byteLength === 0) {
    return Buffer.alloc(0);
  }

  if (chunks.length === 1) {
    const [chunk] = chunks;
    if (chunk === undefined) {
      return Buffer.alloc(0);
    }
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  const bytes = Buffer.allocUnsafe(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function createAwsLambdaTimingPhases(
  options: AwsLambdaRequestHandlerOptions,
): Record<string, number> | undefined {
  return options.timings === true ? {} : undefined;
}

function awsLambdaRenderLogger(
  options: AwsLambdaRequestHandlerOptions,
): AppRouterLogger | undefined {
  return options.timings === true ? options.logger : undefined;
}

function phaseStartedAt(phases: Record<string, number> | undefined): number | undefined {
  return phases === undefined ? undefined : logNow();
}

function finishPhase(
  phases: Record<string, number> | undefined,
  startedAt: number | undefined,
  name: string,
): void {
  if (phases !== undefined && startedAt !== undefined) {
    phases[name] = logDurationMs(startedAt);
  }
}

function addPhaseDuration(
  phases: Record<string, number> | undefined,
  startedAt: number | undefined,
  name: string,
): void {
  if (phases !== undefined && startedAt !== undefined) {
    phases[name] = (phases[name] ?? 0) + logDurationMs(startedAt);
  }
}

function emitAwsLambdaTiming(
  options: AwsLambdaRequestHandlerOptions,
  logFields: RouterRequestLogFields,
  status: number,
  startedAt: number,
  phases: Record<string, number> | undefined,
): void {
  if (phases === undefined) {
    return;
  }

  emitRouterLog(options.logger, "debug", {
    ...logFields,
    durationMs: logDurationMs(startedAt),
    phases,
    status,
    type: "router:request:timing",
  });
}

async function streamResponseToLambda(
  response: Response,
  responseStream: AwsLambdaStreamingResponseStream,
  runtime: AwsLambdaRuntime,
  phases?: Record<string, number> | undefined,
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
      const streamWaitStartedAt = phaseStartedAt(phases);
      const result = await reader.read();
      addPhaseDuration(phases, streamWaitStartedAt, "streamWaitMs");

      if (result.done) {
        break;
      }

      const streamWriteStartedAt = phaseStartedAt(phases);
      await writeStreamingChunk(stream, result.value);
      addPhaseDuration(phases, streamWriteStartedAt, "streamWriteMs");
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
