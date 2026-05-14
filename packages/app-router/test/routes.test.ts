import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createRouteMatcher, matchRoute, scanAppRoutes } from "../src/routes.js";

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

  test("scans standard tsx pages as mreact routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-tsx-routes-"));
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main />; }",
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
    );
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "page.tsx"),
      "export default function Docs() { return <main />; }",
    );
    await writeFile(
      join(appDir, "docs", "template.tsx"),
      "export default function Template() { return <section><Slot /></section>; }",
    );

    const routes = await scanAppRoutes({ appDir });

    expect(routes.map((route) => route.path)).toEqual(["/", "/docs"]);
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

  test("compiled matcher preserves route precedence without mutating route order", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-routes-compiled-"));
    await mkdir(join(appDir, "docs", "$...slug"), { recursive: true });
    await mkdir(join(appDir, "docs", "$id"), { recursive: true });
    await mkdir(join(appDir, "docs", "new"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "$...slug", "page.mreact.tsx"),
      "export default function DocsSlug() { return <main />; }",
    );
    await writeFile(
      join(appDir, "docs", "$id", "page.mreact.tsx"),
      "export default function DocsId() { return <main />; }",
    );
    await writeFile(
      join(appDir, "docs", "new", "page.mreact.tsx"),
      "export default function DocsNew() { return <main />; }",
    );
    const routes = await scanAppRoutes({ appDir });
    const originalOrder = routes.map((route) => route.path);
    const matcher = createRouteMatcher(routes);

    expect(matcher.match("/docs/new")?.route.path).toBe("/docs/new");
    expect(matcher.match("/docs/intro")?.route.path).toBe("/docs/:id");
    expect(matcher.match("/docs/guides/install")?.params).toEqual({
      slug: "guides/install",
    });
    expect(routes.map((route) => route.path)).toEqual(originalOrder);
  });
});
