import { afterEach, describe, expect, it } from "vitest";
import {
  __resetAuthForTesting,
  configureAuth,
  authorizeSession,
  createMemorySessionStore,
  createSession,
  getSessionClaims,
  getCurrentSession,
  refreshSession,
  requirePermission,
  requireRole,
  requireSession,
  revokeCurrentSession,
  tryRequirePermission,
  tryRequireRole,
} from "../src/index.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  __resetAuthForTesting();
  configureAuth({ forbiddenTo: "/forbidden", redirectTo: "/login" });
});

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("auth package", () => {
  it("reads the current session from a request", async () => {
    const store = createMemorySessionStore<{ userId: string }>();
    const loginResponse = new Response(null);
    const session = await createSession(loginResponse, store, { userId: "ada" });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await expect(getCurrentSession(request, store)).resolves.toMatchObject({
      data: { userId: "ada" },
      id: session.id,
    });
  });

  it("requireSession returns the session when present", async () => {
    const store = createMemorySessionStore<{ userId: string }>();
    const loginResponse = new Response(null);
    const session = await createSession(loginResponse, store, { userId: "ada" });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await expect(requireSession(request, store)).resolves.toMatchObject({
      id: session.id,
    });
  });

  it("uses secure production cookie defaults through session exports", async () => {
    process.env.NODE_ENV = "production";
    const store = createMemorySessionStore<{ userId: string }>();
    const response = new Response(null);

    await createSession(response, store, { userId: "ada" });

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith("__Host-mreact.session=")).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toMatch(/;\s*Domain=/i);
  });

  it("refreshSession rotates the current session and updates claims", async () => {
    const store = createMemorySessionStore<{
      permissions: string[];
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    const current = await createSession(loginResponse, store, {
      permissions: ["profile:read"],
      roles: ["member"],
      userId: "ada",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });
    const refreshResponse = new Response(null);

    const refreshed = await refreshSession(request, refreshResponse, store);

    expect(refreshed).toMatchObject({
      data: { userId: "ada" },
      rotatedAt: expect.any(Number),
    });
    expect(refreshed?.id).not.toBe(current.id);
    expect(await store.get(current.id)).toBeUndefined();
    expect(await store.get(refreshed?.id ?? "")).toMatchObject({
      data: { userId: "ada" },
    });
    expect(getSessionClaims()).toEqual({
      permissions: ["profile:read"],
      roles: ["member"],
    });
    expect(cookiePair(refreshResponse)).not.toBe(cookiePair(loginResponse));
  });

  it("revokeCurrentSession deletes the current session, clears claims, and expires the cookie", async () => {
    const store = createMemorySessionStore<{
      permissions: string[];
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    const session = await createSession(loginResponse, store, {
      permissions: ["profile:read"],
      roles: ["member"],
      userId: "ada",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });
    await getCurrentSession(request, store);
    expect(getSessionClaims()).toEqual({
      permissions: ["profile:read"],
      roles: ["member"],
    });
    const revokeResponse = new Response(null);

    await revokeCurrentSession(request, revokeResponse, store);

    expect(await store.get(session.id)).toBeUndefined();
    expect(getSessionClaims()).toBeUndefined();
    const cookie = revokeResponse.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("mreact.session=");
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it("authorizes roles and permissions with fail-closed defaults", () => {
    expect(
      authorizeSession(
        { roles: ["admin"], permissions: ["settings:write"], userId: "ada" },
        { permissions: ["settings:write"], roles: ["admin"] },
      ),
    ).toEqual({ authorized: true });

    expect(authorizeSession({ userId: "ada" }, { roles: ["admin"] })).toEqual({
      authorized: false,
      reason: "missing-role",
    });
    expect(
      authorizeSession(
        { permissions: ["settings:read"], userId: "ada" },
        { permissions: ["settings:write"] },
      ),
    ).toEqual({
      authorized: false,
      reason: "missing-permission",
    });
  });

  it("requireRole and requirePermission return authorized sessions", async () => {
    const store = createMemorySessionStore<{
      permissions: string[];
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, {
      permissions: ["settings:write"],
      roles: ["admin"],
      userId: "ada",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await expect(requireRole(request, store, "admin")).resolves.toMatchObject({
      data: { userId: "ada" },
    });
    await expect(requirePermission(request, store, "settings:write")).resolves.toMatchObject({
      data: { userId: "ada" },
    });
  });

  it("supports any-of and all-of role requirements", async () => {
    const store = createMemorySessionStore<{
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, {
      roles: ["support", "editor"],
      userId: "grace",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await expect(requireRole(request, store, ["admin", "support"])).resolves.toMatchObject({
      data: { userId: "grace" },
    });
    await expect(
      requireRole(request, store, ["support", "editor"], { mode: "all" }),
    ).resolves.toMatchObject({
      data: { userId: "grace" },
    });
    await expect(
      requireRole(request, store, ["admin", "owner"], { mode: "all" }),
    ).rejects.toMatchObject({
      location: "/forbidden",
      status: 303,
    });
  });

  it("supports any-of and all-of permission requirements", async () => {
    const store = createMemorySessionStore<{
      permissions: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, {
      permissions: ["audit:read", "settings:write"],
      userId: "ada",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await expect(
      requirePermission(request, store, ["audit:write", "audit:read"]),
    ).resolves.toMatchObject({
      data: { userId: "ada" },
    });
    await expect(
      requirePermission(request, store, ["audit:read", "settings:write"], { mode: "all" }),
    ).resolves.toMatchObject({
      data: { userId: "ada" },
    });
  });

  it("tryRequireRole and tryRequirePermission return tagged results without redirects", async () => {
    const store = createMemorySessionStore<{
      permissions: string[];
      roles: string[];
      userId: string;
    }>();
    const missingRequest = new Request("https://app.test/");
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, {
      permissions: ["audit:read"],
      roles: ["member"],
      userId: "ada",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await expect(tryRequireRole(missingRequest, store, "admin")).resolves.toEqual({
      authorized: false,
      reason: "missing-session",
    });
    await expect(tryRequireRole(request, store, "admin")).resolves.toEqual({
      authorized: false,
      reason: "missing-role",
    });
    await expect(tryRequirePermission(request, store, "audit:write")).resolves.toEqual({
      authorized: false,
      reason: "missing-permission",
    });
    await expect(tryRequirePermission(request, store, "audit:read")).resolves.toMatchObject({
      authorized: true,
      session: { data: { userId: "ada" } },
    });
  });

  it("stores only default-safe session claims for server-side hand-off", async () => {
    const store = createMemorySessionStore<{
      permissions: string[];
      refreshToken: string;
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, {
      permissions: ["settings:write"],
      refreshToken: "server-only",
      roles: ["admin"],
      userId: "ada",
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await getCurrentSession(request, store);

    expect(getSessionClaims()).toEqual({
      permissions: ["settings:write"],
      roles: ["admin"],
    });
  });

  it("supports explicit custom session claim serialization", async () => {
    const store = createMemorySessionStore<{
      refreshToken: string;
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, {
      refreshToken: "server-only",
      roles: ["admin"],
      userId: "ada",
    });
    configureAuth({
      serializeClaims(data) {
        if (
          typeof data === "object" &&
          data !== null &&
          "roles" in data &&
          "userId" in data
        ) {
          return {
            roles: Array.isArray(data.roles) ? data.roles.filter(isString) : undefined,
            userId: String(data.userId),
          };
        }

        return undefined;
      },
    });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await getCurrentSession(request, store);

    expect(getSessionClaims<{ roles: string[]; userId: string }>()).toEqual({
      roles: ["admin"],
      userId: "ada",
    });
  });
});

function isString(value: unknown): value is string {
  return typeof value === "string";
}
