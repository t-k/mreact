import {
  createMemorySessionStore,
  createSession,
  destroySession as destroyRouterSession,
  getSession,
  rotateSession as rotateRouterSession,
  type SessionCookieOptions,
  type SessionRecord,
  type SessionStore,
} from "@reckona/mreact-router/session";
import { getGlobalRuntimeState } from "@reckona/mreact-reactive-core/runtime-state";
import { redirect } from "@reckona/mreact-router";

export {
  createMemorySessionStore,
  createSession,
  destroyRouterSession as destroySession,
  getSession,
  rotateRouterSession as rotateSession,
};
/** Re-exports router session cookie, record, and store types for auth helpers. */
export type { SessionCookieOptions, SessionRecord, SessionStore };

/** Identifies the script element that carries serialized auth claims during hydration. */
export const __MREACT_AUTH_SESSION_SCRIPT_ID = "__mreact_auth_session";

/** Contains serializable auth claims exposed to role and permission checks. */
export interface AuthSessionClaims {
  [claim: string]: unknown;
  permissions?: readonly string[] | undefined;
  roles?: readonly string[] | undefined;
}

/** Configures redirects and requirement matching for auth guard helpers. */
export interface AuthGuardOptions extends SessionCookieOptions {
  forbiddenTo?: string | undefined;
  mode?: AuthRequirementMode | undefined;
  redirectTo?: string | undefined;
}

/** Configures process-wide auth defaults for redirects and claim serialization. */
export interface AuthConfig {
  forbiddenTo?: string | undefined;
  redirectTo?: string | undefined;
  serializeClaims?: AuthClaimsSerializer | undefined;
}

export interface AuthRequestOptions {
  config?: AuthConfig | undefined;
}

interface ResolvedAuthConfig {
  forbiddenTo: string;
  redirectTo: string;
  serializeClaims: AuthClaimsSerializer;
}

/** Names one required role or permission, or a set of acceptable values. */
export type AuthRequirement = string | readonly string[];

/** Controls whether all listed auth requirements or any one requirement must match. */
export type AuthRequirementMode = "all" | "any";

/** Converts raw session data into serializable claims for auth checks and hydration. */
export type AuthClaimsSerializer = (data: unknown) => AuthSessionClaims | undefined;

/** Describes role and permission claims required for authorization. */
export interface AuthorizationPolicy {
  permissions?: readonly string[] | undefined;
  roles?: readonly string[] | undefined;
}

/** Reports whether claims satisfy an authorization policy and why they fail. */
export type AuthorizationResult =
  | {
      authorized: true;
    }
  | {
      authorized: false;
      reason: "missing-permission" | "missing-role";
    };

/** Reports a session-bearing auth guard result without redirecting. */
export type TryAuthResult<TData> =
  | {
      authorized: true;
      session: SessionRecord<TData>;
    }
  | {
      authorized: false;
      reason: "missing-permission" | "missing-role" | "missing-session";
    };

const authRuntimeStateKey = "__mreactAuthRuntimeState";

interface AuthRuntimeRequestState {
  claims?: AuthSessionClaims | undefined;
  config?: AuthConfig | undefined;
}

interface AuthRequestStorage {
  getStore(): AuthRuntimeRequestState | undefined;
  run<T>(store: AuthRuntimeRequestState, callback: () => T): T;
}

interface AuthRuntimeState {
  browserClaims?: AuthSessionClaims | undefined;
  currentClaims?: AuthSessionClaims | undefined;
  storage?: AuthRequestStorage | undefined;
}

let authConfig: ResolvedAuthConfig = {
  forbiddenTo: "/forbidden",
  redirectTo: "/login",
  serializeClaims: defaultSerializeSessionClaims,
};

/**
 * Updates the process-wide auth defaults used by the guard helpers.
 *
 * Configure redirect targets and claim serialization before handling requests that call `requireSession()`, `requireRole()`, or `requirePermission()`.
 * For per-request or per-tenant overrides, pass `config` to `runWithAuthRequest()` instead of calling `configureAuth()` while requests are in flight.
 */
export function configureAuth(config: AuthConfig): void {
  authConfig = {
    forbiddenTo: config.forbiddenTo ?? authConfig.forbiddenTo,
    redirectTo: config.redirectTo ?? authConfig.redirectTo,
    serializeClaims: config.serializeClaims ?? authConfig.serializeClaims,
  };
}

/**
 * Runs server-side auth work inside an AsyncLocalStorage-backed request scope.
 *
 * Use this around custom server rendering or tests so `getSessionClaims()` can read request-local claims.
 */
