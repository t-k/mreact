import { describe, expect, it } from "vitest";
import { createAppFixture, responseText } from "@reckona/mreact-test-utils";
import { createMemorySessionStore, createSession } from "../src/index.js";

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function setTestSessionStore<TData>(
  store: ReturnType<typeof createMemorySessionStore<TData>>,
): void {
  (
    globalThis as typeof globalThis & {
      __mreactAuthPackageTestSessions?: ReturnType<typeof createMemorySessionStore<TData>>;
    }
  ).__mreactAuthPackageTestSessions = store;
}

describe("auth router integration", () => {
  it("requireSession redirects missing sessions from middleware", async () => {
    const fixture = await createProtectedFixture();

    const response = await fixture.render("/admin");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("requireSession lets valid sessions reach the protected route", async () => {
    const fixture = await createProtectedFixture();
    const sessions = createMemorySessionStore<{
      refreshToken: string;
      roles: string[];
      userId: string;
    }>();
    setTestSessionStore(sessions);
    const loginResponse = new Response(null);
    await createSession(loginResponse, sessions, {
      refreshToken: "server-only",
      roles: ["admin"],
      userId: "ada",
    });

    const response = await fixture.render("/admin", {
      request: {
        headers: { cookie: cookiePair(loginResponse) },
      },
    });

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("<main>Admin</main>");
  });

  it("requireRole redirects sessions that lack the required role with a 303", async () => {
    const fixture = await createProtectedFixture();
    const sessions = createMemorySessionStore<{ roles: string[]; userId: string }>();
    setTestSessionStore(sessions);
    const loginResponse = new Response(null);
    await createSession(loginResponse, sessions, { roles: ["member"], userId: "ada" });

    const response = await fixture.render("/admin", {
      request: {
        headers: { cookie: cookiePair(loginResponse) },
      },
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/forbidden");
  });

  it("configureAuth applies guard defaults and auth claims are handed off to opted-in routes", async () => {
    const fixture = await createProtectedFixture();
    const sessions = createMemorySessionStore<{ roles: string[]; userId: string }>();
    setTestSessionStore(sessions);
    const loginResponse = new Response(null);
    await createSession(loginResponse, sessions, { roles: ["admin"], userId: "ada" });

    const response = await fixture.render("/claims", {
      request: {
        headers: { cookie: cookiePair(loginResponse) },
      },
    });
    const html = await responseText(response);

    expect(response.status).toBe(200);
    expect(html).toContain("<main>ada:admin</main>");
    expect(html).toContain('id="__mreact_auth_session"');
    expect(html).toContain('"userId":"ada"');
    expect(html).not.toContain("server-only");
    expect(html).not.toContain("refreshToken");
    expect(html).not.toContain("__mreact_action_nonce");
  });
});

async function createProtectedFixture() {
  const fixture = await createAppFixture("mreact-auth-package");
  await fixture.write(
    "session-store.ts",
    `import { createMemorySessionStore } from "@reckona/mreact-auth";

const globalKey = "__mreactAuthPackageTestSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<{
    roles?: string[];
    userId: string;
  }>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<{
    refreshToken?: string;
    roles?: string[];
    userId: string;
  }>();`,
  );
  await fixture.write(
    "middleware.ts",
    `import { configureAuth, requireRole, requireSession } from "@reckona/mreact-auth";
import { sessions } from "./session-store.ts";

export const config = { matcher: "/admin/:path*" };

configureAuth({
  redirectTo: "/login",
  forbiddenTo: "/forbidden",
  serializeClaims(data) {
    if (typeof data !== "object" || data === null || !("userId" in data)) {
      return undefined;
    }

    return {
      roles: Array.isArray(data.roles) ? data.roles.filter((role): role is string => typeof role === "string") : undefined,
      userId: String(data.userId),
    };
  },
});

export async function middleware(request: Request) {
  await requireSession(request, sessions);
  await requireRole(request, sessions, "admin");
}`,
  );
  await fixture.write(
    "admin/page.tsx",
    "export default function Admin() { return <main>Admin</main>; }",
  );
  await fixture.write(
    "login/page.tsx",
    "export default function Login() { return <main>Login</main>; }",
  );
  await fixture.write(
    "forbidden/page.tsx",
    "export default function Forbidden() { return <main>Forbidden</main>; }",
  );
  await fixture.write(
    "claims/page.tsx",
    `import { configureAuth, getSessionClaims, requireSession } from "@reckona/mreact-auth";
import { sessions } from "../session-store.ts";

export const auth = "include-claims";

configureAuth({
  serializeClaims(data) {
    if (typeof data !== "object" || data === null || !("userId" in data)) {
      return undefined;
    }

    return {
      roles: Array.isArray(data.roles) ? data.roles.filter((role): role is string => typeof role === "string") : undefined,
      userId: String(data.userId),
    };
  },
});

export async function loader({ request }: { request: Request }) {
  await requireSession(request, sessions);
}

export default function ClaimsPage() {
  const claims = getSessionClaims<{ roles: string[]; userId: string }>();
  return <main>{claims?.userId}:{claims?.roles.join(",")}</main>;
}`,
  );

  return fixture;
}
