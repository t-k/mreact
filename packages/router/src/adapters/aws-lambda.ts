import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readlink, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AppRouterServerActionOptions } from "../actions.js";
import type { AppRouterCache } from "../cache.js";
import type { AppRouterImportPolicy } from "../import-policy.js";
import {
  normalizeBuiltAppRuntimePreloadStrategy,
  type NormalizedBuiltAppRuntimePreloadStrategy,
} from "../preload-policy.js";
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

/** Re-exports router instrumentation hooks for AWS Lambda handlers. */
export type { RouterInstrumentation } from "../trace.js";
/** Re-exports app-router import policy controls for AWS Lambda handlers. */
export type { AppRouterImportPolicy } from "../import-policy.js";
import {
  createBuiltRequestRuntime,
  preloadBuiltAppRuntime,
  resolveRequestHost,
  warnIfImplicitHostTrust,
  type AppRouterPrerenderStore,
  type RequestHostPolicy,
  type ResponseSinkStrategy,
} from "../serve.js";

/**
 * Represents the AWS API Gateway HTTP API v2 event consumed by buffered handlers.
 */
export interface AwsLambdaHttpEventV2 {
  body?: string | undefined;
  cookies?: string[] | undefined;
  headers?: Record<string, string | undefined> | undefined;
  isBase64Encoded?: boolean | undefined;
  rawPath: string;
  rawQueryString: string;
  requestContext: {
    http: {
      method: string;
      protocol?: string | undefined;
    };
  };
  version: "2.0";
}

/**
 * Represents the AWS API Gateway HTTP API v2 result returned by buffered handlers.
 */
export interface AwsLambdaHttpResultV2 {
  body: string;
  cookies?: string[] | undefined;
  headers?: Record<string, string> | undefined;
  isBase64Encoded: boolean;
  statusCode: number;
}

/**
 * Describes response metadata passed to Lambda streaming response helpers.
 */
export interface AwsLambdaStreamingResponseMetadata {
  cookies?: string[] | undefined;
  headers: Record<string, string>;
  statusCode: number;
}

/**
 * Defines the writable stream interface used by Lambda streaming handlers.
 */
export interface AwsLambdaStreamingResponseStream {
  destroy?: ((error?: unknown) => void) | undefined;
  end(): void;
  once?: ((event: "drain", listener: () => void) => unknown) | undefined;
  write(chunk: string | Uint8Array): boolean;
}

/**
 * Configures AWS Lambda request handlers for built app-router output.
 */
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
  importPolicy?: AwsLambdaImportPolicy | undefined;
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
  trustForwardedProto?: boolean | undefined;
}

/**
 * Selects how an AWS Lambda handler resolves its app-router import policy.
 */
export type AwsLambdaImportPolicy =
  | AppRouterImportPolicy
  | "generated"
  | { fromManifest: true };

/**
 * Configures preload behavior for built app-router modules in AWS Lambda.
 */
export type AwsLambdaPreloadStrategy =
  | "all"
  | "hot-route-requests"
  | "middleware"
  | "none"
  | {
      mode: "all" | "hot-route-requests" | "hot-routes" | "middleware" | "none";
      routes?: readonly string[] | undefined;
      wait?: "background" | "before-render" | "first-request" | undefined;
    };

type NormalizedAwsLambdaPreloadStrategy = NormalizedBuiltAppRuntimePreloadStrategy;

type AwsLambdaDefaultPreloadMode = "all" | "middleware";

/**
 * Handles one AWS API Gateway HTTP API v2 event with a buffered response.
 */
export type AwsLambdaRequestHandler = (
  event: AwsLambdaHttpEventV2,
) => Promise<AwsLambdaHttpResultV2>;

/**
 * Handles one AWS API Gateway HTTP API v2 event with a Lambda response stream.
 */
export type AwsLambdaStreamingRequestHandler<TContext = unknown> = (
  event: AwsLambdaHttpEventV2,
  responseStream: AwsLambdaStreamingResponseStream,
  context: TContext,
) => Promise<void>;

const invalidAwsLambdaHttpEventV2Diagnostic =
  'Expected an AWS Lambda HTTP API payload format 2.0 event with rawPath and requestContext.http.method.';

function invalidAwsLambdaHttpEventV2Result(): AwsLambdaHttpResultV2 {
  return {
    body: invalidAwsLambdaHttpEventV2Diagnostic,
    headers: { "content-type": "text/plain; charset=utf-8" },
    isBase64Encoded: false,
    statusCode: 400,
  };
}

function invalidAwsLambdaHttpEventV2Response(): Response {
  return new Response(invalidAwsLambdaHttpEventV2Diagnostic, {
    headers: { "content-type": "text/plain; charset=utf-8" },
    status: 400,
  });
}

