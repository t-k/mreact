import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildClientRouteOutput as buildClientRouteOutputFromClient } from "../src/client.js";
import { inferClientRouteModule as inferClientRouteModuleFromClient } from "../src/client.js";
import {
  collectClientRouteReferences,
  createClientRouteInferenceCache,
  detectClientNavigationHint,
  detectNavigationRuntimeOverride,
  inferClientRouteModule,
  resolveNavigationRuntime,
} from "../src/client-route-inference.js";
import { buildClientRouteOutput } from "../src/navigation-runtime.js";

describe("client module boundaries", () => {
  test("exposes client-route inference without importing the navigation runtime surface", async () => {
    const result = await inferClientRouteModule({
      code: `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    });
    const legacyResult = await inferClientRouteModuleFromClient({
      code: `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    });

    expect(result).toEqual(legacyResult);
    expect(result.client).toBe(true);
  });

  test("keeps navigation runtime route output byte-identical through the boundary module", async () => {
    const options = {
      code: `export default function Page() { return <main>ok</main>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    };

    await expect(buildClientRouteOutput(options)).resolves.toEqual(
      await buildClientRouteOutputFromClient(options),
    );
  });
});

describe("detectNavigationRuntimeOverride", () => {
  test("returns undefined when the export is absent", () => {
    expect(
      detectNavigationRuntimeOverride("export default function Page() { return null; }"),
    ).toBeUndefined();
  });

  test("returns true for an explicit true export", () => {
    expect(detectNavigationRuntimeOverride("export const navigationRuntime = true;")).toBe(true);
  });

  test("returns false for an explicit false export", () => {
    expect(detectNavigationRuntimeOverride("export const navigationRuntime: boolean = false")).toBe(
      false,
    );
  });

  test("ignores a commented-out override", () => {
    const source = `// export const navigationRuntime = false;
export default function Page() { return null; }`;
    expect(detectNavigationRuntimeOverride(source)).toBeUndefined();
  });

  test("ignores the pattern inside a string literal", () => {
    const source = `const doc = "export const navigationRuntime = false";
export default function Page() { return null; }`;
    expect(detectNavigationRuntimeOverride(source)).toBeUndefined();
  });
});

describe("detectClientNavigationHint", () => {
  test("defaults to true when no hint is present", () => {
    expect(detectClientNavigationHint("export default function Page() { return null; }")).toBe(true);
  });

  test("returns false for an explicit false export", () => {
    expect(detectClientNavigationHint("export const clientNavigation = false;")).toBe(false);
  });

  test("ignores a commented-out hint and keeps the default", () => {
    const source = `// export const clientNavigation = false;
export default function Page() { return null; }`;
    expect(detectClientNavigationHint(source)).toBe(true);
  });
});

describe("collectClientRouteReferences usesNavigationLink", () => {
  test("flags a Link rendered directly in the page", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <Link href="/a">A</Link>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("does not flag a Link that is imported but never rendered", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <main>no link</main>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("does not flag a Link rendered only in an unreachable local function", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
function Unused() { return <Link href="/a">A</Link>; }
export default function Page() { return <main>no link rendered</main>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("flags a Link rendered through a same-file helper component reachable from the export", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
function Helper() { return <Link href="/a">A</Link>; }
export default function Page() { return <main><Helper /></main>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a Link when the page is exported via a separate function declaration", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
function Page() { return <main><Link href="/a">A</Link></main>; }
export default Page;`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a Link when the page is an arrow const exported by identifier", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
const Page = () => <main><Link href="/a">A</Link></main>;
export default Page;`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a Link imported from the compat package root and rendered", async () => {
    const code = `import { Link } from "@reckona/mreact-router";
export default function Page() { return <Link href="/a">A</Link>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags an aliased compat-root Link import that is rendered", async () => {
    const code = `import { Link as RouterLink } from "@reckona/mreact-router";
export default function Page() { return <RouterLink href="/a">A</RouterLink>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a compat-root namespace Link import that is rendered", async () => {
    const code = `import * as Router from "@reckona/mreact-router";
export default function Page() { return <Router.Link href="/a">A</Router.Link>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("does not flag a non-Link component imported from the compat package root", async () => {
    const code = `import { Outlet } from "@reckona/mreact-router";
export default function Page() { return <Outlet />; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("does not flag a non-Link export aliased to the local name Link", async () => {
    const code = `import { Outlet as Link } from "@reckona/mreact-router";
export default function Page() { return <Link />; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("does not flag a non-Link namespace member imported from the compat package root", async () => {
    const code = `import * as Router from "@reckona/mreact-router";
export default function Page() { return <Router.Outlet />; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("conservatively flags an app-local namespace render even when only a Link-free member is used", async () => {
    // Documented over-detection: a namespace render (`<R.Other />`) cannot be
    // statically narrowed to a specific export, so any Link-using export in the
    // namespaced module triggers the runtime. Pinned to lock the intent.
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-namespace-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "ui"), { recursive: true });
    await writeFile(
      join(appDir, "ui", "index.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function WithLink() { return <Link href="/a">A</Link>; }
export function Plain() { return <main>plain</main>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import * as Ui from "./ui/index";
export default function Page() { return <Ui.Plain />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("does not flag a Link rendered inside a client-boundary module", async () => {
    const code = `"use client";
import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <Link href="/a">A</Link>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("flags a Link rendered transitively through a custom component", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-transitive-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/a">A</Link>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./components/nav";
export default function Page() { return <Nav />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });
});

describe("resolveNavigationRuntime", () => {
  test("honors an explicit true override even without a Link", async () => {
    const code = `export const navigationRuntime = true;
export default function Page() { return <main>x</main>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(true);
  });

  test("honors an explicit false override even when a Link is rendered", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export const navigationRuntime = false;
export default function Page() { return <Link href="/a">A</Link>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(false);
  });

  test("auto-detects a rendered Link when no override is present", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <Link href="/a">A</Link>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(true);
  });

  test("returns false when no override and no Link is rendered", async () => {
    const code = `export default function Page() { return <main>x</main>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(false);
  });

  test("does not let a commented-out false override suppress auto-detection", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
// export const navigationRuntime = false;
export default function Page() { return <Link href="/a">A</Link>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(true);
  });
});

describe("resolveNavigationRuntime dev/build parity", () => {
  test("resolves transitive Link the same way the build does, given appDir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-parity-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/a">A</Link>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./components/nav";
export default function Page() { return <Nav />; }`;
    await writeFile(pageFile, code);

    expect(await resolveNavigationRuntime({ appDir, code, filename: pageFile })).toBe(true);
  });

  test("detects a Link rendered through a Vite-plugin transformed import", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-plugin-"));
    const appDir = join(dir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "doc.linkdoc"), "linkdoc-marker");
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Doc } from "./doc.linkdoc";
export default function Page() { return <Doc />; }`;
    await writeFile(pageFile, code);

    const vitePlugins = [
      {
        name: "linkdoc-fixture",
        transform(_code: string, id: string) {
          if (!id.endsWith(".linkdoc")) {
            return;
          }
          return {
            code: `import { Link } from "@reckona/mreact-router/link";
export function Doc() { return <Link href="/a">A</Link>; }`,
            map: null,
          };
        },
      },
    ];

    // The dev navigation scan must forward Vite plugins so plugin-transformed
    // modules (e.g. MDX) are resolved the same way the build resolves them.
    expect(await resolveNavigationRuntime({ appDir, code, filename: pageFile, vitePlugins })).toBe(
      true,
    );
    expect(await resolveNavigationRuntime({ appDir, code, filename: pageFile })).toBe(false);
  });

  test("detects a Link rendered only in the layout shell (dev path)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-dev-layout-"));
    const appDir = join(dir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export default function Layout({ children }: { children: unknown }) {
  return <div><nav><Link href="/a">A</Link></nav>{children}</div>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `export default function Page() { return <main>home</main>; }`;
    await writeFile(pageFile, code);

    // resolveNavigationRuntime with appDir is exactly what devNavigationScripts calls.
    expect(await resolveNavigationRuntime({ appDir, code, filename: pageFile })).toBe(true);
  });

  test("does not flag a Link from a component that is imported but never rendered", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-referenced-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/a">A</Link>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./components/nav";
export default function Page() { const C = Nav; return <main />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("does not flag a barrel re-export sibling that the route never renders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-barrel-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "c"), { recursive: true });
    await writeFile(
      join(appDir, "c", "a.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function A() { return <Link href="/x">x</Link>; }`,
    );
    await writeFile(join(appDir, "c", "b.tsx"), `export function B() { return <main>b</main>; }`);
    await writeFile(
      join(appDir, "c", "index.tsx"),
      `export { A } from "./a";
export { B } from "./b";`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { B } from "./c/index";
export default function Page() { return <B />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("flags a barrel re-export that the route actually renders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-barrel-render-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "c"), { recursive: true });
    await writeFile(
      join(appDir, "c", "a.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function A() { return <Link href="/x">x</Link>; }`,
    );
    await writeFile(join(appDir, "c", "b.tsx"), `export function B() { return <main>b</main>; }`);
    await writeFile(
      join(appDir, "c", "index.tsx"),
      `export { A } from "./a";
export { B } from "./b";`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { A } from "./c/index";
export default function Page() { return <A />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a renamed barrel re-export that the route renders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-renamed-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "c"), { recursive: true });
    await writeFile(
      join(appDir, "c", "a.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function A() { return <Link href="/x">x</Link>; }`,
    );
    await writeFile(join(appDir, "c", "index.tsx"), `export { A as Nav } from "./a";`);
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./c/index";
export default function Page() { return <Nav />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a wildcard barrel re-export that the route renders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-wildcard-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "c"), { recursive: true });
    await writeFile(
      join(appDir, "c", "a.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function A() { return <Link href="/x">x</Link>; }`,
    );
    await writeFile(join(appDir, "c", "index.tsx"), `export * from "./a";`);
    const pageFile = join(appDir, "page.tsx");
    const code = `import { A } from "./c/index";
export default function Page() { return <A />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("flags a Link when the route re-exports an imported default component", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-redefault-"));
    const appDir = join(dir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "Page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <main><Link href="/x">x</Link></main>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import Page from "./Page";
export default Page;`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("detects a client route that re-exports an imported default component", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-client-redefault-"));
    const appDir = join(dir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "Page.tsx"),
      `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import Page from "./Page";
export default Page;`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.client).toBe(true);
  });

  test("flags a Link rendered through a wrapper component imported from another file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-wrapper-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "inner.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Inner() { return <Link href="/a">A</Link>; }`,
    );
    await writeFile(
      join(appDir, "components", "mid.tsx"),
      `import { Inner } from "./inner";
export function Mid() { return <Inner />; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Mid } from "./components/mid";
export default function Page() { return <Mid />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("reuses a shared inference cache across repeated resolutions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-cache-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/a">A</Link>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./components/nav";
export default function Page() { return <Nav />; }`;
    await writeFile(pageFile, code);

    const cache = createClientRouteInferenceCache();
    expect(await resolveNavigationRuntime({ appDir, cache, code, filename: pageFile })).toBe(true);

    const analysesAfterFirst = cache.moduleAnalysisByFile.size;
    expect(analysesAfterFirst).toBeGreaterThan(0);

    expect(await resolveNavigationRuntime({ appDir, cache, code, filename: pageFile })).toBe(true);

    // No new analyses for unchanged files: the second resolution reused the cache.
    expect(cache.moduleAnalysisByFile.size).toBe(analysesAfterFirst);
  });

  test("reuses the cached module context when reading the navigationRuntime override", async () => {
    const code = `export const navigationRuntime = true;
export default function Page() { return <main>x</main>; }`;
    const cache = createClientRouteInferenceCache();

    expect(await resolveNavigationRuntime({ cache, code, filename: "/app/page.tsx" })).toBe(true);

    const contextsAfterFirst = cache.moduleContextByFile.size;
    expect(contextsAfterFirst).toBeGreaterThan(0);

    expect(await resolveNavigationRuntime({ cache, code, filename: "/app/page.tsx" })).toBe(true);

    // The override read parsed once and reused the cached context on the second call.
    expect(cache.moduleContextByFile.size).toBe(contextsAfterFirst);
  });

  test("keeps only the latest content version per file across edits (no unbounded growth)", async () => {
    const cache = createClientRouteInferenceCache();
    const filename = "/app/page.tsx";

    for (let revision = 0; revision < 5; revision += 1) {
      const code = `export const navigationRuntime = true;
export default function Page() { return <main>revision ${revision}</main>; }`;
      await resolveNavigationRuntime({ cache, code, filename });
    }

    // Five distinct contents for one file -> a single retained module context,
    // not one per revision.
    expect(cache.moduleContextByFile.size).toBe(1);
  });
});
