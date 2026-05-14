import {
  createMemorySessionStore,
  createSession,
  destroySession,
  getSession,
  redirect,
  rotateSession,
  type SessionCookieOptions,
  type SessionRecord,
  type SessionStore,
} from "@modular-react/router";

export { createMemorySessionStore, createSession, destroySession, getSession, rotateSession };
export type { SessionCookieOptions, SessionRecord, SessionStore };

export const __MREACT_AUTH_SESSION_SCRIPT_ID = "__mreact_auth_session";

export interface AuthSessionClaims {
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
}

interface ResolvedAuthConfig {
  forbiddenTo: string;
  redirectTo: string;
}

export type AuthRequirement = string | readonly string[];
export type AuthRequirementMode = "all" | "any";

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
};

export function configureAuth(config: AuthConfig): void {
  authConfig = {
    forbiddenTo: config.forbiddenTo ?? authConfig.forbiddenTo,
    redirectTo: config.redirectTo ?? authConfig.redirectTo,
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
  const claims = isSessionClaims(data) ? data : undefined;
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
    return isSessionClaims(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isSessionClaims(value: unknown): value is AuthSessionClaims {
  return typeof value === "object" && value !== null;
}

function authRuntimeState(): AuthRuntimeState {
  const global = globalThis as typeof globalThis & {
    [authRuntimeStateKey]?: AuthRuntimeState | undefined;
  };
  global[authRuntimeStateKey] ??= {};
  return global[authRuntimeStateKey];
}
