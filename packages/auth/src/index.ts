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

export interface AuthSessionClaims {
  permissions?: readonly string[] | undefined;
  roles?: readonly string[] | undefined;
}

export interface AuthGuardOptions extends SessionCookieOptions {
  forbiddenTo?: string | undefined;
  redirectTo?: string | undefined;
}

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

export async function getCurrentSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  return getSession(request, store, options);
}

export async function requireSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await getCurrentSession(request, store, options);

  if (session === undefined) {
    redirect(options.redirectTo ?? "/login");
  }

  return session;
}

export async function requireRole<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  role: string,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await requireSession(request, store, options);
  const result = authorizeSession(session.data, { roles: [role] });

  if (!result.authorized) {
    redirect(options.forbiddenTo ?? "/forbidden");
  }

  return session;
}

export async function requirePermission<TData extends AuthSessionClaims>(
  request: Request,
  store: SessionStore<TData>,
  permission: string,
  options: AuthGuardOptions = {},
): Promise<SessionRecord<TData>> {
  const session = await requireSession(request, store, options);
  const result = authorizeSession(session.data, { permissions: [permission] });

  if (!result.authorized) {
    redirect(options.forbiddenTo ?? "/forbidden");
  }

  return session;
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
