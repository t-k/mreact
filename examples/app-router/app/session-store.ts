// In-memory session store, keyed by an opaque session id stored in a
// signed cookie. Sessions survive within the dev process but are reset
// on restart. For a real app, swap this for a database-backed store.
//
// `DemoSessionData` extends @reckona/mreact-auth's `AuthSessionClaims`
// shape (`roles?` / `permissions?`) so the auth helpers
// (`requireRole`, `requirePermission`, `authorizeSession`) can work
// against this session directly.
import { createMemorySessionStore, type AuthSessionClaims } from "@reckona/mreact-auth";

export interface DemoSessionData extends AuthSessionClaims {
  userId: string;
  roles: readonly string[];
}

const globalKey = "__mreactDemoSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<DemoSessionData>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<DemoSessionData>();
