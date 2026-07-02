import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectFormActionExpressionReferences,
  hasModuleDirective,
} from "@reckona/mreact-compiler";
import {
  createServerActionHandler,
  type ServerActionHandlerOptions,
  type ServerActionRegistry,
  type ServerActionReplayStore,
  type ServerActionRequestReference,
  type ServerActionValidationResult,
} from "@reckona/mreact-server";
import { bundleRouterModule, type RouterCompatBuildApi } from "./bundle-pipeline.js";
import { type AppRouterCache, withRouteCacheContext } from "./cache.js";
import { fileImportMetaUrlPlugin, importAppRouterSourceModule } from "./module-runner.js";
import { createAppRouterImportPolicyPlugin, type AppRouterImportPolicy } from "./import-policy.js";
import { cookies, type RequestCookies } from "./navigation.js";
export {
  createFormCsrfToken,
  formCsrfCookie,
  formCsrfFieldName,
  serverActionCookie,
  validateFormCsrf,
} from "./csrf.js";
import {
  formCsrfFieldName,
  readExistingFormCsrfToken,
  serverActionCookieName,
  validateFormCsrf,
} from "./csrf.js";
import {
  collectRuntimeInferredServerActions,
  type ServerActionInferenceDiagnostic,
} from "./server-action-inference.js";

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

function isLocalServerActionEnvironment(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}
const formFieldModuleId = "__mreact_module_id";
const formFieldExportName = "__mreact_export_name";
const formFieldNonce = "__mreact_action_nonce";
const formFieldActionToken = "__mreact_action_token";
const csrfTokenPlaceholder = "__mreact_action_csrf_placeholder__";
const actionNoncePlaceholder = "__mreact_action_nonce_placeholder__";
const MIN_ACTION_TOKEN_SECRET_BYTES = 32;
const actionTokenSecret = configuredActionTokenSecret(process.env.MREACT_SERVER_ACTION_SECRET);
// Bounded default replay store for form-action nonces. The previous
// implementation was an unbounded Set that grew with every successful
// submission (Issue 069). Production callers should still pass a shared
// store (Redis / KV) via `serverActions.replayStore` for multi-instance
// deployments -- this default only guarantees replay protection within
// a single process and is the safe fallback for dev / single-node setups.
//
// Retention model:
// - TTL: 10 minutes. Form nonces are minted at SSR time and the user
//   has to submit before the cookie's SameSite=Lax window anyway; this
//   is generous for any realistic submit cadence.
// - Max size: 50_000 entries. Old entries are evicted FIFO once the cap
//   is reached so a flood cannot trigger OOM.
//
// Both bounds are intentional defaults -- tight enough that a single
// process cannot leak unbounded RSS, loose enough that legitimate
// traffic does not trip false-positive 409s.
const DEFAULT_REPLAY_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REPLAY_MAX_ENTRIES = 50_000;
const DEFAULT_ACTION_BODY_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_ACTION_FORM_MAX_FIELDS = 1_000;
let warnedUnrestrictedServerActions = false;

/**
 * Request context passed to authorized server actions.
 *
 * It exposes normalized cookies, headers, and the original `Request`. `clientIp` is reserved for trusted adapter integrations and is omitted by the default header-only dispatcher because forwarded IP headers are attacker-controlled without a trusted proxy boundary.
 */
export interface ServerActionContext {
  clientIp?: string | undefined;
  cookies: RequestCookies;
  headers: Headers;
  request: Request;
}

function defaultActionTokenSecret(): string {
  if (isProductionEnvironment()) {
    console.warn(
      "mreact-router: MREACT_SERVER_ACTION_SECRET is not set. Inferred server action tokens use a per-process secret and may fail across multiple production instances.",
    );
  }

  return randomBytes(32).toString("base64url");
}

function configuredActionTokenSecret(value: string | undefined): string {
  if (value === undefined) {
    return defaultActionTokenSecret();
  }

  if (Buffer.byteLength(value, "utf8") < MIN_ACTION_TOKEN_SECRET_BYTES) {
    throw new Error(
      `MREACT_SERVER_ACTION_SECRET must be at least ${MIN_ACTION_TOKEN_SECRET_BYTES} bytes.`,
    );
  }

  return value;
}

class BoundedReplayStore {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  has(value: string): boolean {
    const expiresAt = this.entries.get(value);
    if (expiresAt === undefined) return false;
    if (expiresAt < Date.now()) {
      this.entries.delete(value);
      return false;
    }
    return true;
  }

  add(value: string): void {
    const now = Date.now();
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.entries().next().value;
      if (oldest !== undefined) {
        const [key, expiresAt] = oldest;
        this.entries.delete(key);
        if (expiresAt < now) {
          while (this.entries.size >= this.maxEntries) {
            const nextOldest = this.entries.entries().next().value;
            if (nextOldest === undefined || nextOldest[1] >= now) {
              break;
            }
            this.entries.delete(nextOldest[0]);
          }
        }
      }
    }
    this.entries.set(value, now + this.ttlMs);
  }

  // Exposed for tests; not part of the ServerActionReplayStore interface.
  size(): number {
    return this.entries.size;
  }
}

