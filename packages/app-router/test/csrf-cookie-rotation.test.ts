import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderAppRequest } from "../src/render.js";

async function writeActionFixture(appDir: string): Promise<void> {
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "actions.ts"),
    `"use server";\nexport async function save(formData) { return { ok: true }; }\n`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `import { save } from "./actions";\nexport default function Page() {\n  return <form action={save}><input name="title" /><button>save</button></form>;\n}\n`,
  );
}

describe("CSRF cookie stability across renders (Issue 070)", () => {
  test("first render mints a token and sets the cookie", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-csrf-stable-1-"));
    await writeActionFixture(appDir);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.headers.get("set-cookie")).toContain("mreact.csrf=");
  });

  test("subsequent render with the same cookie reuses the token and skips Set-Cookie", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-csrf-stable-2-"));
    await writeActionFixture(appDir);

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const firstHtml = await first.text();
    const firstToken = /name="__mreact_csrf"\s+value="([^"]+)"/.exec(firstHtml)?.[1];
    expect(firstToken).toBeDefined();
    const firstCookieValue = first.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(firstCookieValue).toContain(`mreact.csrf=${firstToken}`);

    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { cookie: firstCookieValue },
      }),
    });
    const secondHtml = await second.text();
    const secondToken = /name="__mreact_csrf"\s+value="([^"]+)"/.exec(secondHtml)?.[1];

    // Cookie reused -> hidden input must match -> no Set-Cookie this time.
    expect(secondToken).toBe(firstToken);
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  test("malformed incoming cookie is replaced with a fresh token", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-csrf-stable-3-"));
    await writeActionFixture(appDir);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { cookie: "mreact.csrf=not-a-uuid" },
      }),
    });

    const html = await response.text();
    const newToken = /name="__mreact_csrf"\s+value="([^"]+)"/.exec(html)?.[1];
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe("not-a-uuid");
    expect(response.headers.get("set-cookie")).toContain(`mreact.csrf=${newToken}`);
  });
});
