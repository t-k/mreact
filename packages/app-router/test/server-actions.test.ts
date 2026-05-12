import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
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
});

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