const usedFormActionNonces = new BoundedReplayStore(
  DEFAULT_REPLAY_TTL_MS,
  DEFAULT_REPLAY_MAX_ENTRIES,
);

// Test helpers: drop all entries between cases / expose the bounded store
// so tests can drive its eviction semantics directly. Not part of the
// public surface (prefixed with `__`).
export function __clearDefaultReplayStore(): void {
  (usedFormActionNonces as unknown as { entries: Map<string, number> }).entries.clear();
}

export function __readDefaultReplayStore(): BoundedReplayStore {
  return usedFormActionNonces;
}

/**
 * Configures app-router server action dispatch, authorization, body limits, and replay protection.
 *
 * Production multi-instance deployments should provide a shared `replayStore` and a stable `MREACT_SERVER_ACTION_SECRET`.
 */
export interface AppRouterServerActionOptions {
  allowedActions?: readonly AppRouterAllowedServerAction[] | "any" | undefined;
  authorize?: ServerActionHandlerOptions["authorize"] | undefined;
  maxBodyBytes?: number | undefined;
  maxFormFields?: number | undefined;
  replayStore?: ServerActionReplayStore | undefined;
}

/**
 * Describes a server action request reference that the app router may dispatch.
 */
export interface AppRouterAllowedServerAction extends ServerActionRequestReference {
  inferred?: boolean | undefined;
}

export interface PreparedRouteActions {
  actionNonce?: string;
  code: string;
  csrfToken?: string;
  diagnostics?: ServerActionInferenceDiagnostic[] | undefined;
  htmlReplacements?: readonly (readonly [string, string])[] | undefined;
  // True when the cookie should be (re)set on the response. False means
  // the incoming request already carried a valid CSRF cookie that the
  // render is reusing -- skipping Set-Cookie avoids cookie thrash across
  // concurrent tabs (Issue 070).
  csrfTokenIsNew?: boolean;
  hasFormActions: boolean;
}

interface ActionReference {
  exportName: string;
  expression?: string | undefined;
  inferred: boolean;
  moduleId: string;
}

/**
 * Identifies an inferred form action expression rewritten during route preparation.
 */
export interface PreparedFormActionReference {
  end: number;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  exportName: string;
  inferred: boolean;
  moduleId: string;
  sourceHash: string;
  start: number;
}

const inferredServerActionReferences = new Map<string, Map<string, Map<string, ActionReference>>>();

export async function prepareRouteServerActions(options: {
  appDir: string;
  code: string;
  formActionReferences?: readonly PreparedFormActionReference[] | undefined;
  placeholders?: boolean | undefined;
  pageFile: string;
  request?: Request | undefined;
}): Promise<PreparedRouteActions> {
  if (options.formActionReferences !== undefined && options.formActionReferences.length === 0) {
    replaceInferredServerActionReferences(options.appDir, options.pageFile, new Map());
    return { code: options.code, hasFormActions: false };
  }

  if (!hasFormActionCandidate(options.code, options.pageFile)) {
    replaceInferredServerActionReferences(options.appDir, options.pageFile, new Map());
    return { code: options.code, hasFormActions: false };
  }

  const inference =
    options.formActionReferences === undefined
      ? await collectImportedServerActions(options)
      : {
          diagnostics: [],
          references: formActionReferenceMap(options.code, options.formActionReferences),
        };
  const { diagnostics, references } = inference;

  if (references.size === 0) {
    replaceInferredServerActionReferences(options.appDir, options.pageFile, new Map());
    return diagnostics.length === 0
      ? { code: options.code, hasFormActions: false }
      : { code: options.code, diagnostics, hasFormActions: false };
  }

  // Reuse the existing CSRF token when the browser already sent one.
  // Rotating the cookie on every render (Issue 070) broke concurrent
  // forms because the older tab's hidden input no longer matched the
  // cookie value. The actionNonce stays per-render -- that is the field
  // tied to a specific submission via replay protection.
  const existingToken = readExistingFormCsrfToken(options.request);
  const csrfToken = existingToken ?? randomUUID();
  const csrfTokenIsNew = existingToken === undefined;
  const actionNonce = randomUUID();
  const usePlaceholders =
    options.placeholders === true && canUseStableFormActionPlaceholders(references);
  const lowered = lowerFormActions({
    actionNonce,
    code: options.code,
    csrfToken,
    placeholders: usePlaceholders,
    references,
  });

  if (lowered === options.code) {
    replaceInferredServerActionReferences(options.appDir, options.pageFile, new Map());
    return diagnostics.length === 0
      ? { code: options.code, hasFormActions: false }
      : { code: options.code, diagnostics, hasFormActions: false };
  }

  replaceInferredServerActionReferences(options.appDir, options.pageFile, references);

  return {
    actionNonce,
    code: lowered,
    csrfToken,
    csrfTokenIsNew,
    diagnostics,
    hasFormActions: true,
    ...(usePlaceholders
      ? { htmlReplacements: formActionHtmlReplacements({ actionNonce, csrfToken, references }) }
      : {}),
  };
}

