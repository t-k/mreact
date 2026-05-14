import { afterEach, describe, expect, it } from "vitest";
import {
  configureAuth,
  authorizeSession,
  createMemorySessionStore,
  createSession,
  getSessionClaims,
  getCurrentSession,
  requirePermission,
  requireRole,
  requireSession,
  tryRequirePermission,
  tryRequireRole,
} from "../src/index.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
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

  it("stores the current session claims for server-side hand-off", async () => {
    const store = createMemorySessionStore<{
      roles: string[];
      userId: string;
    }>();
    const loginResponse = new Response(null);
    await createSession(loginResponse, store, { roles: ["admin"], userId: "ada" });
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await getCurrentSession(request, store);

    expect(getSessionClaims()).toEqual({ roles: ["admin"], userId: "ada" });
  });
});
