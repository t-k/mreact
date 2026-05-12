import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderAppRequest } from "../src/render.js";

describe("mreact app request rendering", () => {
  test("renders a .mreact.tsx page route to HTML", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-render-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main><h1>Hello app router</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain(
      "<main><h1>Hello app router</h1></main>",
    );
  });

  test("passes dynamic route params to page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-params-"));
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      "export default function Page(props) { return <main><h1>User {props.params.id}</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/users/ada"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>User ada</h1></main>");
  });

  test("dispatches route.ts handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-"));
    await mkdir(join(appDir, "api", "time"), { recursive: true });
    await writeFile(
      join(appDir, "api", "time", "route.ts"),
      "export function GET() { return Response.json({ ok: true }); }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/time"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
