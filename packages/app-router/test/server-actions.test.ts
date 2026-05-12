import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AppRouterCache } from "../src/cache.js";
import { renderAppRequest } from "../src/render.js";

describe("mreact app server actions", () => {
  test("renders form action metadata for imported use-server actions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-render-"));
    await writeActionFixture(appDir);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.headers.get("set-cookie")).toContain("mreact.csrf=");
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/_mreact/actions"');
    expect(html).toContain('name="__mreact_module_id" value="actions.ts"');
    expect(html).toContain('name="__mreact_export_name" value="save"');
    expect(html).toContain('name="__mreact_csrf"');
    expect(html).toContain('name="__mreact_action_nonce"');
  });

  test("dispatches form posts to registered use-server actions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-post-"));
    await writeActionFixture(appDir);

    const pageResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const body = new URLSearchParams({
      __mreact_action_nonce: nonce,
      __mreact_csrf: csrf,
      __mreact_export_name: "save",
      __mreact_module_id: "actions.ts",
      title: "Ship app router",
    });

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: { title: "Ship app router" },
    });
    expect((globalThis as { __mreactActionCalls?: unknown[] }).__mreactActionCalls).toEqual([
      "Ship app router",
    ]);
  });

  test("dispatches JSON server action requests through the hardened transport", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-json-"));
    await writeActionFixture(appDir);
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: ["JSON title"],
          exportName: "echo",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-json",
          "x-mreact-action-nonce": "nonce-json",
          "x-mreact-csrf": "csrf-json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: { title: "JSON title" },
    });
  });

  test("authorizes JSON server action requests before invoking actions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-json-authorize-"));
    await writeActionFixture(appDir);
    const seen: unknown[] = [];
    const response = await renderAppRequest({
      appDir,
      serverActions: {
        authorize(_request, reference, args) {
          seen.push({ args, reference });
          return reference.exportName === "echo" ? "Denied by app policy." : true;
        },
      },
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: ["JSON title"],
          exportName: "echo",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-json-authorize",
          "x-mreact-action-nonce": "nonce-json-authorize",
          "x-mreact-csrf": "csrf-json-authorize",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Denied by app policy.",
    });
    expect(seen).toEqual([
      {
        args: ["JSON title"],
        reference: { exportName: "echo", moduleId: "actions.ts" },
      },
    ]);
  });

  test("authorizes form server action requests before invoking actions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-form-authorize-"));
    await writeActionFixture(appDir);
    const pageResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const seen: unknown[] = [];
    const response = await renderAppRequest({
      appDir,
      serverActions: {
        authorize(_request, reference, args) {
          const formData = args[0] as FormData;
          seen.push({
            reference,
            title: formData.get("title"),
          });
          return false;
        },
      },
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "save",
          __mreact_module_id: "actions.ts",
          title: "Blocked",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Server action not authorized.",
    });
    expect(seen).toEqual([
      {
        reference: { exportName: "save", moduleId: "actions.ts" },
        title: "Blocked",
      },
    ]);
    expect((globalThis as { __mreactActionCalls?: unknown[] }).__mreactActionCalls).not.toEqual([
      "Blocked",
    ]);
  });

  test("rejects JSON server action requests without a matching CSRF token", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-json-csrf-"));
    await writeActionFixture(appDir);
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: ["JSON title"],
          exportName: "echo",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-json",
          "x-mreact-action-nonce": "nonce-json-csrf",
          "x-mreact-csrf": "wrong",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid CSRF token.",
    });
  });

  test("rejects JSON server action nonce replay", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-json-replay-"));
    await writeActionFixture(appDir);
    const request = () =>
      renderAppRequest({
        appDir,
        request: new Request("http://local.test/_mreact/actions", {
          body: JSON.stringify({
            args: ["JSON title"],
            exportName: "echo",
            moduleId: "actions.ts",
          }),
          headers: {
            "content-type": "application/json",
            cookie: "mreact.csrf=csrf-json",
            "x-mreact-action-nonce": "nonce-json-replay",
            "x-mreact-csrf": "csrf-json",
          },
          method: "POST",
        }),
      });

    expect((await request()).status).toBe(200);
    const replay = await request();

    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual({
      ok: false,
      error: "Server action nonce was already used.",
    });
  });

  test("uses an injected replay store for JSON server action nonce checks", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-json-store-"));
    await writeActionFixture(appDir);
    const replayStore = createRecordingReplayStore();
    const response = await renderAppRequest({
      appDir,
      serverActions: { replayStore },
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: ["JSON title"],
          exportName: "echo",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-json-store",
          "x-mreact-action-nonce": "nonce-json-store",
          "x-mreact-csrf": "csrf-json-store",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(replayStore.calls).toEqual(["has:nonce-json-store", "add:nonce-json-store"]);
  });


  test("rejects form action replay nonce reuse", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-replay-"));
    await writeActionFixture(appDir);
    const pageResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

    const submit = () =>
      renderAppRequest({
        appDir,
        request: new Request("http://local.test/_mreact/actions", {
          body: new URLSearchParams({
            __mreact_action_nonce: nonce,
            __mreact_csrf: csrf,
            __mreact_export_name: "save",
            __mreact_module_id: "actions.ts",
            title: "Replay",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie,
          },
          method: "POST",
        }),
      });

    expect((await submit()).status).toBe(200);
    const replay = await submit();

    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual({
      ok: false,
      error: "Server action nonce was already used.",
    });
  });

  test("uses an injected replay store for form server action nonce checks", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-form-store-"));
    await writeActionFixture(appDir);
    const replayStore = createRecordingReplayStore();
    const pageResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await renderAppRequest({
      appDir,
      serverActions: { replayStore },
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "save",
          __mreact_module_id: "actions.ts",
          title: "Store",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(replayStore.calls).toEqual([`has:${nonce}`, `add:${nonce}`]);
  });

  test("returns form action redirect responses without JSON wrapping", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-form-redirect-"));
    await writeActionFixture(appDir);
    const pageResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "redirectToThanks",
          __mreact_module_id: "actions.ts",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/thanks");
    expect(response.headers.get("content-type")).toBeNull();
    await expect(response.text()).resolves.toBe("");
  });

  test("returns form action navigation HTML responses without JSON wrapping", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-form-navigation-"));
    await writeActionFixture(appDir);
    const pageResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "renderSavedPage",
          __mreact_module_id: "actions.ts",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(response.text()).resolves.toBe("<!DOCTYPE html><main>Saved</main>");
  });

  test("server actions can revalidate cached routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-revalidate-"));
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `"use server";

import { revalidatePath } from "@modular-react/app-router";

export function invalidateHome() {
  revalidatePath("/");
  return "ok";
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export function loader() {
  const state = globalThis as { __mreactActionRevalidateCalls?: number };
  state.__mreactActionRevalidateCalls = (state.__mreactActionRevalidateCalls ?? 0) + 1;
  return { calls: state.__mreactActionRevalidateCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const cached = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const action = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "invalidateHome",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-revalidate",
          "x-mreact-action-nonce": "nonce-revalidate",
          "x-mreact-csrf": "csrf-revalidate",
        },
        method: "POST",
      }),
    });
    const afterRevalidate = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await cached.text()).toContain("<main>calls: 1</main>");
    expect(action.status).toBe(200);
    expect(await afterRevalidate.text()).toContain("<main>calls: 2</main>");
  });

  test("server action revalidation uses the injected route cache adapter", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-actions-cache-adapter-"));
    const routeCache = createRecordingRouteCache();
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `"use server";