export async function runWithAuthRequest<T>(
  fn: () => T | Promise<T>,
  options: AuthRequestOptions = {},
): Promise<Awaited<T>> {
  const storage = await authRequestStorage();

  return await storage.run(options.config === undefined ? {} : { config: options.config }, fn);
}

/**
 * Reads the current session and stores serialized claims for the active auth request scope.
 */
export async function getCurrentSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  const session = await getSession(request, store, options);

  setSessionClaims(session?.data);

  return session;
}

/**
 * Requires an active session or redirects to the configured login route.
 */
export async function requireSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await getCurrentSession(request, store, options);

  if (session === undefined) {
    redirect(authRedirectTo(options), { status: 303 });
  }

  return session;
}

/**
 * Requires an active session with the requested role or redirects to the configured forbidden route.
 */
export async function requireRole<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  role: AuthRequirement,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await requireSession(request, store, options);
  const result = authorizeRequirement(session.data.roles, role, "missing-role", options.mode);

  if (!result.authorized) {
    redirect(authForbiddenTo(options), { status: 303 });
  }

  return session;
}

/**
 * Requires an active session with the requested permission or redirects to the configured forbidden route.
 */
export async function requirePermission<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  permission: AuthRequirement,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await requireSession(request, store, options);
  const result = authorizeRequirement(
    session.data.permissions,
    permission,
    "missing-permission",
    options.mode,
  );

  if (!result.authorized) {
    redirect(authForbiddenTo(options), { status: 303 });
  }

  return session;
}

/**
 * Checks for a role without redirecting, returning a discriminated authorization result.
 */
export async function tryRequireRole<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  role: AuthRequirement,
  options: Pick<AuthGuardOptions, "mode"> & SessionCookieOptions = {},
): Promise<TryAuthResult<TData>> {
  const session = await getCurrentSession(request, store, options);

  if (session === undefined) {
    return { authorized: false, reason: "missing-session" };
  }

  const result = authorizeRequirement(session.data.roles, role, "missing-role", options.mode);

  return result.authorized ? { authorized: true, session } : result;
}

/**
 * Checks for a permission without redirecting, returning a discriminated authorization result.
 */
export async function tryRequirePermission<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  permission: AuthRequirement,
  options: Pick<AuthGuardOptions, "mode"> & SessionCookieOptions = {},
): Promise<TryAuthResult<TData>> {
  const session = await getCurrentSession(request, store, options);

  if (session === undefined) {
    return { authorized: false, reason: "missing-session" };
  }

  const result = authorizeRequirement(
    session.data.permissions,
    permission,
    "missing-permission",
    options.mode,
  );

  return result.authorized ? { authorized: true, session } : result;
}

/**
 * Evaluates session claims against required roles and permissions without reading cookies or redirecting.
 */
export function authorizeSession<TData extends AuthSessionClaims>(
  data: TData,
  policy: AuthorizationPolicy,
): AuthorizationResult {
  if (!hasAll(data.roles, policy.roles)) {
    return {
      authorized: false,
      reason: "missing-role",
    };
  }

  if (!hasAll(data.permissions, policy.permissions)) {
    return {
      authorized: false,
      reason: "missing-permission",
    };
  }

  return { authorized: true };
}

/**
 * Rotates the current session id and refreshes request-local claims.
 */
export async function refreshSession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  const session = await rotateRouterSession(request, response, store, options);

  setSessionClaims(session?.data);

  return session;
}

/**
 * Destroys the current session and clears request-local claims.
 */
export async function revokeCurrentSession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<void> {
  await destroyRouterSession(request, response, store, options);
  setSessionClaims(undefined);
}

/**
 * Returns the claims captured by `getCurrentSession()` for the current request or hydrated browser document.
 *
 * Server code should call it inside `runWithAuthRequest()` so concurrent requests do not share claim state.
 */
export function getSessionClaims<TData extends AuthSessionClaims = AuthSessionClaims>():
  | TData
  | undefined {
  const state = authRuntimeState();
  const requestClaims = state.storage?.getStore()?.claims;

  if (requestClaims !== undefined) {
    return requestClaims as TData;
  }

  if (typeof document === "undefined") {
    warnMissingAuthRequestScope();
    return undefined;
  }

  if (state.browserClaims === undefined) {
    state.browserClaims = readClaimsFromDocument();
  }

  return state.browserClaims as TData | undefined;
}

