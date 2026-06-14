import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  compileRouteMatcherArtifact,
  createRouteMatcher,
  matchRoute,
  scanAppRoutes,
} from "../src/routes.js";

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

  test("ignores tool and dependency directories while scanning app routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-tool-dirs-"));
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main />; }",
    );
    await mkdir(join(appDir, ".vite", "deps_temp_fixture"), { recursive: true });
    await writeFile(
      join(appDir, ".vite", "deps_temp_fixture", "page.tsx"),
      "export default function ViteInternalPage() { return <main />; }",
    );
    await mkdir(join(appDir, "node_modules", "fixture-package"), { recursive: true });
    await writeFile(
      join(appDir, "node_modules", "fixture-package", "page.tsx"),
      "export default function DependencyPage() { return <main />; }",
    );

    const routes = await scanAppRoutes({ appDir });

    expect(routes.map((route) => route.path)).toEqual(["/"]);
  });

  test("scans root file-system metadata conventions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-file-convention-routes-"));
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main />; }",
    );
    await writeFile(join(appDir, "robots.ts"), "export default function robots() { return {}; }");
    await writeFile(join(appDir, "sitemap.ts"), "export default function sitemap() { return []; }");
    await writeFile(join(appDir, "manifest.webmanifest"), '{"name":"app"}');
    await writeFile(join(appDir, "icon.png"), new Uint8Array([137, 80, 78, 71]));

    const routes = await scanAppRoutes({ appDir });

    expect(routes.map((route) => ({ kind: route.kind, path: route.path }))).toEqual([
      { kind: "page", path: "/" },
      { kind: "asset", path: "/icon" },
      { kind: "asset", path: "/manifest.webmanifest" },
      { kind: "metadata", path: "/robots.txt" },
      { kind: "metadata", path: "/sitemap.xml" },
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
      slug: ["getting-started", "install"],
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
      slug: ["guides", "install"],
    });
    expect(routes.map((route) => route.path)).toEqual(originalOrder);
  });

  test("compiled matcher artifact matches without reading route segments", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-routes-compiled-artifact-"));
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
    const artifact = compileRouteMatcherArtifact(routes);
    const routesWithBrokenSegments = routes.map((route) => ({
      ...route,
      segments: [{ kind: "static" as const, value: "broken" }],
    }));
    const matcher = createRouteMatcher(routesWithBrokenSegments, artifact);

    expect(matcher.match("/docs/new")?.route.path).toBe("/docs/new");
    expect(matcher.match("/docs/intro")?.params).toEqual({ id: "intro" });
    expect(matcher.match("/docs/guides/install")?.params).toEqual({
      slug: ["guides", "install"],
    });
    expect(matcher.match("/docs/%ZZ")).toBeUndefined();
  });

  test("scans route-local dynamic Open Graph image conventions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-routes-og-image-"));
    await mkdir(join(appDir, "posts", "$slug"), { recursive: true });
    await writeFile(
      join(appDir, "posts", "$slug", "page.tsx"),
      "export default function Post() { return <main />; }",
    );
    await writeFile(
      join(appDir, "posts", "$slug", "opengraph-image.tsx"),
      "export default function Image() { return new Response('<svg />'); }",
    );

    const routes = await scanAppRoutes({ appDir });

    expect(routes).toContainEqual(
      expect.objectContaining({
        convention: "opengraph-image",
        kind: "metadata",
        path: "/posts/:slug/opengraph-image",
        segments: [
          { kind: "static", value: "posts" },
          { kind: "dynamic", name: "slug" },
          { kind: "static", value: "opengraph-image" },
        ],
      }),
    );
  });

  test("matches route-local Open Graph image conventions before catch-all pages", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-routes-catch-all-og-image-"));
    await mkdir(join(appDir, "$...slug"), { recursive: true });
    await writeFile(
      join(appDir, "$...slug", "page.tsx"),
      "export default function Page() { return <main />; }",
    );
    await writeFile(
      join(appDir, "$...slug", "opengraph-image.tsx"),
      "export default function Image() { return new Response('<svg />'); }",
    );

    const routes = await scanAppRoutes({ appDir });
    const matcher = createRouteMatcher(routes);

    expect(matcher.match("/hello-mreact")?.route).toMatchObject({
      kind: "page",
      path: "/:...slug",
    });
    expect(matcher.match("/hello-mreact/opengraph-image")).toMatchObject({
      route: {
        kind: "metadata",
        path: "/:...slug/opengraph-image",
      },
      params: { slug: ["hello-mreact"] },
    });
  });
});
