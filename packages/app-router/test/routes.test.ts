import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { matchRoute, scanAppRoutes } from "../src/routes.js";

describe("mreact app route scanning", () => {
  test("scans pages and server routes from app directory", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main />; }",
    );
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(
      join(appDir, "about", "page.mreact.tsx"),
      "export default function Page() { return <main />; }",
    );
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      "export default function Page() { return <main />; }",
    );
    await mkdir(join(appDir, "api", "time"), { recursive: true });
    await writeFile(
      join(appDir, "api", "time", "route.ts"),
      "export function GET() { return Response.json({ ok: true }); }",
    );

    const routes = await scanAppRoutes({ appDir });

    expect(routes.map((route) => ({ kind: route.kind, path: route.path }))).toEqual([
      { kind: "page", path: "/" },
      { kind: "page", path: "/about" },
      { kind: "server", path: "/api/time" },
      { kind: "page", path: "/users/:id" },
    ]);
  });

  test("matches dynamic params", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-"));
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      "export default function Page() { return <main />; }",
    );
    const routes = await scanAppRoutes({ appDir });

    expect(matchRoute(routes, "/users/ada")).toMatchObject({
      route: { path: "/users/:id" },
      params: { id: "ada" },
    });
    expect(matchRoute(routes, "/missing")).toBeUndefined();
  });

  test("ignores route groups and matches catch-all params", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-routes-groups-"));
    await mkdir(join(appDir, "(marketing)", "docs", "$...slug"), { recursive: true });
    await mkdir(join(appDir, "docs", "new"), { recursive: true });
    await writeFile(
      join(appDir, "(marketing)", "docs", "$...slug", "page.mreact.tsx"),
      "export default function DocsPage() { return <main>docs</main>; }",
    );
    await writeFile(
      join(appDir, "docs", "new", "page.mreact.tsx"),
      "export default function NewDocsPage() { return <main>new docs</main>; }",
    );

    const routes = await scanAppRoutes({ appDir });

    expect(routes.map((route) => route.path)).toEqual(["/docs/new", "/docs/:...slug"]);
    expect(matchRoute(routes, "/docs/getting-started/install")?.params).toEqual({
      slug: "getting-started/install",
    });
    expect(matchRoute(routes, "/docs/new")?.route.path).toBe("/docs/new");
  });
});