import { revalidatePath } from "@modular-react/app-router";

export function invalidateHome() {
  revalidatePath("/");
  return "ok";
}`,
    );

    const response = await renderAppRequest({
      appDir,
      routeCache,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "invalidateHome",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-cache-adapter",
          "x-mreact-action-nonce": "nonce-cache-adapter",
          "x-mreact-csrf": "csrf-cache-adapter",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-revalidate")).toBe("/");
    expect(routeCache.calls).toContain("deleteByPath:/");
  });
});

function createRecordingReplayStore(): {
  add(value: string): void;
  calls: string[];
  has(value: string): boolean;
} {
  const seen = new Set<string>();
  const calls: string[] = [];

  return {
    calls,
    add(value) {
      calls.push(`add:${value}`);
      seen.add(value);
    },
    has(value) {
      calls.push(`has:${value}`);
      return seen.has(value);
    },
  };
}

async function writeActionFixture(appDir: string): Promise<void> {
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "actions.ts"),
    `"use server";

export async function save(formData: FormData) {
  const title = String(formData.get("title"));
  (globalThis as { __mreactActionCalls?: unknown[] }).__mreactActionCalls = [title];
  return { title };
}

export function echo(title: string) {
  return { title };
}

export function redirectToThanks() {
  return new Response(null, {
    headers: { location: "/thanks" },
    status: 303,
  });
}

export function renderSavedPage() {
  return new Response("<!DOCTYPE html><main>Saved</main>", {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: 200,
  });
}`,
  );
  await writeFile(
    join(appDir, "page.mreact.tsx"),
    `import { save } from "./actions";

export default function Page() {
  return <main><form action={save}><input name="title" value="Draft" /><button type="submit">Save</button></form></main>;
}`,
  );
}

function extractInputValue(html: string, name: string): string {
  const match = new RegExp(`name="${name}" value="([^"]+)"`).exec(html);

  if (match?.[1] === undefined) {
    throw new Error(`Input ${name} was not found.`);
  }

  return match[1];
}

function createRecordingRouteCache(): AppRouterCache & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async deleteByPath(path) {
      calls.push(`deleteByPath:${path}`);
    },
    async get(key) {
      calls.push(`get:${key}`);
      return undefined;
    },
    async set(key, entry) {
      calls.push(`set:${key}:${entry.path}`);
    },
  };
}