export function prepareRouteServerActionPlaceholders(options: {
  code: string;
  formActionReferences: readonly PreparedFormActionReference[];
}): string {
  const references = formActionReferenceMap(options.code, options.formActionReferences);

  if (references.size === 0) {
    return options.code;
  }

  if (!canUseStableFormActionPlaceholders(references)) {
    return options.code;
  }

  return lowerFormActions({
    actionNonce: actionNoncePlaceholder,
    code: options.code,
    csrfToken: csrfTokenPlaceholder,
    placeholders: true,
    references,
  });
}

function canUseStableFormActionPlaceholders(
  references: ReadonlyMap<string, ActionReference>,
): boolean {
  return [...references.values()].every(
    (reference) =>
      reference.expression === reference.exportName &&
      /^[A-Za-z_$][\w$]*$/u.test(reference.expression),
  );
}

function formActionReferenceMap(
  code: string,
  references: readonly PreparedFormActionReference[],
): Map<string, ActionReference> {
  const sourceHash = formActionSourceHash(code);

  return new Map(
    references
      .filter((reference) => reference.sourceHash === sourceHash)
      .map((reference) => [
        formActionOccurrenceKey(reference),
        {
          exportName: reference.exportName,
          expression: reference.expression,
          inferred: reference.inferred,
          moduleId: reference.moduleId,
        },
      ]),
  );
}

function hasFormActionCandidate(code: string, filename: string): boolean {
  return collectFormActionExpressionReferences({ code, filename }).length > 0;
}

export async function dispatchServerActionRequest(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
  renderSingleFlightNavigation?: ((options: {
    path: string;
    request: Request;
    revalidatedPaths: readonly string[];
  }) => Promise<Response | undefined>) | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActionCacheVersion?: string | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}): Promise<Response> {
  const { revalidatedPaths, value } = await withRouteCacheContext(options.routeCache, () =>
    dispatchServerActionRequestWithoutCacheContext(options),
  );
  const singleFlight = await renderSingleFlightActionResponse({
    render: options.renderSingleFlightNavigation,
    request: options.request,
    response: value,
    revalidatedPaths,
  });

  return withRevalidationHeader(singleFlight ?? value, revalidatedPaths);
}