/**
 * Creates a buffered AWS Lambda HTTP API v2 handler for built app-router output.
 *
 * The handler materializes runtime files under `/tmp` by default, starts middleware-focused background preload, applies the generated import policy when requested, and returns API Gateway v2 response objects.
 */
export function createAwsLambdaRequestHandler(
  options: AwsLambdaRequestHandlerOptions,
): AwsLambdaRequestHandler {
  warnIfImplicitHostTrust(options);
  let handler: AwsLambdaRequestHandler | undefined;

  return async (event) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      return invalidAwsLambdaHttpEventV2Result();
    }

    handler ??= (() => {
      const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
      const runtimePreloadPromise = startAwsLambdaRuntimePreload(options, runtimeDirPromise, "middleware");
      void runtimePreloadPromise?.catch(() => {});
      return createAwsLambdaRequestHandlerFromRuntime(
        options,
        runtimeDirPromise,
        runtimePreloadPromise,
        "middleware",
      );
    })();

    return await handler(event);
  };
}

/**
 * Creates a buffered AWS Lambda handler after eagerly preparing and preloading the built runtime.
 *
 * Use this when startup code can await preload work before the first request instead of letting the first invocation share that cost.
 */
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
  runtimePreloadPromise?: Promise<void> | undefined,
  defaultPreloadMode: AwsLambdaDefaultPreloadMode = "all",
): AwsLambdaRequestHandler {
  return async (event) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      return invalidAwsLambdaHttpEventV2Result();
    }

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
      await waitForAwsLambdaRuntimePreload(
        options,
        runtimePreloadPromise,
        phases,
        defaultPreloadMode,
      );
      const importPolicy = await resolveAwsLambdaImportPolicy(options);
      const renderStartedAt = phaseStartedAt(phases);
      const builtRuntime = await createBuiltRequestRuntime({
        immutableRuntime: true,
        importPolicy,
        outDir: options.outDir,
        runtimeDir,
      });
      const preload = awsLambdaRenderPreload(
        options,
        runtimePreloadPromise,
        defaultPreloadMode,
      );
      const response = await builtRuntime.render(request, {
        instrumentation: options.instrumentation,
        logger: awsLambdaRenderLogger(options),
        onResponse: options.onResponse,
        ...(preload === undefined ? {} : { preload }),
        prerenderStore: options.prerenderStore,
        routeCache: options.routeCache,
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
      const response = await applyAwsLambdaResponseHook(
        new Response(payload.body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            ...payload.headers,
          },
          status: payload.status,
        }),
        options,
        request,
      );

      return await responseToLambdaResult(response, phases);
    }
  };
}

/**
 * Creates an AWS Lambda streaming response handler for built app-router output.
 *
 * Use this with Lambda response streaming runtimes when HTML or route responses should be written progressively instead of buffered into an API Gateway result.
 */
export function createAwsLambdaStreamingRequestHandler<TContext = unknown>(
  options: AwsLambdaRequestHandlerOptions,
): AwsLambdaStreamingRequestHandler<TContext> {
  warnIfImplicitHostTrust(options);
  const runtime = awsLambdaRuntime();
  let handler: AwsLambdaStreamingRequestHandler<TContext> | undefined;

  return runtime.streamifyResponse(async (event, responseStream, context) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      await streamResponseToLambda(
        invalidAwsLambdaHttpEventV2Response(),
        responseStream,
        runtime,
      );
      return;
    }

    handler ??= (() => {
      const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
      const runtimePreloadPromise = startAwsLambdaRuntimePreload(options, runtimeDirPromise, "middleware");
      void runtimePreloadPromise?.catch(() => {});
      return createAwsLambdaStreamingRequestHandlerFromRuntime(
        options,
        runtime,
        runtimeDirPromise,
        runtimePreloadPromise,
        "middleware",
      );
    })();

    await handler(event, responseStream, context);
  });
}

/**
 * Creates a streaming AWS Lambda handler after eagerly preparing and preloading the built runtime.
 */
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
  defaultMode: AwsLambdaDefaultPreloadMode = "all",
): Promise<void> | undefined {
  const preload = normalizeAwsLambdaPreload(options.preload, defaultMode);
  if (preload.mode === "none") {
    return undefined;
  }

  return runtimeDirPromise.then((runtimeDir) =>
    preloadAwsLambdaRuntime(options, runtimeDir, defaultMode),
  );
}

