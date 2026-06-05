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
  test("transforms MDX route source before reading the navigation runtime override", async () => {
    const code = `---
title: Navigation
---

# Navigation

\`\`\`tsx
export const metadata = { title: "Navigation" };
export default function Example() { return <main />; }
\`\`\`
`;
    const vitePlugins = [
      {
        name: "mdx-route-fixture",
        transform(_code: string, id: string) {
          if (!id.endsWith(".mdx")) {
            return;
          }
          return {
            code: `export default function Page() { return <main>Navigation</main>; }`,
            map: null,
          };
        },
      },
    ];

    await expect(
      resolveNavigationRuntime({
        code,
        filename: "/app/page.mdx",
        vitePlugins,
      }),
    ).resolves.toBe(false);
  });

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

  test("marks arrow-parameter destructured optional callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-arrow-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "timeline-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type TimelineCardProps = {
  readonly onOpenMedia?: ((id: string) => void) | undefined;
};

export const TimelineCard = ({ onOpenMedia }: TimelineCardProps) => {
  const title = cell("Timeline fallback").get();
  return (
    <article data-testid="timeline-card">
      <button
        type="button"
        onClick={onOpenMedia === undefined ? undefined : () => onOpenMedia("media-1")}
      >
        {title}
      </button>
    </article>
  );
};`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { TimelineCard } from "./components/timeline-card";

export default function Page() {
  return <main><TimelineCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/timeline-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/timeline-card"]);
  });

  test("marks default arrow destructured optional callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-default-arrow-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "timeline-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type TimelineCardProps = {
  readonly onOpenMedia?: ((id: string) => void) | undefined;
};

export default ({ onOpenMedia }: TimelineCardProps) => {
  const title = cell("Default arrow fallback").get();
  return (
    <article data-testid="timeline-card">
      <button
        type="button"
        onClick={onOpenMedia === undefined ? undefined : () => onOpenMedia("media-1")}
      >
        {title}
      </button>
    </article>
  );
};`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import TimelineCard from "./components/timeline-card";

export default function Page() {
  return <main><TimelineCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/timeline-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/timeline-card"]);
  });

  test("marks function-expression destructured optional callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-function-expression-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "timeline-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type TimelineCardProps = {
  readonly onOpenMedia?: ((id: string) => void) | undefined;
};

export const TimelineCard = function ({ onOpenMedia }: TimelineCardProps) {
  const title = cell("Function expression fallback").get();
  return (
    <article data-testid="timeline-card">
      <button
        type="button"
        onClick={onOpenMedia === undefined ? undefined : () => onOpenMedia("media-1")}
      >
        {title}
      </button>
    </article>
  );
};`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { TimelineCard } from "./components/timeline-card";

export default function Page() {
  return <main><TimelineCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/timeline-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/timeline-card"]);
  });

  test("does not mark default-parameter callbacks as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-default-param-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "confirm-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type ConfirmCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function ConfirmCard({ onConfirm = () => undefined }: ConfirmCardProps) {
  const label = cell("Confirm").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { ConfirmCard } from "./components/confirm-card";

export default function Page() {
  return <main><ConfirmCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/confirm-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual([]);
  });

  test("marks typeof and nullish optional callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-typeof-nullish-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "typeof-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type TypeofCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function TypeofCard({ onConfirm }: TypeofCardProps) {
  const label = cell("Typeof").get();
  return (
    <button
      type="button"
      onClick={typeof onConfirm === "function" ? () => onConfirm() : undefined}
    >
      {label}
    </button>
  );
}`,
    );
    await writeFile(
      join(appDir, "components", "nullish-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type NullishCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function NullishCard({ onConfirm }: NullishCardProps) {
  const label = cell("Nullish").get();
  return (
    <button
      type="button"
      onClick={onConfirm != null ? () => onConfirm() : undefined}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { TypeofCard } from "./components/typeof-card";
import { NullishCard } from "./components/nullish-card";

export default function Page() {
  return <main><TypeofCard /><NullishCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual([
      "./components/typeof-card",
      "./components/nullish-card",
    ]);
    expect(result.clientBoundaryFallbackImports).toEqual([
      "./components/typeof-card",
      "./components/nullish-card",
    ]);
  });

  test("handles nullish and logical-or callback handler expressions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-nullish-logical-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nullish-handler-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type NullishHandlerCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function NullishHandlerCard({ onConfirm }: NullishHandlerCardProps) {
  const label = cell("Nullish handler").get();
  return <button type="button" onClick={onConfirm ?? undefined}>{label}</button>;
}`,
    );
    await writeFile(
      join(appDir, "components", "logical-or-handler-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const noop = () => undefined;

type LogicalOrHandlerCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function LogicalOrHandlerCard({ onConfirm }: LogicalOrHandlerCardProps) {
  const label = cell("Logical or handler").get();
  return <button type="button" onClick={onConfirm || noop}>{label}</button>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { NullishHandlerCard } from "./components/nullish-handler-card";
import { LogicalOrHandlerCard } from "./components/logical-or-handler-card";

export default function Page() {
  return <main><NullishHandlerCard /><LogicalOrHandlerCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual([
      "./components/nullish-handler-card",
      "./components/logical-or-handler-card",
    ]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/nullish-handler-card"]);
  });

  test("marks block-body optional callback calls as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-block-optional-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "tracked-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const track = () => undefined;

type TrackedCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function TrackedCard({ onConfirm }: TrackedCardProps) {
  const label = cell("Tracked").get();
  return (
    <button
      type="button"
      onClick={() => {
        track();
        try {
          onConfirm?.();
        } catch {
          track();
        }
      }}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { TrackedCard } from "./components/tracked-card";

export default function Page() {
  return <main><TrackedCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/tracked-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/tracked-card"]);
  });

  test("marks inverted early-return callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-early-return-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "early-return-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type EarlyReturnCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function EarlyReturnCard({ onConfirm }: EarlyReturnCardProps) {
  const label = cell("Early").get();
  if (!onConfirm) {
    return <article data-state="static">{label}</article>;
  }
  return <button type="button" onClick={() => onConfirm()}>{label}</button>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { EarlyReturnCard } from "./components/early-return-card";

export default function Page() {
  return <main><EarlyReturnCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/early-return-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/early-return-card"]);
  });

  test("keeps typeof-window guarded browser access out of SSR fallback eligibility", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-window-guard-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "browser-card.tsx"),
      `export function BrowserCard() {
  const title = typeof window !== "undefined" ? window.location.pathname : "server";
  return <p>{title}</p>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { BrowserCard } from "./components/browser-card";

export default function Page() {
  return <main><BrowserCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/browser-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual([]);
  });

  test("keeps SSR fallback eligibility for typeof-window guarded side-effect helpers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-window-side-effect-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "navigation-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const unreadCount = cell(2);
const started = cell(false);

function startUnreadLoad() {
  if (typeof window === "undefined" || started.get()) return;
  started.set(true);
  queueMicrotask(() => unreadCount.set(3));
}

export function NavigationCard() {
  startUnreadLoad();
  return <nav><a href="/albums">Albums</a><span>{unreadCount.get()}</span></nav>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { NavigationCard } from "./components/navigation-card";

export default function Page() {
  return <main><NavigationCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/navigation-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/navigation-card"]);
  });

  test("preserves SSR fallback eligibility through a static object registry alias", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-static-registry-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "confirm-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type ConfirmCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function ConfirmCard({ onConfirm }: ConfirmCardProps) {
  const label = cell("Confirm").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { ConfirmCard } from "./components/confirm-card";

const registry = { ConfirmCard };
const SelectedCard = registry.ConfirmCard;

export default function Page() {
  return <main><SelectedCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/confirm-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/confirm-card"]);
  });

  test("tracks callback aliases through multiple consts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-callback-alias-chain-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "alias-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type AliasCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function AliasCard(props: AliasCardProps) {
  const label = cell("Alias").get();
  const first = props.onConfirm;
  const second = first;
  return (
    <button
      type="button"
      onClick={second === undefined ? undefined : () => second()}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { AliasCard } from "./components/alias-card";

export default function Page() {
  return <main><AliasCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/alias-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/alias-card"]);
  });

  test("tracks nested destructured callback containers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-nested-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nested-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type NestedCardProps = {
  readonly handlers?: {
    readonly onConfirm?: (() => void) | undefined;
  } | undefined;
};

export function NestedCard({ handlers: { onConfirm } = {} }: NestedCardProps) {
  const label = cell("Nested").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { NestedCard } from "./components/nested-card";

export default function Page() {
  return <main><NestedCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/nested-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/nested-card"]);
  });

  test("tracks callback aliases through TypeScript as-casts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-callback-as-cast-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "cast-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type CastCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function CastCard(props: unknown) {
  const label = cell("Cast").get();
  const onConfirm = (props as CastCardProps).onConfirm;
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { CastCard } from "./components/cast-card";

export default function Page() {
  return <main><CastCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/cast-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/cast-card"]);
  });

  test("tracks generic components with optional callback props", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-generic-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "generic-list.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type GenericListProps<T> = {
  readonly items: readonly T[];
  readonly onPick?: ((item: T) => void) | undefined;
};

export function GenericList<T>({ items, onPick }: GenericListProps<T>) {
  const label = cell("Generic").get();
  return (
    <ul aria-label={label}>
      {items.map((item) => (
        <li>
          <button
            type="button"
            onClick={onPick === undefined ? undefined : () => onPick(item)}
          >
            {String(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { GenericList } from "./components/generic-list";

export default function Page() {
  return <main><GenericList items={["one"]} /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/generic-list"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/generic-list"]);
  });

  test("preserves SSR fallback eligibility through rest-spread forwarding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-rest-forward-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "inner-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type InnerCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function InnerCard({ onConfirm }: InnerCardProps) {
  const label = cell("Inner").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
}`,
    );
    await writeFile(
      join(appDir, "components", "wrapper-card.tsx"),
      `import { InnerCard } from "./inner-card";

type WrapperCardProps = {
  readonly title: string;
  readonly onConfirm?: (() => void) | undefined;
};

export function WrapperCard(props: WrapperCardProps) {
  const { title, ...rest } = props;
  return <section aria-label={title}><InnerCard {...rest} /></section>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { WrapperCard } from "./components/wrapper-card";

export default function Page() {
  return <main><WrapperCard title="Rest" /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual([]);
    expect(result.clientReferenceManifest).toEqual([
      {
        name: "InnerCard",
        moduleId: "./inner-card",
        exportName: "InnerCard",
      },
    ]);
  });

  test("preserves SSR fallback eligibility through whole-props forwarding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-whole-props-forward-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "inner-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type InnerCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function InnerCard({ onConfirm }: InnerCardProps) {
  const label = cell("Whole").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
}`,
    );
    await writeFile(
      join(appDir, "components", "wrapper-card.tsx"),
      `import { InnerCard } from "./inner-card";

type WrapperCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function WrapperCard(props: WrapperCardProps) {
  return <section><InnerCard {...props} /></section>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { WrapperCard } from "./components/wrapper-card";

export default function Page() {
  return <main><WrapperCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual([]);
    expect(result.clientReferenceManifest).toEqual([
      {
        name: "InnerCard",
        moduleId: "./inner-card",
        exportName: "InnerCard",
      },
    ]);
  });

  test("tracks guarded callbacks inside object props", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-object-prop-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "action-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type ActionCardProps = {
  readonly actions: {
    readonly onSave?: (() => void) | undefined;
  };
};

export function ActionCard({ actions }: ActionCardProps) {
  const label = cell("Action").get();
  return (
    <button
      type="button"
      onClick={actions.onSave === undefined ? undefined : () => actions.onSave?.()}
    >
      {label}
    </button>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { ActionCard } from "./components/action-card";

export default function Page() {
  return <main><ActionCard actions={{}} /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/action-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/action-card"]);
  });

  test("tracks guarded callbacks forwarded into map items", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-map-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "row-list.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type RowListProps = {
  readonly items: readonly { readonly id: string }[];
  readonly onSelect?: ((id: string) => void) | undefined;
};

export function RowList({ items, onSelect }: RowListProps) {
  const label = cell("Rows").get();
  return (
    <ul aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={onSelect === undefined ? undefined : () => onSelect(item.id)}
          >
            {item.id}
          </button>
        </li>
      ))}
    </ul>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { RowList } from "./components/row-list";

export default function Page() {
  return <main><RowList items={[{ id: "a" }]} /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/row-list"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/row-list"]);
  });

  test("marks memo-wrapped optional callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-memo-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "memo-card.tsx"),
      `import { memo } from "@reckona/mreact";
import { cell } from "@reckona/mreact-reactive-core";

type MemoCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export const MemoCard = memo(function MemoCard({ onConfirm }: MemoCardProps) {
  const label = cell("Memo").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
});`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { MemoCard } from "./components/memo-card";

export default function Page() {
  return <main><MemoCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/memo-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/memo-card"]);
  });

  test("classifies deep renamed barrel chains as client boundaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-deep-barrel-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Card() {
  const label = cell("Card").get();
  return <button type="button" onClick={() => undefined}>{label}</button>;
}`,
    );
    await writeFile(
      join(appDir, "components", "middle.ts"),
      `export { Card as MiddleCard } from "./card";`,
    );
    await writeFile(
      join(appDir, "components", "index.ts"),
      `export { MiddleCard as RenamedCard } from "./middle";`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { RenamedCard } from "./components";

export default function Page() {
  return <main><RenamedCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components"]);
    expect(result.clientReferenceManifest).toEqual([
      {
        name: "RenamedCard",
        moduleId: "./components",
        exportName: "RenamedCard",
      },
    ]);
  });

  test("keeps inferred and explicit client-boundary route classification independent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-route-independent-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "inferred-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function InferredCard() {
  const label = cell("Inferred").get();
  return <button type="button" onClick={() => undefined}>{label}</button>;
}`,
    );
    await writeFile(
      join(appDir, "components", "explicit-card.tsx"),
      `"use client";

export function ExplicitCard() {
  return <button type="button">Explicit</button>;
}`,
    );
    const inferredPageFile = join(appDir, "page.tsx");
    const inferredCode = `import { InferredCard } from "./components/inferred-card";

export default function Page() {
  return <main><InferredCard /></main>;
}`;
    await writeFile(inferredPageFile, inferredCode);
    const explicitPageFile = join(appDir, "settings.tsx");
    const explicitCode = `import { ExplicitCard } from "./components/explicit-card";

export default function Settings() {
  return <main><ExplicitCard /></main>;
}`;
    await writeFile(explicitPageFile, explicitCode);

    const inferred = await collectClientRouteReferences({
      appDir,
      code: inferredCode,
      filename: inferredPageFile,
    });
    const explicit = await collectClientRouteReferences({
      appDir,
      code: explicitCode,
      filename: explicitPageFile,
    });

    expect(inferred.clientBoundaryImports).toEqual(["./components/inferred-card"]);
    expect(inferred.clientBoundaryFallbackImports).toEqual([]);
    expect(explicit.clientBoundaryImports).toEqual(["./components/explicit-card"]);
    expect(explicit.clientBoundaryFallbackImports).toEqual([]);
  });

  test("does not let unused interactive sibling exports poison rendered server exports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-unused-sibling-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "navigation.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function StaticNav() {
  return <nav><a href="/albums">Albums</a></nav>;
}

export function AccountMenu() {
  const opened = cell(false);
  return <button type="button" onClick={() => opened.set(!opened.get())}>Account</button>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { StaticNav } from "./components/navigation";

export default function Page() {
  return <main><StaticNav /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(false);
    expect(result.clientBoundaryImports).toEqual([]);
    expect(result.clientReferenceManifest).toEqual([]);
  });

  test("marks anonymous default arrow optional callback guards as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-anonymous-default-arrow-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "anonymous-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type AnonymousCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export default ({ onConfirm }: AnonymousCardProps) => {
  const label = cell("Anonymous").get();
  return (
    <button
      type="button"
      onClick={onConfirm === undefined ? undefined : () => onConfirm()}
    >
      {label}
    </button>
  );
};`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import AnonymousCard from "./components/anonymous-card";

export default function Page() {
  return <main><AnonymousCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/anonymous-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual(["./components/anonymous-card"]);
  });

  test("does not mark mixed guarded and unguarded callbacks as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-mixed-callbacks-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "confirm-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type ConfirmCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function ConfirmCard({ onConfirm }: ConfirmCardProps) {
  const label = cell("Confirm").get();
  return (
    <article>
      <button
        type="button"
        onClick={onConfirm === undefined ? undefined : () => onConfirm()}
        onMouseEnter={() => onConfirm()}
      >
        {label}
      </button>
    </article>
  );
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { ConfirmCard } from "./components/confirm-card";

export default function Page() {
  return <main><ConfirmCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/confirm-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual([]);
  });

  test("does not mark render-time unconditional callback invocation as SSR fallback eligible", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-boundary-unconditional-callback-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "danger-card.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type DangerCardProps = {
  readonly onConfirm?: (() => void) | undefined;
};

export function DangerCard({ onConfirm }: DangerCardProps) {
  const label = cell("Danger").get();
  onConfirm();
  return <button type="button">{label}</button>;
}`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { DangerCard } from "./components/danger-card";

export default function Page() {
  return <main><DangerCard /></main>;
}`;
    await writeFile(pageFile, code);

    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });

    expect(result.client).toBe(true);
    expect(result.clientBoundaryImports).toEqual(["./components/danger-card"]);
    expect(result.clientBoundaryFallbackImports).toEqual([]);
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