async function dispatchServerActionRequestWithoutCacheContext(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
  serverActionCacheVersion?: string | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}): Promise<Response> {
  // Validate everything we can statically before touching the filesystem
  // / bundler. A flood of malformed POSTs must not pay the registry-load
  // cost (Issue 067).
  if (options.request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const bodySizeResponse = validateServerActionBodySize(
    options.request,
    options.serverActions?.maxBodyBytes ?? DEFAULT_ACTION_BODY_MAX_BYTES,
  );
  if (bodySizeResponse !== undefined) {
    return bodySizeResponse;
  }

  const originResponse = validateServerActionRequestOrigin(options.request);
  if (originResponse !== undefined) {
    return originResponse;
  }

  const contentType = options.request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const manifestResponse = validateServerActionManifest(options.serverActions?.allowedActions);
    if (manifestResponse !== undefined) {
      return manifestResponse;
    }

    // JSON path delegates CSRF/replay to createServerActionHandler. The
    // registry is still needed here, but the handler short-circuits on
    // CSRF mismatch before invoking the action.
    let registry: ServerActionRegistry;
    try {
      registry = await loadServerActionRegistry({
        appDir: options.appDir,
        cacheVersion: options.serverActionCacheVersion,
        importPolicy: options.importPolicy,
      });
    } catch (error) {
      return jsonResponse(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }

    const replayStore = options.serverActions?.replayStore ?? usedFormActionNonces;
    const handle = createServerActionHandler(jsonServerActionRegistry({
      allowedActions: options.serverActions?.allowedActions,
      appDir: options.appDir,
      registry,
    }), {
      ...(options.serverActions?.authorize === undefined
        ? {}
        : { authorize: options.serverActions.authorize }),
      ...(options.serverActions?.allowedActions === undefined ||
      options.serverActions.allowedActions === "any"
        ? {}
        : { allowedActions: jsonAllowedServerActions(options.serverActions.allowedActions) }),
      csrf: { cookieName: serverActionCookieName() },
      maxBodyBytes: options.serverActions?.maxBodyBytes ?? DEFAULT_ACTION_BODY_MAX_BYTES,
      replayProtection: { seen: replayStore },
    });

    return handle(options.request);
  }

  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return jsonResponse({ ok: false, error: "Unsupported server action content type." }, 415);
  }

  const manifestResponse = validateServerActionManifest(options.serverActions?.allowedActions);
  if (manifestResponse !== undefined) {
    return manifestResponse;
  }

  const boundedRequest = await readServerActionRequestWithLimit(
    options.request,
    options.serverActions?.maxBodyBytes ?? DEFAULT_ACTION_BODY_MAX_BYTES,
  );
  if (boundedRequest instanceof Response) {
    return boundedRequest;
  }

  const formData = await boundedRequest.formData();
  const fieldCountResponse = validateServerActionFormFieldCount(
    formData,
    options.serverActions?.maxFormFields ?? DEFAULT_ACTION_FORM_MAX_FIELDS,
  );

  if (fieldCountResponse !== undefined) {
    return fieldCountResponse;
  }

  const csrfResponse = validateFormCsrf(options.request, formData);

  if (csrfResponse !== undefined) {
    return csrfResponse;
  }

  const moduleId = stringFormValue(formData.get(formFieldModuleId));
  const exportName = stringFormValue(formData.get(formFieldExportName));
  const nonce = stringFormValue(formData.get(formFieldNonce));

  if (moduleId === undefined || exportName === undefined || nonce === undefined) {
    return jsonResponse({ ok: false, error: "Invalid server action reference." }, 400);
  }

  if (!isAllowedServerAction({ moduleId, exportName }, options.serverActions?.allowedActions)) {
    return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
  }

  if (
    isInferredServerActionReference({
      allowedActions: options.serverActions?.allowedActions,
      appDir: options.appDir,
      exportName,
      moduleId,
    }) &&
    !isValidFormActionToken({
      csrfToken: stringFormValue(formData.get(formCsrfFieldName)),
      exportName,
      moduleId,
      nonce,
      token: stringFormValue(formData.get(formFieldActionToken)),
    })
  ) {
    return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
  }

  const nonceResponse = validateFormNonce(
    formData,
    options.serverActions?.replayStore ?? usedFormActionNonces,
  );

  if (nonceResponse !== undefined) {
    return nonceResponse;
  }

  let registry: ServerActionRegistry;
  try {
    registry = await loadServerActionRegistry({
      appDir: options.appDir,
      cacheVersion: options.serverActionCacheVersion,
      importPolicy: options.importPolicy,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }

  const action = registry[`${moduleId}#${exportName}`];

  if (typeof action !== "function") {
    return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
  }

  const actionFormData = cleanActionFormData(formData);
  const authorizationResponse = await authorizeFormAction({
    args: [actionFormData],
    authorize: options.serverActions?.authorize,
    exportName,
    moduleId,
    request: options.request,
  });

  if (authorizationResponse !== undefined) {
    return authorizationResponse;
  }

  try {
    const value = await action(actionFormData, createServerActionContext(options.request));

    if (value instanceof Response) {
      return value;
    }

    if (value === undefined || value === null) {
      return redirectToFormReferer(options.request);
    }

    return jsonResponse({ ok: true, value }, 200);
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

function createServerActionContext(request: Request): ServerActionContext {
  const clientIp = clientIpFromRequest(request);

  return {
    ...(clientIp === undefined ? {} : { clientIp }),
    cookies: cookies(request),
    headers: request.headers,
    request,
  };
}

function clientIpFromRequest(request: Request): string | undefined {
  void request;
  return undefined;
}

function validateServerActionBodySize(
  request: Request,
  maxBodyBytes: number,
): Response | undefined {
  if (!Number.isFinite(maxBodyBytes) || maxBodyBytes < 0) {
    return undefined;
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength === null) {
    return undefined;
  }

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return jsonResponse({ ok: false, error: "Invalid Content-Length header." }, 400);
  }

  if (bytes > maxBodyBytes) {
    return jsonResponse({ ok: false, error: "Server action request body is too large." }, 413);
  }

  return undefined;
}

async function readServerActionRequestWithLimit(
  request: Request,
  maxBodyBytes: number,
): Promise<Request | Response> {
  if (!Number.isFinite(maxBodyBytes) || maxBodyBytes < 0) {
    return request;
  }

  const body = request.body;
  if (body === null) {
    return request;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return jsonResponse({ ok: false, error: "Server action request body is too large." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, {
    body: buffer,
    headers,
    method: request.method,
  });
}

function validateServerActionFormFieldCount(
  formData: FormData,
  maxFormFields: number,
): Response | undefined {
  if (!Number.isFinite(maxFormFields) || maxFormFields < 0) {
    return undefined;
  }

  let count = 0;
  for (const _ of formData.keys()) {
    count += 1;
    if (count > maxFormFields) {
      return jsonResponse({
        ok: false,
        error: "Server action form field count is too large.",
      }, 413);
    }
  }

  return undefined;
}

function redirectToFormReferer(request: Request): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: sameOriginRefererPath(request) ?? "/",
    },
  });
}

async function renderSingleFlightActionResponse(options: {
  render:
    | ((options: {
      path: string;
      request: Request;
      revalidatedPaths: readonly string[];
    }) => Promise<Response | undefined>)
    | undefined;
  request: Request;
  response: Response;
  revalidatedPaths: readonly string[];
}): Promise<Response | undefined> {
  if (
    options.render === undefined ||
    options.revalidatedPaths.length === 0 ||
    options.request.headers.get("x-mreact-action-single-flight") !== "1" ||
    !isFormActionRedirectResponse(options.response)
  ) {
    return undefined;
  }

  const path = sameOriginResponseLocationPath(options.request, options.response);

  if (path === undefined || !options.revalidatedPaths.includes(normalizeActionPath(path))) {
    return undefined;
  }

  const rendered = await options.render({
    path,
    request: options.request,
    revalidatedPaths: options.revalidatedPaths,
  });

  if (rendered === undefined) {
    return undefined;
  }

  rendered.headers.set("x-mreact-action-single-flight", "1");
  return rendered;
}

function isFormActionRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400 && response.headers.has("location");
}