async function preloadAwsLambdaRuntime(
  options: AwsLambdaRequestHandlerOptions,
  runtimeDir: string,
  defaultMode: AwsLambdaDefaultPreloadMode = "all",
): Promise<void> {
  const preload = normalizeAwsLambdaPreload(options.preload, defaultMode);
  if (preload.mode === "none") {
    return;
  }

  const importPolicy = await resolveAwsLambdaImportPolicy(options);
  await preloadBuiltAppRuntime({
    importPolicy,
    outDir: options.outDir,
    preload,
    runtimeDir,
  });
}

async function waitForAwsLambdaRuntimePreload(
  options: AwsLambdaRequestHandlerOptions,
  runtimePreloadPromise: Promise<void> | undefined,
  phases: Record<string, number> | undefined,
  defaultMode: AwsLambdaDefaultPreloadMode,
): Promise<void> {
  const preload = normalizeAwsLambdaPreload(options.preload, defaultMode);
  if (preload.wait !== "first-request" || runtimePreloadPromise === undefined) {
    return;
  }

  const preloadWaitStartedAt = phaseStartedAt(phases);
  try {
    await runtimePreloadPromise;
  } finally {
    finishPhase(phases, preloadWaitStartedAt, "preloadWaitMs");
  }
}

function awsLambdaRenderPreload(
  options: AwsLambdaRequestHandlerOptions,
  runtimePreloadPromise: Promise<void> | undefined,
  defaultMode: AwsLambdaDefaultPreloadMode,
): { promise: Promise<void>; wait: "before-render" } | undefined {
  if (
    runtimePreloadPromise === undefined ||
    normalizeAwsLambdaPreload(options.preload, defaultMode).wait !== "before-render"
  ) {
    return undefined;
  }

  return {
    promise: runtimePreloadPromise,
    wait: "before-render",
  };
}

const generatedImportPolicyCache = new Map<string, Promise<AppRouterImportPolicy>>();

async function resolveAwsLambdaImportPolicy(
  options: AwsLambdaRequestHandlerOptions,
): Promise<AppRouterImportPolicy | undefined> {
  const policy = options.importPolicy;

  if (policy === undefined) {
    return undefined;
  }

  if (policy === "generated") {
    return await readGeneratedAwsLambdaImportPolicy(options.outDir);
  }

  if (isGeneratedAwsLambdaImportPolicyReference(policy) && policy.fromManifest === true) {
    return await readGeneratedAwsLambdaImportPolicy(options.outDir);
  }

  const configuredPolicy = policy as AppRouterImportPolicy;
  return {
    ...(configuredPolicy.allowedPackages === undefined
      ? {}
      : { allowedPackages: configuredPolicy.allowedPackages }),
    ...(configuredPolicy.allowedSourceDirs === undefined
      ? {}
      : { allowedSourceDirs: configuredPolicy.allowedSourceDirs }),
    ...(configuredPolicy.projectRoot === undefined
      ? {}
      : { projectRoot: configuredPolicy.projectRoot }),
  };
}

function isGeneratedAwsLambdaImportPolicyReference(
  policy: AwsLambdaImportPolicy,
): policy is { fromManifest: true } {
  return typeof policy === "object" && policy !== null && "fromManifest" in policy;
}

async function readGeneratedAwsLambdaImportPolicy(outDir: string): Promise<AppRouterImportPolicy> {
  const cached = generatedImportPolicyCache.get(outDir);
  if (cached !== undefined) {
    return await cached;
  }

  const promise = readGeneratedAwsLambdaImportPolicyInner(outDir);
  generatedImportPolicyCache.set(outDir, promise);

  return await promise;
}

async function readGeneratedAwsLambdaImportPolicyInner(outDir: string): Promise<AppRouterImportPolicy> {
  const policy = JSON.parse(await readFile(join(outDir, "server", "import-policy.json"), "utf8")) as {
    runtimePackages?: readonly string[] | undefined;
  };

  return {
    allowedPackages: policy.runtimePackages ?? [],
  };
}

function normalizeAwsLambdaPreload(
  strategy: AwsLambdaPreloadStrategy | undefined,
  defaultMode: AwsLambdaDefaultPreloadMode = "all",
): NormalizedAwsLambdaPreloadStrategy {
  return normalizeBuiltAppRuntimePreloadStrategy(strategy, defaultMode);
}