/** Resets process-wide auth configuration and cached claims for tests. */
export function __resetAuthForTesting(): void {
  authConfig = {
    forbiddenTo: "/forbidden",
    redirectTo: "/login",
    serializeClaims: defaultSerializeSessionClaims,
  };
  const state = authRuntimeState();
  state.browserClaims = undefined;
  state.currentClaims = undefined;
  const requestState = state.storage?.getStore();
  if (requestState !== undefined) {
    requestState.claims = undefined;
    requestState.config = undefined;
  }
}

function authorizeRequirement(
  available: readonly string[] | undefined,
  requirement: AuthRequirement,
  reason: "missing-permission" | "missing-role",
  mode: AuthRequirementMode = "any",
): AuthorizationResult {
  const required = Array.isArray(requirement) ? requirement : [requirement];
  const authorized = mode === "all" ? hasAll(available, required) : hasAny(available, required);

  return authorized ? { authorized: true } : { authorized: false, reason };
}

function authRedirectTo(options: AuthGuardOptions): string {
  return options.redirectTo ?? authRequestConfig()?.redirectTo ?? authConfig.redirectTo;
}

function authForbiddenTo(options: AuthGuardOptions): string {
  return options.forbiddenTo ?? authRequestConfig()?.forbiddenTo ?? authConfig.forbiddenTo;
}

function hasAll(
  available: readonly string[] | undefined,
  required: readonly string[] | undefined,
): boolean {
  if (required === undefined || required.length === 0) {
    return true;
  }

  if (available === undefined || available.length === 0) {
    return false;
  }

  const values = new Set(available);

  return required.every((value) => values.has(value));
}

function hasAny(
  available: readonly string[] | undefined,
  required: readonly string[] | undefined,
): boolean {
  if (required === undefined || required.length === 0) {
    return true;
  }

  if (available === undefined || available.length === 0) {
    return false;
  }

  const values = new Set(available);

  return required.some((value) => values.has(value));
}

function setSessionClaims(data: unknown): void {
  const serializer = authRequestConfig()?.serializeClaims ?? authConfig.serializeClaims;
  const claims = normalizeSessionClaims(serializer(data));
  const state = authRuntimeState();
  const requestState = state.storage?.getStore();

  if (requestState !== undefined) {
    requestState.claims = claims;
    return;
  }

  if (typeof document === "undefined") {
    return;
  }

  state.currentClaims = claims;
}

function authRequestConfig(): AuthConfig | undefined {
  return authRuntimeState().storage?.getStore()?.config;
}

async function authRequestStorage(): Promise<AuthRequestStorage> {
  const state = authRuntimeState();
  if (state.storage === undefined) {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    state.storage ??= new AsyncLocalStorage<AuthRuntimeRequestState>();
  }

  return state.storage;
}

function warnMissingAuthRequestScope(): void {
  console.warn(
    "mreact auth session claims were read on the server without an active auth request scope. Wrap custom server work in runWithAuthRequest().",
  );
}

function readClaimsFromDocument(): AuthSessionClaims | undefined {
  const node = document.getElementById(__MREACT_AUTH_SESSION_SCRIPT_ID);

  if (node?.textContent === undefined || node.textContent === "") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(node.textContent) as unknown;
    return normalizeSessionClaims(parsed);
  } catch {
    return undefined;
  }
}

function defaultSerializeSessionClaims(data: unknown): AuthSessionClaims | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const claims = data as AuthSessionClaims;
  const roles = normalizeStringArray(claims.roles);
  const permissions = normalizeStringArray(claims.permissions);

  if (
    (claims.roles !== undefined && roles === undefined) ||
    (claims.permissions !== undefined && permissions === undefined)
  ) {
    return undefined;
  }

  const safeClaims: AuthSessionClaims = {};

  if (permissions !== undefined) {
    safeClaims.permissions = permissions;
  }

  if (roles !== undefined) {
    safeClaims.roles = roles;
  }

  return Object.keys(safeClaims).length === 0 ? undefined : safeClaims;
}

function normalizeSessionClaims(value: unknown): AuthSessionClaims | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const claims = value as AuthSessionClaims;
  const roles = normalizeStringArray(claims.roles);
  const permissions = normalizeStringArray(claims.permissions);

  if (
    (claims.roles !== undefined && roles === undefined) ||
    (claims.permissions !== undefined && permissions === undefined)
  ) {
    return undefined;
  }

  return {
    ...claims,
    ...(permissions === undefined ? {} : { permissions }),
    ...(roles === undefined ? {} : { roles }),
  };
}

function normalizeStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function authRuntimeState(): AuthRuntimeState {
  return getGlobalRuntimeState(authRuntimeStateKey, () => ({}));
}
