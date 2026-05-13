import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderAppRequest } from "../src/render.js";

async function setupPage(): Promise<string> {
  const appDir = await mkdtemp(join(tmpdir(), "mreact-page-method-"));
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "page.tsx"),
    `export default function Page() { return <h1>ok</h1>; }`,
  );
  return appDir;
}

describe("page route HTTP method gating (Issue 080)", () => {
  test("GET returns 200 with the page body", async () => {
    const appDir = await setupPage();
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>ok</h1>");
  });

  test("HEAD is allowed (same body shape, status 200)", async () => {
    const appDir = await setupPage();
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", { method: "HEAD" }),
    });
    expect(response.status).toBe(200);
  });

  test("POST returns 405 with Allow header", async () => {
    const appDir = await setupPage();
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", { method: "POST" }),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(await response.text()).toBe("Method Not Allowed");
  });

  test("PATCH / DELETE return 405", async () => {
    const appDir = await setupPage();
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/", { method }),
      });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    }
  });

  test("OPTIONS returns 204 with Allow header", async () => {
    const appDir = await setupPage();
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", { method: "OPTIONS" }),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });
});
