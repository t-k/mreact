import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createMemorySessionStore, createSession } from "../src/session.js";
import { renderAppRequest } from "../src/render.js";

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function setTestSessionStore(
  store: ReturnType<typeof createMemorySessionStore<{ userId: string }>>,
): void {
  (
    globalThis as typeof globalThis & {
      __mreactAuthTestSessions?: ReturnType<typeof createMemorySessionStore<{ userId: string }>>;
    }
  ).__mreactAuthTestSessions = store;
}

describe("session auth middleware", () => {
  test("middleware can redirect when getSession returns undefined", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-auth-middleware-redirect-"));
    await mkdir(join(appDir, "admin"), { recursive: true });
    await mkdir(join(appDir, "login"), { recursive: true });
    await writeFile(
      join(appDir, "session-store.ts"),
      `import { createMemorySessionStore } from "@reckona/mreact-router";

const globalKey = "__mreactAuthTestSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<{ userId: string }>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<{ userId: string }>();`,
    );
    await writeFile(
      join(appDir, "middleware.ts"),
      `import { getSession, redirect } from "@reckona/mreact-router";
import { sessions } from "./session-store.ts";

export const config = { matcher: "/admin/:path*" };

export async function middleware(request: Request) {
  const session = await getSession(request, sessions);
  if (session === undefined) {
    redirect("/login");
  }
}`,
    );
    await writeFile(
      join(appDir, "admin", "page.tsx"),
      "export default function Admin() { return <main>Admin</main>; }",
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      "export default function Login() { return <main>Login</main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/admin"),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
  });

  test("middleware lets a request with a valid session reach the protected page", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-auth-middleware-pass-"));
    await mkdir(join(appDir, "admin"), { recursive: true });
    await writeFile(
      join(appDir, "session-store.ts"),
      `import { createMemorySessionStore } from "@reckona/mreact-router";

const globalKey = "__mreactAuthTestSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<{ userId: string }>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<{ userId: string }>();`,
    );
    await writeFile(
      join(appDir, "middleware.ts"),
      `import { getSession, redirect } from "@reckona/mreact-router";
import { sessions } from "./session-store.ts";

export const config = { matcher: "/admin/:path*" };

export async function middleware(request: Request) {
  const session = await getSession(request, sessions);
  if (session === undefined) {
    redirect("/login");
  }
}`,
    );
    await writeFile(
      join(appDir, "admin", "page.tsx"),
      "export default function Admin() { return <main>Admin</main>; }",
    );

    const sessions = createMemorySessionStore<{ userId: string }>();
    setTestSessionStore(sessions);
    const loginResponse = new Response(null);
    await createSession(loginResponse, sessions, { userId: "ada" });
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/admin", {
        headers: { cookie: cookiePair(loginResponse) },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Admin</main>");
  });
});
