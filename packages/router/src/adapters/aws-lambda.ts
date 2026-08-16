import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readlink, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DehydrateOptions } from "@reckona/mreact-query";
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

/** Re-exports cache contracts used by AWS Lambda handlers. */
export type { AppRouterCache, AppRouterCacheEntry } from "../cache.js";
/** Re-exports server action contracts used by AWS Lambda handlers. */
export type { AppRouterAllowedServerAction, AppRouterServerActionOptions } from "../actions.js";
/** Re-exports logger contracts used by AWS Lambda handlers. */
export type {
  AppRouterCspInlineNonceWarningLogEvent,
  AppRouterLogger,
  AppRouterLogError,
  AppRouterLogEvent,
  AppRouterRenderTimingLogEvent,
  AppRouterRequestEndLogEvent,
  AppRouterRequestErrorLogEvent,
  AppRouterRequestStartLogEvent,
  AppRouterRequestTimingLogEvent,
  AppRouterRuntime,
} from "../logger.js";
/** Re-exports response hook contracts used by AWS Lambda handlers. */
export type { AppRouterResponseHook, AppRouterResponseHookContext } from "../render.js";
/** Re-exports build contracts referenced by AWS Lambda handler options. */
export type { BuiltPrerenderedRoute } from "../build.js";
/** Re-exports router instrumentation hooks and events for AWS Lambda handlers. */
export type {
  RouterInstrumentation,
  RouterMiddlewareEndInstrumentationEvent,
  RouterMiddlewareInstrumentationEvent,
  RouterRequestEndInstrumentationEvent,
  RouterRequestInstrumentationEvent,
  RouterRouteEndInstrumentationEvent,
  RouterRouteInstrumentationEvent,
  RouterTraceContext,
} from "../trace.js";
/** Re-exports app-router import policy controls for AWS Lambda handlers. */
export type { AppRouterImportPolicy } from "../import-policy.js";
import {
  createBuiltRequestRuntime,
  preloadBuiltAppRuntime,
  resolveRequestHost,
  type AppRouterPrerenderStore,
  type RequestHostPolicy,
  type ResponseSinkStrategy,
} from "../serve.js";

let warnedImplicitAwsLambdaHostPolicy = false;

/** Re-exports request and rendering contracts used by AWS Lambda handlers. */
export type { AppRouterPrerenderStore, RequestHostPolicy, ResponseSinkStrategy } from "../serve.js";

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
  /** Reports whether the runtime output stream has already been destroyed. */
  destroyed?: boolean | undefined;
  end(): void;
  /** Removes a lifecycle listener when the runtime stream implements Node EventEmitter semantics. */
  off?:
    | ((event: "close" | "drain" | "error", listener: (error?: unknown) => void) => unknown)
    | undefined;
  /** Registers drain-only or full Node-compatible lifecycle listeners. */
  once?:
    | ((event: "drain", listener: () => void) => unknown)
    | ((event: "close" | "drain" | "error", listener: (error?: unknown) => void) => unknown)
    | undefined;
  /** Removes a lifecycle listener on runtimes that expose the legacy EventEmitter API. */
  removeListener?:
    | ((event: "close" | "drain" | "error", listener: (error?: unknown) => void) => unknown)
    | undefined;
  write(chunk: string | Uint8Array): boolean;
  /** Reports whether the runtime output stream ended normally. */
  writableEnded?: boolean | undefined;
}

/**
 * Configures AWS Lambda request handlers for built app-router output.
 */
export interface AwsLambdaRequestHandlerOptions {
  allowedHosts?: readonly string[] | undefined;
  dehydrateOptions?: DehydrateOptions | undefined;
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
export type AwsLambdaImportPolicy = AppRouterImportPolicy | "generated" | { fromManifest: true };

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
  "Expected an AWS Lambda HTTP API payload format 2.0 event with rawPath and requestContext.http.method.";

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
  warnIfImplicitAwsLambdaHostPolicy(options);
  let handler: AwsLambdaRequestHandler | undefined;

  return async (event) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      return invalidAwsLambdaHttpEventV2Result();
    }

    handler ??= (() => {
      const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
      const runtimePreloadPromise = startAwsLambdaRuntimePreload(
        options,
        runtimeDirPromise,
        "middleware",
      );
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
 * Creates a buffered AWS Lambda handler that starts full runtime preparation after the first valid event.
 *
 * Invalid events are rejected before runtime materialization or preload work begins.
 */
export async function createPreloadedAwsLambdaRequestHandler(
  options: AwsLambdaRequestHandlerOptions,
): Promise<AwsLambdaRequestHandler> {
  warnIfImplicitAwsLambdaHostPolicy(options);
  let handler: AwsLambdaRequestHandler | undefined;

  return async (event) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      return invalidAwsLambdaHttpEventV2Result();
    }

    handler ??= (() => {
      const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
      const runtimePreloadPromise = startAwsLambdaRuntimePreload(options, runtimeDirPromise, "all");
      void runtimePreloadPromise?.catch(() => {});
      return createAwsLambdaRequestHandlerFromRuntime(
        options,
        runtimeDirPromise,
        runtimePreloadPromise,
      );
    })();

    return await handler(event);
  };
}

