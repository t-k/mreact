import { describe, expect, it } from "vitest";
import { createAppFixture, responseText } from "@modular-react/test-utils";
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

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("requireSession lets valid sessions reach the protected route", async () => {
    const fixture = await createProtectedFixture();
    const sessions = createMemorySessionStore<{ roles: string[]; userId: string }>();
    setTestSessionStore(sessions);
    const loginResponse = new Response(null);
    await createSession(loginResponse, sessions, { roles: ["admin"], userId: "ada" });

    const response = await fixture.render("/admin", {
      request: {
        headers: { cookie: cookiePair(loginResponse) },
      },
    });

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("<main>Admin</main>");
  });

  it("requireRole redirects sessions that lack the required role", async () => {
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

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/forbidden");
  });
});

async function createProtectedFixture() {
  const fixture = await createAppFixture("mreact-auth-package");
  await fixture.write(
    "session-store.ts",
    `import { createMemorySessionStore } from "@modular-react/auth";

const globalKey = "__mreactAuthPackageTestSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<{
    roles?: string[];
    userId: string;
  }>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<{
    roles?: string[];
    userId: string;
  }>();`,
  );
  await fixture.write(
    "middleware.ts",
    `import { requireRole, requireSession } from "@modular-react/auth";
import { sessions } from "./session-store.ts";

export const config = { matcher: "/admin/:path*" };

export async function middleware(request: Request) {
  await requireSession(request, sessions, { redirectTo: "/login" });
  await requireRole(request, sessions, "admin", { forbiddenTo: "/forbidden" });
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

  return fixture;
}
