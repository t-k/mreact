# @reckona/mreact-auth

`@reckona/mreact-auth` provides session and authorization helpers for the mreact
app router. It layers role and permission guards plus client claims hand-off on
top of the router's cookie/session integration points.

## Basic Usage

```ts
import { configureAuth, getCurrentSession, requireRole } from "@reckona/mreact-auth";
import { sessionStore } from "./session-store";

configureAuth({
  redirectTo: "/login",
  forbiddenTo: "/forbidden",
  serializeClaims(data) {
    if (typeof data !== "object" || data === null) {
      return undefined;
    }

    return {
      roles: Array.isArray(data.roles)
        ? data.roles.filter((role): role is string => typeof role === "string")
        : undefined,
      userId: "userId" in data ? String(data.userId) : undefined,
    };
  },
});

export async function loader({ request }) {
  const session = await getCurrentSession(request, sessionStore);
  await requireRole(request, sessionStore, ["admin", "editor"]);
  return { user: session?.claims };
}
```

## Core APIs

- `configureAuth()` sets app-wide redirect and forbidden defaults.
- `createMemorySessionStore()`, `createSession()`, `getSession()`,
  `destroySession()`, and `rotateSession()` are the canonical low-level session
  helper imports for application code.
- `refreshSession()` rotates the current session cookie and synchronizes the
  request-local claims cache.
- `revokeCurrentSession()` deletes the current session, emits an expired cookie,
  and clears the request-local claims cache.
- `getCurrentSession()` returns the current request session.
- `requireRole()` and `requirePermission()` redirect or reject when the policy is not met.
- `tryRequireRole()` and `tryRequirePermission()` return a boolean policy result.
- `getSessionClaims()` reads session claims on both server and client hand-off paths.
- `runWithAuthRequest()` creates an explicit request-local claims scope for custom server handlers that call auth helpers outside the app router request lifecycle, and can receive per-request auth config overrides.

## Router Integration

Set `export const auth = "include-claims"` in a page module when the router should
embed session claims into the HTML response. Client components can then call
`getSessionClaims()` without passing claims through every page prop.

By default, the hand-off includes only authorization claims: `roles` and
`permissions`. Use `configureAuth({ serializeClaims })` to expose additional
browser-safe fields, such as a public user id. Do not return server-only values
such as refresh tokens or provider secrets from the serializer.

Custom server code that calls `getCurrentSession()`, `refreshSession()`, or `revokeCurrentSession()` and then reads `getSessionClaims()` outside `renderAppRequest()` should wrap that request's work in `runWithAuthRequest()`. Server calls without an active request scope return `undefined` rather than falling back to a shared module-global claims value. Per-tenant handlers can pass `runWithAuthRequest(() => work(), { config })` to override redirect targets or claim serialization for that request without mutating process-wide defaults.