/**
 * Explicitly materializes and preloads a built Lambda runtime before request handling.
 *
 * Call this during controlled Lambda initialization only when the extra startup work is preferable to first-valid-request latency. Request handlers always validate events before they start runtime work.
 */
export async function warmAwsLambdaRuntime(options: AwsLambdaRequestHandlerOptions): Promise<void> {
  warnIfImplicitAwsLambdaHostPolicy(options);
  const runtimeDir = await prepareAwsLambdaRuntimeDir(options);
  await preloadAwsLambdaRuntime(options, runtimeDir);
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
    let request: Request | undefined;
    let logFields = awsLambdaEventLogFields(event);

    try {
      const eventToRequestStartedAt = phaseStartedAt(phases);
      request = eventToRequest(event, options);
      finishPhase(phases, eventToRequestStartedAt, "eventToRequestMs");
      logFields = requestLogFields(request, "aws-lambda");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        type: "router:request:start",
      });
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
      const preload = awsLambdaRenderPreload(options, runtimePreloadPromise, defaultPreloadMode);
      const response = await builtRuntime.render(request, {
        dehydrateOptions: options.dehydrateOptions,
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
  warnIfImplicitAwsLambdaHostPolicy(options);
  const runtime = awsLambdaRuntime();
  let handler: AwsLambdaStreamingRequestHandler<TContext> | undefined;

  return runtime.streamifyResponse(async (event, responseStream, context) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      await streamResponseToLambda(invalidAwsLambdaHttpEventV2Response(), responseStream, runtime);
      return;
    }

    handler ??= (() => {
      const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
      const runtimePreloadPromise = startAwsLambdaRuntimePreload(
        options,
        runtimeDirPromise,
        "middleware",
      );
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
 * Creates a streaming AWS Lambda handler that starts full runtime preparation after the first valid event.
 *
 * Invalid events are rejected before runtime materialization or preload work begins.
 */
export async function createPreloadedAwsLambdaStreamingRequestHandler<TContext = unknown>(
  options: AwsLambdaRequestHandlerOptions,
): Promise<AwsLambdaStreamingRequestHandler<TContext>> {
  warnIfImplicitAwsLambdaHostPolicy(options);
  const runtime = awsLambdaRuntime();
  let handler: AwsLambdaStreamingRequestHandler<TContext> | undefined;

  return runtime.streamifyResponse(async (event, responseStream, context) => {
    try {
      validateAwsLambdaHttpEventV2(event);
    } catch {
      await streamResponseToLambda(invalidAwsLambdaHttpEventV2Response(), responseStream, runtime);
      return;
    }

    handler ??= (() => {
      const runtimeDirPromise = prepareAwsLambdaRuntimeDir(options);
      const runtimePreloadPromise = startAwsLambdaRuntimePreload(options, runtimeDirPromise, "all");
      void runtimePreloadPromise?.catch(() => {});
      return createAwsLambdaStreamingRequestHandlerFromRuntime<TContext>(
        options,
        runtime,
        runtimeDirPromise,
        runtimePreloadPromise,
      );
    })();

    await handler(event, responseStream, context);
  });
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

async function readGeneratedAwsLambdaImportPolicyInner(
  outDir: string,
): Promise<AppRouterImportPolicy> {
  const policy = JSON.parse(
    await readFile(join(outDir, "server", "import-policy.json"), "utf8"),
  ) as {
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
      await streamResponseToLambda(invalidAwsLambdaHttpEventV2Response(), responseStream, runtime);
      return;
    }

    const startedAt = logNow();
    const phases = createAwsLambdaTimingPhases(options);
    const requestAbortController = new AbortController();
    let request: Request | undefined;
    let requestLifecycle: ReturnType<typeof observeLambdaStreamFailure> | undefined;
    let logFields = awsLambdaEventLogFields(event);

    try {
      const eventToRequestStartedAt = phaseStartedAt(phases);
      request = eventToRequest(event, options, requestAbortController.signal);
      requestLifecycle = observeLambdaStreamFailure(responseStream, requestAbortController);
      finishPhase(phases, eventToRequestStartedAt, "eventToRequestMs");
      logFields = requestLogFields(request, "aws-lambda");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        type: "router:request:start",
      });
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
      const preload = awsLambdaRenderPreload(options, runtimePreloadPromise, defaultPreloadMode);
      const response = await builtRuntime.render(request, {
        dehydrateOptions: options.dehydrateOptions,
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
      await streamResponseToLambda(
        response,
        responseStream,
        runtime,
        phases,
        requestAbortController,
      );
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

      if (requestAbortController.signal.aborted) {
        return;
      }

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

      await streamResponseToLambda(
        response,
        responseStream,
        runtime,
        phases,
        requestAbortController,
      );
    } finally {
      requestLifecycle?.dispose();
    }
  });
}

async function applyAwsLambdaResponseHook(
  response: Response,
  options: Pick<AwsLambdaRequestHandlerOptions, "onResponse">,
  request: Request | undefined,
): Promise<Response> {
  if (request === undefined) {
    return response;
  }

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
  signal?: AbortSignal,
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
  const protocol = lambdaRequestProtocol(headers, options);
  const method = event.requestContext.http.method;
  const init: RequestInit = {
    headers,
    method,
    ...(signal === undefined ? {} : { signal }),
  };

  if (method !== "GET" && method !== "HEAD" && event.body !== undefined) {
    init.body = event.isBase64Encoded === true ? Buffer.from(event.body, "base64") : event.body;
  }

  return new Request(lambdaRequestUrl(protocol, host, event.rawPath, event.rawQueryString), init);
}

function lambdaRequestUrl(
  protocol: "http" | "https",
  host: string,
  rawPath: string,
  rawQueryString: string,
): URL {
  if (hasInvalidLambdaRequestAuthorityCharacter(host)) {
    throw new TypeError("AWS Lambda request Host is not a valid URL authority");
  }

  const url = new URL(`${protocol}://${host}`);
  if (
    url.protocol !== `${protocol}:` ||
    url.host === "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("AWS Lambda request Host is not a valid URL authority");
  }

  url.pathname = rawPath;
  url.search = rawQueryString;
  return url;
}

function hasInvalidLambdaRequestAuthorityCharacter(host: string): boolean {
  for (const character of host) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      character === "/" ||
      character === "?" ||
      character === "#" ||
      character === "\\" ||
      character === "@" ||
      character.trim() === "" ||
      codePoint < 0x20 ||
      codePoint === 0x7f
    ) {
      return true;
    }
  }

  return false;
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
    typeof (candidate as { requestContext: { http?: unknown } }).requestContext.http !== "object" ||
    (candidate as { requestContext: { http?: unknown } }).requestContext.http === null ||
    typeof (candidate as { requestContext: { http: { method?: unknown } } }).requestContext.http
      .method !== "string" ||
    (candidate as { requestContext: { http: { method: string } } }).requestContext.http.method ===
      ""
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

function lambdaHostPolicy(options: AwsLambdaRequestHandlerOptions): RequestHostPolicy | undefined {
  return options.hostPolicy ?? (process.env.NODE_ENV === "production" ? "strict" : undefined);
}

function warnIfImplicitAwsLambdaHostPolicy(options: AwsLambdaRequestHandlerOptions): void {
  if (
    process.env.NODE_ENV !== "production" ||
    options.allowedHosts !== undefined ||
    options.hostPolicy !== undefined ||
    warnedImplicitAwsLambdaHostPolicy
  ) {
    return;
  }

  warnedImplicitAwsLambdaHostPolicy = true;
  console.error(
    '[mreact] AWS Lambda Host handling defaults to strict because neither allowedHosts nor hostPolicy is configured. Unlisted Host headers use the configured hostname or lambda.local. Set allowedHosts for public deployments or hostPolicy: "trusted-proxy" when a trusted reverse proxy normalizes Host.',
  );
}

function lambdaRequestProtocol(
  headers: Headers,
  options: AwsLambdaRequestHandlerOptions,
): "http" | "https" {
  if (options.trustForwardedProto === true) {
    return normalizeRequestProtocol(firstForwardedValue(headers.get("x-forwarded-proto")));
  }

  return "https";
}

function normalizeRequestProtocol(value: string | undefined): "http" | "https" {
  if (value === undefined || value === "") {
    return "https";
  }

  return value.toLowerCase() === "http" ? "http" : "https";
}

function awsLambdaEventLogFields(event: AwsLambdaHttpEventV2): RouterRequestLogFields {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    runtime: "aws-lambda",
  };
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
  requestAbortController?: AbortController,
): Promise<void> {
  if (isLambdaStreamingAborted(requestAbortController)) {
    return;
  }

  const stream = runtime.HttpResponseStream.from(
    responseStream,
    responseStreamingMetadata(response),
  );

  if (isLambdaStreamingAborted(requestAbortController)) {
    return;
  }

  try {
    if (response.body === null) {
      stream.end();
      return;
    }

    const reader = response.body.getReader();
    const lifecycle = observeLambdaStreamFailure(stream, requestAbortController);

    try {
      while (true) {
        const streamWaitStartedAt = phaseStartedAt(phases);
        const result = await readLambdaBodyWithAbort(reader, lifecycle.signal);
        addPhaseDuration(phases, streamWaitStartedAt, "streamWaitMs");

        if (lifecycle.signal.aborted) {
          throw lambdaAbortReason(lifecycle.signal);
        }

        if (result.done) {
          break;
        }

        const streamWriteStartedAt = phaseStartedAt(phases);
        await writeStreamingChunk(stream, result.value, lifecycle.signal);
        addPhaseDuration(phases, streamWriteStartedAt, "streamWriteMs");
      }

      if (lifecycle.signal.aborted) {
        throw lambdaAbortReason(lifecycle.signal);
      }
      stream.end();
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      requestAbortController?.abort(reason);
      try {
        await reader.cancel(reason);
      } catch {
        // The response body may already be errored or cancelled.
      }
      if (stream.destroyed !== true) {
        stream.destroy?.(reason);
      }
    } finally {
      lifecycle.dispose();
      reader.releaseLock();
    }
  } catch (error) {
    if (typeof stream.destroy === "function") {
      stream.destroy(error);
      return;
    }

    throw error;
  }
}

function isLambdaStreamingAborted(controller: AbortController | undefined): boolean {
  return controller?.signal.aborted === true;
}

function responseStreamingMetadata(response: Response): AwsLambdaStreamingResponseMetadata {
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
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    throw lambdaAbortReason(signal);
  }

  const accepted = stream.write(chunk);
  if (signal.aborted) {
    throw lambdaAbortReason(signal);
  }

  if (accepted !== false) {
    return;
  }

  if (typeof stream.once !== "function") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const dispose = (): void => {
      removeLambdaStreamListener(stream, "drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = (): void => {
      dispose();
      resolve();
    };
    const onAbort = (): void => {
      dispose();
      reject(lambdaAbortReason(signal));
    };
    addLambdaStreamListener(stream, "drain", onDrain);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function observeLambdaStreamFailure(
  stream: AwsLambdaStreamingResponseStream,
  abortController: AbortController = new AbortController(),
): {
  dispose(): void;
  signal: AbortSignal;
} {
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    removeLambdaStreamListener(stream, "close", onClose);
    removeLambdaStreamListener(stream, "error", onError);
  };
  const abort = (reason: Error): void => {
    abortController.abort(reason);
    dispose();
  };
  const onClose = (): void => {
    if (stream.writableEnded === true) {
      dispose();
      return;
    }
    abort(new Error("The AWS Lambda response stream closed during streaming."));
  };
  const onError = (error?: unknown): void => {
    abort(error instanceof Error ? error : new Error(String(error ?? "AWS Lambda stream error")));
  };

  const canRemoveListeners =
    typeof stream.off === "function" || typeof stream.removeListener === "function";
  if (canRemoveListeners) {
    addLambdaStreamListener(stream, "close", onClose);
    addLambdaStreamListener(stream, "error", onError);
  }
  if (abortController.signal.aborted) {
    dispose();
  } else if (stream.destroyed === true && stream.writableEnded !== true) {
    onClose();
  }

  return { dispose, signal: abortController.signal };
}

function readLambdaBodyWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    return Promise.reject(lambdaAbortReason(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      reject(lambdaAbortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function removeLambdaStreamListener(
  stream: AwsLambdaStreamingResponseStream,
  event: "close" | "drain" | "error",
  listener: (error?: unknown) => void,
): void {
  if (typeof stream.off === "function") {
    stream.off(event, listener);
    return;
  }
  stream.removeListener?.(event, listener);
}

function addLambdaStreamListener(
  stream: AwsLambdaStreamingResponseStream,
  event: "close" | "drain" | "error",
  listener: (error?: unknown) => void,
): void {
  const once = stream.once as
    | ((event: "close" | "drain" | "error", listener: (error?: unknown) => void) => unknown)
    | undefined;
  try {
    once?.call(stream, event, listener);
  } catch {
    // A structurally compatible drain-only stream may reject lifecycle event names.
  }
}

function lambdaAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("AWS Lambda response streaming was aborted.");
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
  const runtime = (globalThis as { awslambda?: Partial<AwsLambdaRuntime> | undefined }).awslambda;

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