function sameOriginResponseLocationPath(request: Request, response: Response): string | undefined {
  const location = response.headers.get("location");

  if (location === null) {
    return undefined;
  }

  try {
    const requestUrl = new URL(request.url);
    const locationUrl = new URL(location, requestUrl);

    return locationUrl.origin === requestUrl.origin
      ? `${locationUrl.pathname}${locationUrl.search}`
      : undefined;
  } catch {
    return undefined;
  }
}

function sameOriginRefererPath(request: Request): string | undefined {
  const referer = request.headers.get("referer");

  if (referer === null) {
    return undefined;
  }

  try {
    const requestUrl = new URL(request.url);
    const refererUrl = new URL(referer, requestUrl);

    return refererUrl.origin === requestUrl.origin
      ? `${refererUrl.pathname}${refererUrl.search}`
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeActionPath(path: string): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return withoutTrailing === "" ? "/" : withoutTrailing;
}

function withRevalidationHeader(response: Response, paths: string[]): Response {
  if (paths.length > 0) {
    response.headers.set("x-mreact-revalidate", paths.join(","));
  }

  return response;
}

async function authorizeFormAction(options: {
  args: unknown[];
  authorize?: ServerActionHandlerOptions["authorize"];
  exportName: string;
  moduleId: string;
  request: Request;
}): Promise<Response | undefined> {
  const reference: ServerActionRequestReference = {
    exportName: options.exportName,
    moduleId: options.moduleId,
  };
  const authorizationResult = await options.authorize?.(options.request, reference, options.args);

  return authorizationResult !== undefined && authorizationResult !== true
    ? jsonResponse(
        {
          ok: false,
          error: authorizationError(authorizationResult),
        },
        403,
      )
    : undefined;
}

function authorizationError(result: Exclude<ServerActionValidationResult, true>): string {
  return typeof result === "string" ? result : "Server action not authorized.";
}

function jsonAllowedServerActions(
  allowedActions: readonly AppRouterAllowedServerAction[],
): ServerActionRequestReference[] {
  return allowedActions
    .filter((reference) => reference.inferred !== true)
    .map((reference) => ({
      exportName: reference.exportName,
      moduleId: reference.moduleId,
    }));
}

function jsonServerActionRegistry(options: {
  allowedActions: readonly AppRouterAllowedServerAction[] | "any" | undefined;
  appDir: string;
  registry: ServerActionRegistry;
}): ServerActionRegistry {
  const inferredKeys = new Set<string>();

  for (const reference of inferredServerActionReferencesForApp(options.appDir).values()) {
    inferredKeys.add(serverActionKey(reference));
  }

  if (Array.isArray(options.allowedActions)) {
    for (const reference of options.allowedActions) {
      if (reference.inferred === true) {
        inferredKeys.add(serverActionKey(reference));
      }
    }
  }

  if (inferredKeys.size === 0) {
    return options.registry;
  }

  const registry: ServerActionRegistry = {};

  for (const [key, value] of Object.entries(options.registry)) {
    if (!inferredKeys.has(key)) {
      registry[key] = value;
    }
  }

  return registry;
}

function serverActionKey(reference: ServerActionRequestReference): string {
  return `${reference.moduleId}#${reference.exportName}`;
}

function isAllowedServerAction(
  reference: ServerActionRequestReference,
  allowedActions: readonly AppRouterAllowedServerAction[] | "any" | undefined,
): boolean {
  if (allowedActions === undefined) {
    warnIfUnrestrictedServerActions(allowedActions);
    return true;
  }

  if (allowedActions === "any") {
    return true;
  }

  return allowedActions.some(
    (allowed) =>
      allowed.moduleId === reference.moduleId && allowed.exportName === reference.exportName,
  );
}

function warnIfUnrestrictedServerActions(
  allowedActions: readonly AppRouterAllowedServerAction[] | "any" | undefined,
): void {
  if (
    allowedActions !== undefined ||
    isLocalServerActionEnvironment() ||
    warnedUnrestrictedServerActions
  ) {
    return;
  }

  warnedUnrestrictedServerActions = true;
  console.warn(
    "[mreact] Server actions are running without an allowedActions manifest. Built app-router deployments generate this manifest automatically; direct production integrations should pass serverActions.allowedActions.",
  );
}

function validateServerActionManifest(
  allowedActions: readonly AppRouterAllowedServerAction[] | "any" | undefined,
): Response | undefined {
  if (allowedActions !== undefined || isLocalServerActionEnvironment()) {
    return undefined;
  }

  return jsonResponse({ ok: false, error: "Server action manifest required." }, 403);
}

function lowerFormActions(options: {
  actionNonce: string;
  code: string;
  csrfToken: string;
  placeholders?: boolean | undefined;
  references: Map<string, ActionReference>;
}): string {
  let code = options.code;
  const formReferences = collectFormActionExpressionReferences({ code: options.code });

  for (const formReference of [...formReferences].reverse()) {
    const reference = options.references.get(formActionOccurrenceKey(formReference));

    if (reference === undefined) {
      continue;
    }

    const opening = code.slice(formReference.start, formReference.end);
    const loweredOpening = lowerFormActionOpening({
      actionNonce: options.actionNonce,
      csrfToken: options.csrfToken,
      opening,
      placeholders: options.placeholders === true,
      reference,
      referenceName: formReference.expression,
    });

    if (loweredOpening === opening) {
      continue;
    }

    code = `${code.slice(0, formReference.start)}${loweredOpening}${code.slice(formReference.end)}`;
  }

  return code;
}

function formActionHtmlReplacements(options: {
  actionNonce: string;
  csrfToken: string;
  references: ReadonlyMap<string, ActionReference>;
}): readonly (readonly [string, string])[] {
  const replacements: Array<readonly [string, string]> = [
    [csrfTokenPlaceholder, options.csrfToken],
    [actionNoncePlaceholder, options.actionNonce],
  ];
  const seenTokens = new Set<string>();

  for (const reference of options.references.values()) {
    const placeholder = actionTokenPlaceholder(reference);

    if (seenTokens.has(placeholder)) {
      continue;
    }

    seenTokens.add(placeholder);
    replacements.push([
      placeholder,
      formActionToken({
        csrfToken: options.csrfToken,
        exportName: reference.exportName,
        moduleId: reference.moduleId,
        nonce: options.actionNonce,
      }),
    ]);
  }

  return replacements;
}

function formActionOccurrenceKey(reference: {
  end: number;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  start: number;
}): string {
  return [
    reference.start,
    reference.end,
    reference.expressionStart,
    reference.expressionEnd,
    reference.expression,
  ].join(":");
}

function formActionSourceHash(code: string): string {
  return createHash("sha256").update(code).digest("base64url");
}

function lowerFormActionOpening(options: {
  actionNonce: string;
  csrfToken: string;
  opening: string;
  placeholders: boolean;
  reference: ActionReference;
  referenceName: string;
}): string {
  const actionPattern = new RegExp(
    `^(?<prefix><form\\b[\\s\\S]*?)\\saction=\\{${escapeRegExp(options.referenceName)}\\}(?<suffix>[\\s\\S]*?)>$`,
    "u",
  );
  const match = options.opening.match(actionPattern);
  const prefix = match?.groups?.prefix;
  const suffix = match?.groups?.suffix;

  if (prefix === undefined || suffix === undefined) {
    return options.opening;
  }

  const attrs = `${prefix.slice("<form".length)}${suffix}`.replace(
    /\s+method=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g,
    "",
  );
  const hidden = [
    hiddenInput(formFieldModuleId, options.reference.moduleId),
    hiddenInput(formFieldExportName, options.reference.exportName),
    hiddenInput(
      formCsrfFieldName,
      options.placeholders ? csrfTokenPlaceholder : options.csrfToken,
    ),
    hiddenInput(
      formFieldNonce,
      options.placeholders ? actionNoncePlaceholder : options.actionNonce,
    ),
    hiddenInput(
      formFieldActionToken,
      options.placeholders
        ? actionTokenPlaceholder(options.reference)
        : formActionToken({
            csrfToken: options.csrfToken,
            exportName: options.reference.exportName,
            moduleId: options.reference.moduleId,
            nonce: options.actionNonce,
          }),
    ),
  ].join("");

  return `<form${attrs} method="post" action="/_mreact/actions">${hidden}`;
}

function actionTokenPlaceholder(reference: ActionReference): string {
  return `__mreact_action_token_${createHash("sha256")
    .update(reference.moduleId)
    .update("\0")
    .update(reference.exportName)
    .digest("hex")
    .slice(0, 16)}__`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hiddenInput(name: string, value: string): string {
  return `<input type="hidden" name="${escapeAttribute(name)}" value="${escapeAttribute(value)}" />`;
}

async function collectImportedServerActions(options: {
  appDir: string;
  code: string;
  pageFile: string;
}): Promise<{
  diagnostics: ServerActionInferenceDiagnostic[];
  references: Map<string, ActionReference>;
}> {
  return await collectRuntimeInferredServerActions({
    appDir: options.appDir,
    code: options.code,
    fileSystem: {
      isUseServerFile,
      resolveSourceFile,
    },
    pageFile: options.pageFile,
  });
}

function isInferredServerActionReference(options: {
  allowedActions: readonly AppRouterAllowedServerAction[] | "any" | undefined;
  appDir: string;
  exportName: string;
  moduleId: string;
}): boolean {
  if (
    Array.isArray(options.allowedActions) &&
    options.allowedActions.some(
      (allowed) =>
        allowed.inferred === true &&
        allowed.moduleId === options.moduleId &&
        allowed.exportName === options.exportName,
    )
  ) {
    return true;
  }

  return inferredServerActionReferencesForApp(options.appDir).has(
    `${options.moduleId}#${options.exportName}`,
  );
}

function formActionToken(options: {
  csrfToken: string;
  exportName: string;
  moduleId: string;
  nonce: string;
}): string {
  return createHmac("sha256", actionTokenSecret)
    .update(options.moduleId)
    .update("\0")
    .update(options.exportName)
    .update("\0")
    .update(options.csrfToken)
    .update("\0")
    .update(options.nonce)
    .digest("base64url");
}

function isValidFormActionToken(options: {
  csrfToken: string | undefined;
  exportName: string;
  moduleId: string;
  nonce: string;
  token: string | undefined;
}): boolean {
  if (options.csrfToken === undefined || options.token === undefined) {
    return false;
  }

  const expected = Buffer.from(
    formActionToken({
      csrfToken: options.csrfToken,
      exportName: options.exportName,
      moduleId: options.moduleId,
      nonce: options.nonce,
    }),
  );
  const actual = Buffer.from(options.token);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function replaceInferredServerActionReferences(
  appDir: string,
  pageFile: string,
  references: ReadonlyMap<string, ActionReference>,
): void {
  const nextReferences = new Map(
    Array.from(references.values())
      .filter((reference) => reference.inferred)
      .map((reference) => [`${reference.moduleId}#${reference.exportName}`, reference]),
  );
  let appReferencesByPage = inferredServerActionReferences.get(appDir);
  const previousReferences = appReferencesByPage?.get(pageFile) ?? new Map();
  const changed = !sameActionReferenceKeys(previousReferences, nextReferences);

  if (!changed) {
    return;
  }

  if (nextReferences.size === 0) {
    appReferencesByPage?.delete(pageFile);
    if (appReferencesByPage?.size === 0) {
      inferredServerActionReferences.delete(appDir);
    }
  } else {
    if (appReferencesByPage === undefined) {
      appReferencesByPage = new Map();
      inferredServerActionReferences.set(appDir, appReferencesByPage);
    }
    appReferencesByPage.set(pageFile, nextReferences);
  }

  clearServerActionRegistryCacheForApp(appDir);
}

// Cache the (expensive) collect+bundle+evaluate work keyed by appDir +
// caller-supplied version. Production callers pass the build-time hash
// (serverModuleCacheVersion) so the registry is reused for the lifetime
// of one deployment. Dev callers omit the version; the entry is then
// keyed on "dev" so the work happens once per process — restarts handle
// invalidation. Concurrent callers share a single in-flight promise.
const serverActionRegistryCache = new Map<string, Promise<ServerActionRegistry>>();

async function loadServerActionRegistry(options: {
  appDir: string;
  cacheVersion?: string | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<ServerActionRegistry> {
  const cacheKey = `${options.appDir}::${options.cacheVersion ?? "dev"}`;
  const cached = serverActionRegistryCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pending = buildServerActionRegistry(options).catch((error) => {
    // Drop the failed promise so a retry can re-run the load.
    serverActionRegistryCache.delete(cacheKey);
    throw error;
  });
  serverActionRegistryCache.set(cacheKey, pending);
  return pending;
}

async function buildServerActionRegistry(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<ServerActionRegistry> {
  const files = await collectFiles(options.appDir);
  const registry: ServerActionRegistry = {};
  const inferredReferences = inferredServerActionReferencesForApp(options.appDir);

  for (const file of files) {
    const moduleId = moduleIdForFile(options.appDir, file);
    const inferredExportNames = inferredExportNamesForModule(inferredReferences, moduleId);
    const useServerFile = await isUseServerFile(file);

    if (!useServerFile && inferredExportNames.size === 0) {
      continue;
    }

    const module = await importServerActionModule({
      appDir: options.appDir,
      file,
      importPolicy: options.importPolicy,
    });

    for (const [exportName, value] of Object.entries(module)) {
      if (typeof value === "function" && (useServerFile || inferredExportNames.has(exportName))) {
        registry[`${moduleId}#${exportName}`] = value as (...args: unknown[]) => unknown;
      }
    }
  }

  return registry;
}

// Exposed for tests that need a clean slate between cases (in-process state).
export function __clearServerActionRegistryCache(): void {
  serverActionRegistryCache.clear();
  inferredServerActionReferences.clear();
}

function clearServerActionRegistryCacheForApp(appDir: string): void {
  const prefix = `${appDir}::`;

  for (const key of serverActionRegistryCache.keys()) {
    if (key.startsWith(prefix)) {
      serverActionRegistryCache.delete(key);
    }
  }
}

function sameActionReferenceKeys(
  left: ReadonlyMap<string, ActionReference>,
  right: ReadonlyMap<string, ActionReference>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const key of left.keys()) {
    if (!right.has(key)) {
      return false;
    }
  }

  return true;
}

function inferredServerActionReferencesForApp(appDir: string): Map<string, ActionReference> {
  const references = new Map<string, ActionReference>();
  const appReferencesByPage = inferredServerActionReferences.get(appDir);

  if (appReferencesByPage === undefined) {
    return references;
  }

  for (const pageReferences of appReferencesByPage.values()) {
    for (const [key, reference] of pageReferences) {
      references.set(key, reference);
    }
  }

  return references;
}

function inferredExportNamesForModule(
  references: ReadonlyMap<string, ActionReference>,
  moduleId: string,
): Set<string> {
  const names = new Set<string>();

  for (const reference of references.values()) {
    if (reference.moduleId === moduleId) {
      names.add(reference.exportName);
    }
  }

  return names;
}

async function importServerActionModule(options: {
  appDir: string;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<Record<string, unknown>> {
  const bundled = await bundleRouterModule({
    code: `export * from ${JSON.stringify(options.file)};`,
    filename: options.file,
    platform: "node",
    plugins: [
      fileImportMetaUrlPlugin(),
      serverActionRuntimePlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Server action",
      }),
    ],
  });
  const code = bundled.code;

  if (code === undefined) {
    throw new Error(`Failed to compile server action module ${options.file}.`);
  }

  return importAppRouterSourceModule<Record<string, unknown>>({
    code,
    label: `server-action:${options.file}`,
  });
}

function serverActionRuntimePlugin() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const cachePath = join(currentDir, currentDir.endsWith(`${sep}dist`) ? "cache.js" : "cache.ts");

  return {
    name: "mreact-router-server-action-runtime",
    setup(buildApi: RouterCompatBuildApi) {
      buildApi.onResolve({ filter: /^@reckona\/mreact-router$/ }, () => ({
        namespace: "mreact-router-server-api",
        path: "index",
      }));
      buildApi.onLoad({ filter: /^index$/, namespace: "mreact-router-server-api" }, () => ({
        contents: `export { revalidatePath } from ${JSON.stringify(cachePath)};`,
        loader: "ts",
        resolveDir: dirname(cachePath),
      }));
    },
  };
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipServerActionScanDirectory(entry.name)) {
        continue;
      }

      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile() && /\.(?:mreact\.tsx|tsx|ts)$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

function shouldSkipServerActionScanDirectory(name: string): boolean {
  return name === "node_modules" || name === "__tests__" || name.startsWith(".");
}

async function resolveSourceFile(directory: string, source: string): Promise<string | undefined> {
  const base = join(directory, source);
  const tsEsmBase = /\.[cm]?js$/.test(base) ? base.replace(/\.[cm]?js$/, "") : undefined;
  const candidates = [
    base,
    ...(tsEsmBase === undefined
      ? []
      : [
          `${tsEsmBase}.ts`,
          `${tsEsmBase}.tsx`,
          `${tsEsmBase}.mreact.tsx`,
          join(tsEsmBase, "index.ts"),
          join(tsEsmBase, "index.tsx"),
        ]),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mreact.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

async function isUseServerFile(file: string): Promise<boolean> {
  const code = await readFile(file, "utf8");

  return hasModuleDirective({ code, directive: "use server", filename: file });
}

function moduleIdForFile(appDir: string, file: string): string {
  return relative(appDir, file).split(sep).join("/");
}

function validateServerActionRequestOrigin(request: Request): Response | undefined {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");

  if (origin !== null) {
    return origin === expectedOrigin
      ? undefined
      : jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
  }

  const referer = request.headers.get("referer");

  if (referer === null || isLocalServerActionEnvironment()) {
    return isLocalServerActionEnvironment()
      ? undefined
      : jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
  }

  try {
    return new URL(referer).origin === expectedOrigin
      ? undefined
      : jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
  } catch {
    return jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
  }
}

function validateFormNonce(
  formData: FormData,
  replayStore: ServerActionReplayStore,
): Response | undefined {
  const nonce = stringFormValue(formData.get(formFieldNonce));

  if (nonce === undefined || nonce.length === 0) {
    return jsonResponse({ ok: false, error: "Missing server action nonce." }, 400);
  }

  if (replayStore.has(nonce)) {
    return jsonResponse({ ok: false, error: "Server action nonce was already used." }, 409);
  }

  replayStore.add(nonce);
  return undefined;
}

function cleanActionFormData(formData: FormData): FormData {
  const cleaned = new FormData();

  for (const [name, value] of formData.entries()) {
    if (
      name !== formFieldModuleId &&
      name !== formFieldExportName &&
      name !== formCsrfFieldName &&
      name !== formFieldNonce &&
      name !== formFieldActionToken
    ) {
      cleaned.append(name, value);
    }
  }

  return cleaned;
}

function stringFormValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
