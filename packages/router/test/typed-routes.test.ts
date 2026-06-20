import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { href } from "../src/index.js";

describe("typed routes", () => {
  test("href fills dynamic and catch-all params with encoded segments", () => {
    expect(
      href("/users/:id/files/:...path", {
        hash: "preview",
        params: { id: "ada lovelace", path: ["notes", "a/b"] },
        search: { filter: "recent", page: 2, tag: ["math", "code"] },
      }),
    ).toBe("/users/ada%20lovelace/files/notes/a%2Fb?filter=recent&page=2&tag=math&tag=code#preview");
  });

  test("href rejects non-internal route patterns at runtime", () => {
    expect(() => href("//evil.example" as never)).toThrow(/internal route path/);
    expect(() => href("javascript:alert(1)" as never)).toThrow(/internal route path/);
    expect(() => href("/safe\npath" as never)).toThrow(/control characters/);
  });

  test("buildApp emits generated route declaration paths", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-typed-routes-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "users", "$id", "files", "$...path"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Home</main>; }`,
    );
    await writeFile(
      join(appDir, "users", "$id", "files", "$...path", "page.tsx"),
      `export default function Page() { return <main>Files</main>; }`,
    );

    await buildApp({ appDir, outDir });

    const declarations = await readFile(join(outDir, "routes.d.ts"), "utf8");

    expect(declarations).toContain('export type AppRoutePath = "/" | "/users/:id/files/:...path";');
    expect(declarations).not.toContain("export declare const routes");
    expect(declarations).toContain('declare module "@reckona/mreact-router/link"');
    expect(declarations).toContain("readonly path: AppRoutePath;");
    expect(declarations).toContain('"/users/:id/files/:...path"');
  });

  test("buildApp emits generated public asset declaration paths without runtime exports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-public-asset-types-"));
    const appDir = join(rootDir, "app");
    const publicDir = join(rootDir, "public");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(publicDir, "images"), { recursive: true });
    await mkdir(join(publicDir, "_mreact", "client"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Assets</main>; }`,
    );
    await writeFile(join(appDir, "robots.txt"), "User-agent: *\n");
    await writeFile(join(publicDir, "favicon.svg"), "<svg></svg>");
    await writeFile(join(publicDir, "images", "hero.avif"), "image");
    await writeFile(join(publicDir, "_mreact", "client", "manifest.json"), "reserved");

    await buildApp({
      outDir,
      projectRoot: rootDir,
      publicDir: "public",
      routesDir: "app",
    });

    const declarations = await readFile(join(outDir, "public-assets.d.ts"), "utf8");

    expect(declarations).toContain('declare module "mreact:public-assets"');
    expect(declarations).toContain(
      'export type PublicAssetPath = "/favicon.svg" | "/images/hero.avif" | "/robots.txt";',
    );
    expect(declarations).not.toContain("export declare const");
    expect(declarations).not.toContain("/_mreact/client/manifest.json");
  });
});
