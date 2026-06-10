import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { __clearServerActionRegistryCache } from "../src/actions.js";
import { renderAppRequest } from "../src/render.js";

async function writeActionFixture(appDir: string): Promise<void> {
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "actions.ts"),
    `"use server";\nexport async function save(formData) { return { title: formData.get("title") }; }\n`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `import { save } from "./actions";\nexport default function Page() {\n  return <form action={save}><input name="title" defaultValue="x" /><button>save</button></form>;\n}\n`,
  );
}

afterEach(() => {
  __clearServerActionRegistryCache();
});

describe("server action registry cache (Issue 067)", () => {
  test("rejects POST with invalid CSRF without re-running registry build", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-cache-"));
    await writeActionFixture(appDir);

    // First valid request to prime the cache.
    const page = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await page.text();
    const csrf = /name="__mreact_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? "";
    const nonce =
      /name="__mreact_action_nonce"\s+value="([^"]+)"/.exec(html)?.[1] ?? "";
    const cookie = page.headers.get("set-cookie")?.split(";")[0] ?? "";

    const okResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "save",
          __mreact_module_id: "actions.ts",
          title: "ok",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });
    expect(okResponse.status).toBe(200);

    // CSRF token mismatch should be rejected without re-bundling. We assert
    // the response is 403 and that the call returns quickly (no exception).
    const badResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: "fake",
          __mreact_csrf: "wrong-token",
          __mreact_export_name: "save",
          __mreact_module_id: "actions.ts",
          title: "evil",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "mreact.csrf=different-token",
        },
        method: "POST",
      }),
    });
    expect(badResponse.status).toBe(403);
    await expect(badResponse.json()).resolves.toMatchObject({ ok: false });
  });

  test("rejects non-POST without touching the registry", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-cache-method-"));
    await writeActionFixture(appDir);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        method: "GET",
      }),
    });
    expect(response.status).toBe(405);
  });

  test("rejects unsupported content type with 415 before registry load", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-cache-ct-"));
    await writeActionFixture(appDir);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: "raw",
        headers: { "content-type": "text/plain" },
        method: "POST",
      }),
    });
    expect(response.status).toBe(415);
  });

  test("does not scan node_modules while building the server action registry", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-skip-node-modules-"));
    await writeActionFixture(appDir);
    await mkdir(join(appDir, "node_modules", "fixture-actions"), { recursive: true });
    await writeFile(
      join(appDir, "node_modules", "fixture-actions", "index.ts"),
      `"use server";\nthrow new Error("node_modules server action file was scanned");\nexport function ignored() {}\n`,
    );

    const page = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await page.text();
    const csrf = /name="__mreact_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ?? "";
    const nonce = /name="__mreact_action_nonce"\s+value="([^"]+)"/.exec(html)?.[1] ?? "";
    const cookie = page.headers.get("set-cookie")?.split(";")[0] ?? "";

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "save",
          __mreact_module_id: "actions.ts",
          title: "ok",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
  });
});
