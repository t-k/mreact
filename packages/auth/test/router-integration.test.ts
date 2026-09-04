import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, renderBuiltAppRequest } from "@reckona/mreact-router";
import { describe, expect, it } from "vitest";
import { createAppFixture, responseText } from "@reckona/mreact-test-utils";
import { __resetAuthForTesting, createMemorySessionStore, createSession } from "../src/index.js";

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

function testSessionStoreGlobal(): typeof globalThis & {
  __mreactAuthPackageTestSessions?: unknown;
} {
  return globalThis as typeof globalThis & {
    __mreactAuthPackageTestSessions?: unknown;
  };
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
    expect(html).toContain("<main>ada<!-- -->:<!-- -->admin</main>");
    expect(html).toContain('id="__mreact_auth_session"');
    expect(html).toContain('"userId":"ada"');
    expect(html).not.toContain("server-only");
    expect(html).not.toContain("refreshToken");
    expect(html).not.toContain("__mreact_action_nonce");
  });

  it("isolates zero-argument layout auth output across warm built requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-auth-layout-isolation-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const sessions = createMemorySessionStore<{ privateMarker: string; userId: string }>();
    const previousSessions = testSessionStoreGlobal().__mreactAuthPackageTestSessions;
    setTestSessionStore(sessions);

    try {
      await mkdir(join(appDir, "profile"), { recursive: true });
      await writeFile(
        join(appDir, "session-store.ts"),
        `import { createMemorySessionStore } from "@reckona/mreact-auth";

const globalKey = "__mreactAuthPackageTestSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<{
    privateMarker: string;
    userId: string;
  }>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<{
    privateMarker: string;
    userId: string;
  }>();`,
      );
      await writeFile(
        join(appDir, "layout.tsx"),
        `import { getSessionClaims } from "@reckona/mreact-auth";

export default function Layout() {
  const claims = getSessionClaims<{ privateMarker: string; userId: string }>();
  return <html><body><strong data-layout-user>{claims?.userId}:{claims?.privateMarker}</strong><Slot /></body></html>;
}`,
      );
      await writeFile(
        join(appDir, "profile", "page.tsx"),
        `import { configureAuth, requireSession } from "@reckona/mreact-auth";
import { sessions } from "../session-store.ts";

configureAuth({
  serializeClaims(data) {
    if (typeof data !== "object" || data === null || !("privateMarker" in data) || !("userId" in data)) {
      return undefined;
    }

    return {
      privateMarker: String(data.privateMarker),
      userId: String(data.userId),
    };
  },
});

export async function loader({ request }: { request: Request }) {
  await requireSession(request, sessions);
}

export default function ProfilePage() {
  return <main>Profile</main>;
}`,
      );
      await buildApp({ appDir, outDir });

      const firstLogin = new Response(null);
      await createSession(firstLogin, sessions, {
        privateMarker: "FIRST_USER_PRIVATE_MARKER",
        userId: "ada",
      });
      const secondLogin = new Response(null);
      await createSession(secondLogin, sessions, {
        privateMarker: "SECOND_USER_PRIVATE_MARKER",
        userId: "grace",
      });

      const first = await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/profile", {
          headers: { cookie: cookiePair(firstLogin) },
        }),
      });
      const second = await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/profile", {
          headers: { cookie: cookiePair(secondLogin) },
        }),
      });
      const firstHtml = await first.text();
      const secondHtml = await second.text();

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(firstHtml).toContain("ada<!-- -->:<!-- -->FIRST_USER_PRIVATE_MARKER");
      expect(firstHtml).not.toContain("SECOND_USER_PRIVATE_MARKER");
      expect(secondHtml).toContain("grace<!-- -->:<!-- -->SECOND_USER_PRIVATE_MARKER");
      expect(secondHtml).not.toContain("FIRST_USER_PRIVATE_MARKER");
    } finally {
      const testGlobal = testSessionStoreGlobal();
      if (previousSessions === undefined) {
        delete testGlobal.__mreactAuthPackageTestSessions;
      } else {
        testGlobal.__mreactAuthPackageTestSessions = previousSessions;
      }
      __resetAuthForTesting();
      await rm(rootDir, { force: true, recursive: true });
    }
  }, 15_000);
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
