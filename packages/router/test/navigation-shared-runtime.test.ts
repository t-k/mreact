import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { measureBrowserDelivery, type BrowserDeliveryManifest } from "../../../size/delivery.js";
import { buildApp } from "../src/build.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function buildFixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "mreact-navigation-sharing-cases-"));
  directories.push(root);
  const appDir = join(root, "app");
  const outDir = join(root, "build");
  for (const [path, code] of Object.entries(files)) {
    const filename = join(appDir, path);
    await mkdir(join(filename, ".."), { recursive: true });
    await writeFile(filename, code);
  }
  const costs = new Map<string, number | undefined>();
  await buildApp({
    appDir,
    outDir,
    onBoundaryReport(report) {
      for (const route of report.routes) costs.set(route.path, route.cost?.initial?.rawBytes);
    },
  });
  const clientDir = join(outDir, "client");
  const manifest = JSON.parse(
    await readFile(join(clientDir, "manifest.json"), "utf8"),
  ) as BrowserDeliveryManifest;
  return { appDir, outDir, clientDir, manifest, costs };
}

const staticPage = `export default function Page() { return <main>Home</main>; }`;
const interactivePage = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return <button onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;

describe("production navigation runtime sharing", () => {
  test("an unchanged app rebuilds navigation artifacts cached by 0.0.214", async () => {
    const { appDir, outDir, clientDir, manifest } = await buildFixture({
      "page.tsx": `export const clientNavigation = true;\n${interactivePage}`,
    });
    const navigation = manifest.routes.find((route) => route.path === "/")?.navigationScript;
    expect(navigation).toBeDefined();
    const cachePath = join(outDir, "build-cache.json");
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    cache.version = 2;
    await writeFile(cachePath, JSON.stringify(cache));
    await writeFile(join(clientDir, navigation ?? ""), "stale navigation artifact");
    await buildApp({ appDir, outDir });
    expect(await readFile(join(clientDir, navigation ?? ""), "utf8")).toContain("__mreactNavigate");
  });

  test("a native route does not fetch the React root used by a sibling compat route", async () => {
    const { manifest, clientDir } = await buildFixture({
      "Counter.tsx": `"use client"; export function Counter() { return <button>Native</button>; }`,
      "Widget.compat.tsx": `"use client"; export function Widget() { return <button>Compat</button>; }`,
      "page.tsx": `import { Counter } from "./Counter";
export const clientNavigation = true;
export default function Page() { return <main><Counter /></main>; }`,
      "compat/page.tsx": `import { Widget } from "../Widget.compat";
export const clientNavigation = true;
export default function Page() { return <main><Widget /></main>; }`,
    });
    for (const path of ["/", "/compat"]) {
      const report = await measureBrowserDelivery({
        clientDir,
        manifest,
        initialPath: path,
        initialIncludesNavigationRuntime: true,
      });
      expect(report.initial.unavailablePaths).toEqual([]);
      const sources = await Promise.all(
        report.initial.paths.map((file) => readFile(join(clientDir, file), "utf8")),
      );
      expect(sources.some((source) => source.includes("Unsupported react-compat root node"))).toBe(
        path === "/compat",
      );
    }
  });

  test("navigation stays absent when every route disables it", async () => {
    const { manifest } = await buildFixture({
      "page.tsx": `export const clientNavigation = false;\n${interactivePage}`,
      "about/page.tsx": staticPage,
    });
    expect(manifest.routes.every((route) => route.navigationScript === undefined)).toBe(true);
    expect(manifest.chunks?.some((chunk) => chunk.file.includes("navigation"))).toBe(false);
  });

  test("a server-only navigation route keeps its standalone runtime", async () => {
    const { manifest, clientDir } = await buildFixture({
      "page.tsx": `export const navigationRuntime = true;\n${staticPage}`,
    });
    const home = manifest.routes.find((route) => route.path === "/");
    expect(home?.script).toBeUndefined();
    expect(home?.navigationScript).toMatch(/^assets\/navigation\./);
    expect(await readFile(join(clientDir, home?.navigationScript ?? ""), "utf8")).toContain(
      "popstate",
    );
  });

  test("a server-only route can request shared navigation while the client route opts out", async () => {
    const { manifest, clientDir, costs } = await buildFixture({
      "page.tsx": `export const clientNavigation = false;\n${interactivePage}`,
      "about/page.tsx": `export const navigationRuntime = true;\n${staticPage}`,
    });
    const home = manifest.routes.find((route) => route.path === "/");
    const about = manifest.routes.find((route) => route.path === "/about");
    expect(home?.navigationScript).toBeUndefined();
    expect(about?.navigationScript).toBeDefined();
    expect(about?.script).toBeUndefined();
    const navigation = manifest.chunks?.find((chunk) => chunk.file === about?.navigationScript);
    expect(navigation?.imports?.length).toBeGreaterThan(0);
    const report = await measureBrowserDelivery({
      clientDir,
      manifest,
      initialPath: "/about",
      initialIncludesNavigationRuntime: true,
    });
    expect(report.initial.unavailablePaths).toEqual([]);
    expect(report.initial.paths.length).toBeGreaterThan(1);
    expect(costs.get("/about")).toBe(report.initial.rawBytes);
  });

  test("navigation's generated entry cannot overwrite a user route with the same id", async () => {
    const { manifest, clientDir } = await buildFixture({
      "page.tsx": `export const clientNavigation = true;\n${interactivePage}`,
      "__mreact_navigation_runtime/page.tsx": `export const clientNavigation = true;\n${interactivePage}`,
      "__mreact_navigation_runtime_/page.tsx": `export const clientNavigation = true;\n${interactivePage}`,
    });
    expect(manifest.routes).toHaveLength(3);
    const home = manifest.routes.find((route) => route.path === "/");
    expect(home?.navigationScript).toBeDefined();
    expect(manifest.routes.map((route) => route.script)).not.toContain(home?.navigationScript);
    for (const route of manifest.routes) {
      expect(route.script).toBeDefined();
      expect(await readFile(join(clientDir, route.script ?? ""), "utf8")).toContain("button");
    }
  });

  test.each([1, 2])(
    "%i client routes share one resume walk with navigation",
    async (routeCount) => {
      const root = await mkdtemp(join(tmpdir(), "mreact-navigation-sharing-"));
      directories.push(root);
      const appDir = join(root, "app");
      const outDir = join(root, "build");
      await mkdir(appDir);
      const code = `import { cell } from "@reckona/mreact-reactive-core";
export const clientNavigation = true;
export default function Page() {
  const count = cell(0);
  return <button onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
      await writeFile(join(appDir, "page.tsx"), code);
      if (routeCount > 1) {
        await mkdir(join(appDir, "about"));
        await writeFile(join(appDir, "about", "page.tsx"), code);
      }
      await buildApp({ appDir, outDir });
      const clientDir = join(outDir, "client");
      const manifest = JSON.parse(
        await readFile(join(clientDir, "manifest.json"), "utf8"),
      ) as BrowserDeliveryManifest;
      const home = manifest.routes.find((route) => route.path === "/");
      expect(home?.navigationScript).toBeDefined();
      const navigationCode = await readFile(join(clientDir, home?.navigationScript ?? ""), "utf8");
      expect(navigationCode).toMatch(/export\s*\{[^}]*\b__mreactNavigate\b/);
      expect(navigationCode).toContain("popstate");
      const routeCode = await readFile(join(clientDir, home?.script ?? ""), "utf8");
      expect(routeCode).not.toMatch(/export\s*\{[^}]*\b__mreactHydrateRoute\b/);
      const report = await measureBrowserDelivery({
        clientDir,
        initialPath: "/",
        initialIncludesNavigationRuntime: true,
        manifest,
      });
      expect(report.initial.unavailablePaths).toEqual([]);
      const sources = await Promise.all(
        report.initial.paths.map((path) => readFile(join(clientDir, path), "utf8")),
      );
      expect(sources.filter((source) => source.includes("mreact-async-boundary"))).toHaveLength(1);
      // Loading a route must not start navigation through a static entry import.
      const routeOnly = await measureBrowserDelivery({
        clientDir,
        initialPath: "/",
        initialIncludesNavigationRuntime: false,
        manifest,
      });
      expect(routeOnly.initial.paths).not.toContain(home?.navigationScript);
    },
  );
});