function createAwsLambdaStreamingRequestHandlerFromRuntime<TContext = unknown>(
  options: AwsLambdaRequestHandlerOptions,
  runtime: AwsLambdaRuntime,
  runtimeDirPromise: Promise<string>,
  runtimePreloadPromise?: Promise<void> | undefined,
  defaultPreloadMode: AwsLambdaDefaultPreloadMode = "all",
): AwsLambdaStreamingRequestHandler<TContext> {
  return runtime.streamifyResponse(async (event, responseStream, _context) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      await streamResponseToLambda(
        invalidAwsLambdaHttpEventV2Response(),
        responseStream,
        runtime,
      );
      return;
    }

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
      await waitForAwsLambdaRuntimePreload(
        options,
        runtimePreloadPromise,
        phases,
        defaultPreloadMode,
      );
      const importPolicy = await resolveAwsLambdaImportPolicy(options);
      const renderStartedAt = phaseStartedAt(phases);
      const builtRuntime = await createBuiltRequestRuntime({
        immutableRuntime: true,
        importPolicy,
        outDir: options.outDir,
        runtimeDir,
      });
      const preload = awsLambdaRenderPreload(
        options,
        runtimePreloadPromise,
        defaultPreloadMode,
      );
      const response = await builtRuntime.render(request, {
        instrumentation: options.instrumentation,
        logger: awsLambdaRenderLogger(options),
        onResponse: options.onResponse,
        ...(preload === undefined ? {} : { preload }),
        prerenderStore: options.prerenderStore,
        routeCache: options.routeCache,
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
      const response = await applyAwsLambdaResponseHook(
        new Response(payload.body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            ...payload.headers,
          },
          status: payload.status,
        }),
        options,
        request,
      );

      await streamResponseToLambda(response, responseStream, runtime, phases);
    }
  });
}

async function applyAwsLambdaResponseHook(
  response: Response,
  options: Pick<AwsLambdaRequestHandlerOptions, "onResponse">,
  request: Request,
): Promise<Response> {
  const hooked = await options.onResponse?.(response, { request });

  return hooked instanceof Response ? hooked : response;
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
  validateAwsLambdaHttpEventV2(event);
  const headers = eventHeaders(event);
  const rawHost = lambdaRequestHost(headers, options);
  const host = resolveRequestHost({
    allowedHosts: options.allowedHosts,
    fallbackHost: options.hostname ?? "lambda.local",
    hostPolicy: lambdaHostPolicy(options),
    rawHost: rawHost ?? undefined,
  });
  const protocol = lambdaRequestProtocol(event, headers, options);
  const rawPath = event.rawPath;
  const rawQueryString = event.rawQueryString === "" ? "" : `?${event.rawQueryString}`;
  const method = event.requestContext.http.method;
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

function validateAwsLambdaHttpEventV2(event: AwsLambdaHttpEventV2): void {
  const candidate = event as unknown;

  if (
    typeof candidate !== "object" ||
    candidate === null ||
    (candidate as { version?: unknown }).version !== "2.0" ||
    typeof (candidate as { rawPath?: unknown }).rawPath !== "string" ||
    !(candidate as { rawPath: string }).rawPath.startsWith("/") ||
    typeof (candidate as { rawQueryString?: unknown }).rawQueryString !== "string" ||
    typeof (candidate as { requestContext?: unknown }).requestContext !== "object" ||
    (candidate as { requestContext?: unknown }).requestContext === null ||
    typeof ((candidate as { requestContext: { http?: unknown } }).requestContext.http) !== "object" ||
    (candidate as { requestContext: { http?: unknown } }).requestContext.http === null ||
    typeof ((candidate as { requestContext: { http: { method?: unknown } } }).requestContext.http.method) !== "string" ||
    (candidate as { requestContext: { http: { method: string } } }).requestContext.http.method === ""
  ) {
    throw new Error(invalidAwsLambdaHttpEventV2Diagnostic);
  }
}

function lambdaRequestHost(
  headers: Headers,
  options: AwsLambdaRequestHandlerOptions,
): string | null {
  if (options.hostPolicy === "trusted-proxy") {
    return firstForwardedValue(headers.get("x-forwarded-host")) ?? headers.get("host");
  }

  return headers.get("host");
}

function lambdaHostPolicy(
  options: AwsLambdaRequestHandlerOptions,
): RequestHostPolicy | undefined {
  return options.hostPolicy ?? (process.env.NODE_ENV === "production" ? "strict" : undefined);
}

function lambdaRequestProtocol(
  event: AwsLambdaHttpEventV2,
  headers: Headers,
  options: AwsLambdaRequestHandlerOptions,
): "http" | "https" {
  if (options.trustForwardedProto === true) {
    return normalizeRequestProtocol(firstForwardedValue(headers.get("x-forwarded-proto")));
  }

  return normalizeRequestProtocol(event.requestContext?.http?.protocol);
}

function normalizeRequestProtocol(value: string | undefined): "http" | "https" {
  if (value === undefined || value === "") {
    return "https";
  }

  const normalized = value.toLowerCase();
  return normalized === "http" || normalized.startsWith("http/") ? "http" : "https";
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
