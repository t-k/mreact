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
export type { SessionCookieOptions, SessionRecord, SessionStore };

export const __MREACT_AUTH_SESSION_SCRIPT_ID = "__mreact_auth_session";

export interface AuthSessionClaims {
  [claim: string]: unknown;
  permissions?: readonly string[] | undefined;
  roles?: readonly string[] | undefined;
}

export interface AuthGuardOptions {
  forbiddenTo?: string | undefined;
  mode?: AuthRequirementMode | undefined;
  redirectTo?: string | undefined;
}

export interface AuthConfig {
  forbiddenTo?: string | undefined;
  redirectTo?: string | undefined;
  serializeClaims?: AuthClaimsSerializer | undefined;
}

interface ResolvedAuthConfig {
  forbiddenTo: string;
  redirectTo: string;
  serializeClaims: AuthClaimsSerializer;
}

export type AuthRequirement = string | readonly string[];
export type AuthRequirementMode = "all" | "any";
export type AuthClaimsSerializer = (data: unknown) => AuthSessionClaims | undefined;

export interface AuthorizationPolicy {
  permissions?: readonly string[] | undefined;
  roles?: readonly string[] | undefined;
}

export type AuthorizationResult =
  | {
      authorized: true;
    }
  | {
      authorized: false;
      reason: "missing-permission" | "missing-role";
    };

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
}

interface AuthRuntimeState {
  browserClaims?: AuthSessionClaims | undefined;
  currentClaims?: AuthSessionClaims | undefined;
  storage?:
    | {
        getStore(): AuthRuntimeRequestState | undefined;
      }
    | undefined;
}

let authConfig: ResolvedAuthConfig = {
  forbiddenTo: "/forbidden",
  redirectTo: "/login",
  serializeClaims: defaultSerializeSessionClaims,
};

export function configureAuth(config: AuthConfig): void {
  authConfig = {
    forbiddenTo: config.forbiddenTo ?? authConfig.forbiddenTo,
    redirectTo: config.redirectTo ?? authConfig.redirectTo,
    serializeClaims: config.serializeClaims ?? authConfig.serializeClaims,
  };
}

export async function getCurrentSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  const session = await getSession(request, store, options);

  setSessionClaims(session?.data);

  return session;
}

export async function requireSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await getCurrentSession(request, store);

  if (session === undefined) {
    redirect(authRedirectTo(options), { status: 303 });
  }

  return session;
}

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

export async function tryRequireRole<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  role: AuthRequirement,
  options: Pick<AuthGuardOptions, "mode"> = {},
): Promise<TryAuthResult<TData>> {
  const session = await getCurrentSession(request, store);

  if (session === undefined) {
    return { authorized: false, reason: "missing-session" };
  }

  const result = authorizeRequirement(session.data.roles, role, "missing-role", options.mode);

  return result.authorized ? { authorized: true, session } : result;
}

export async function tryRequirePermission<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  permission: AuthRequirement,
  options: Pick<AuthGuardOptions, "mode"> = {},
): Promise<TryAuthResult<TData>> {
  const session = await getCurrentSession(request, store);

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

export async function revokeCurrentSession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<void> {
  await destroyRouterSession(request, response, store, options);
  setSessionClaims(undefined);
}

export function getSessionClaims<TData extends AuthSessionClaims = AuthSessionClaims>():
  | TData
  | undefined {
  const state = authRuntimeState();
  const requestClaims = state.storage?.getStore()?.claims;

  if (requestClaims !== undefined) {
    return requestClaims as TData;
  }

  if (typeof document === "undefined") {
    return state.currentClaims as TData | undefined;
  }

  if (state.browserClaims === undefined) {
    state.browserClaims = readClaimsFromDocument();
  }

  return state.browserClaims as TData | undefined;
}

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
  return options.redirectTo ?? authConfig.redirectTo;
}

function authForbiddenTo(options: AuthGuardOptions): string {
  return options.forbiddenTo ?? authConfig.forbiddenTo;
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
  const claims = normalizeSessionClaims(authConfig.serializeClaims(data));
  const state = authRuntimeState();
  const requestState = state.storage?.getStore();

  if (requestState !== undefined) {
    requestState.claims = claims;
    return;
  }

  state.currentClaims = claims;
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
  const claims = normalizeSessionClaims(data);

  if (claims === undefined) {
    return undefined;
  }

  const safeClaims: AuthSessionClaims = {};

  if (claims.permissions !== undefined) {
    safeClaims.permissions = claims.permissions;
  }

  if (claims.roles !== undefined) {
    safeClaims.roles = claims.roles;
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
