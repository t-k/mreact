import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// @vitest-environment happy-dom

import { buildApp } from "../src/build.js";
import {
  buildClientRouteBundle,
  buildClientRouteEntrySource,
  buildClientRouteOutput,
  collectClientRouteReferences,
} from "../src/client.js";
import { renderAppRequest } from "../src/render.js";
import { Link } from "../src/link.js";
import { stripRouteClientOnlyExports } from "../src/route-source.js";
import { renderAppRouterClientAsset } from "../src/vite.js";
import { measureBrowserDelivery, type BrowserDeliveryManifest } from "../../../size/delivery.js";

const nativeFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
});

async function sumClientJavaScriptGzipBytes(directory: string): Promise<number> {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await sumClientJavaScriptGzipBytes(entryPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      total += gzipSync(await readFile(entryPath)).length;
    }
  }

  return total;
}

async function sumNavigationJavaScriptGzipBytes(directory: string): Promise<number> {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await sumNavigationJavaScriptGzipBytes(entryPath);
    } else if (
      entry.isFile() &&
      entry.name.startsWith("navigation.") &&
      entry.name.endsWith(".js")
    ) {
      total += gzipSync(await readFile(entryPath)).length;
    }
  }

  return total;
}

describe("mreact app client build and hydration markers", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    globalThis.fetch = nativeFetch;
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("data-mreact-hydrated");
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    delete (globalThis as { __mreactNavigationState?: unknown }).__mreactNavigationState;
    delete (globalThis as { __accountMenuHydrated?: unknown }).__accountMenuHydrated;
    delete (globalThis as { __devUploadRequests?: unknown }).__devUploadRequests;
    delete (globalThis as { __profileLocaleSyncHydrated?: unknown }).__profileLocaleSyncHydrated;
    delete (globalThis as { __uploadRequests?: unknown }).__uploadRequests;
    delete (globalThis as { __uploadHiddenRequests?: unknown }).__uploadHiddenRequests;
    delete (globalThis as { __futabaLoginPayload?: unknown }).__futabaLoginPayload;
    delete (globalThis as { __futabaSentryInitialized?: unknown }).__futabaSentryInitialized;
    delete (globalThis as { matchMedia?: unknown }).matchMedia;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: undefined,
    });
  });

  test("omits the navigation runtime when clientNavigation=false (issue 058)", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-no-nav-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, code);
    const output = await buildClientRouteOutput({
      code,
      filename: file,
      minify: true,
      routePath: "/",
      clientNavigation: false,
    });

    // hydration entry must remain — that is what mounts the interactive page.
    expect(output.code).toContain("__mreactHydrateRoute");
    // navigation runtime exports must not be present when opted out.
    expect(output.code).not.toContain("__mreactNavigate");
    expect(output.code).not.toContain("__mreactPrefetch");
    expect(output.code).not.toContain("__mreactInvalidateNavigationCache");
    expect(output.code).not.toContain("__mreactRestoreHistoryState");
    expect(output.code).not.toContain("__mreactNavigationState");
    expect(output.code).not.toContain("__mreactInstallNavigation");
  });

  test("interactive page bundle stays smaller with clientNavigation=false (issue 058)", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-size-cmp-"));
    const file = join(appDir, "page.mreact.tsx");
    const interactiveCode = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, interactiveCode);

    const withNav = await buildClientRouteOutput({
      code: interactiveCode,
      filename: file,
      minify: true,
      routePath: "/",
    });
    const withoutNav = await buildClientRouteOutput({
      code: interactiveCode,
      filename: file,
      minify: true,
      routePath: "/",
      clientNavigation: false,
    });

    // Opt-out must be a strict subset of the full bundle (no extra code paths).
    expect(withoutNav.code.length).toBeLessThan(withNav.code.length);
    // The savings must be substantive (>= 600 raw bytes ~ navigation block).
    expect(withNav.code.length - withoutNav.code.length).toBeGreaterThanOrEqual(600);
  });

  test("interactive client bundles stay within absolute gzip budgets", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-size-budget-"));
    const file = join(appDir, "page.mreact.tsx");
    const outDir = join(appDir, ".mreact");
    const interactiveCode = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, interactiveCode);

    const withNav = await buildClientRouteOutput({
      code: interactiveCode,
      filename: file,
      minify: true,
      routePath: "/",
    });
    const withoutNav = await buildClientRouteOutput({
      code: interactiveCode,
      filename: file,
      minify: true,
      routePath: "/",
      clientNavigation: false,
    });
    const serverOnly = await buildClientRouteOutput({
      code: `export default function Page() { return <main>Home</main>; }`,
      filename: file,
      minify: true,
      routePath: "/",
      clientNavigation: false,
    });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
    );
    await writeFile(join(appDir, "page.tsx"), interactiveCode);
    await buildApp({ appDir, outDir });
    const defaultPayloadGzipBytes = await sumClientJavaScriptGzipBytes(join(outDir, "client"));
    const navigationGzipBytes = await sumNavigationJavaScriptGzipBytes(join(outDir, "client"));
    const deliveryReport = await measureBrowserDelivery({
      clientDir: join(outDir, "client"),
      initialIncludesNavigationRuntime: true,
      initialPath: "/",
      manifest: JSON.parse(
        await readFile(join(outDir, "client", "manifest.json"), "utf8"),
      ) as BrowserDeliveryManifest,
    });

    expect(gzipSync(withNav.code).length, "default interactive gzip bytes").toBeLessThanOrEqual(
      12_200,
    );
    expect(
      defaultPayloadGzipBytes,
      "default interactive route + navigation chunk gzip bytes",
    ).toBeLessThanOrEqual(16_200);
    expect(deliveryReport.initial.unavailablePaths).toEqual([]);
    expect(
      deliveryReport.initial.gzipEstimateBytes,
      "initial browser delivery gzip bytes",
    ).toBeLessThanOrEqual(16_200);
    expect(navigationGzipBytes, "navigation chunk gzip bytes").toBeLessThanOrEqual(8_500);
    expect(
      gzipSync(withoutNav.code).length,
      "minimal opt-out interactive gzip bytes",
    ).toBeLessThanOrEqual(7_800);
    expect(gzipSync(serverOnly.code).length, "server-only route gzip bytes").toBeLessThanOrEqual(
      3_600,
    );
  });

  test("batch client route builds share hydration glue across interactive route chunks", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-shared-glue-"));
    const routeCode = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    const routes = await Promise.all(
      ["/", "/about", "/settings"].map(async (routePath) => {
        const filename = join(
          appDir,
          `${routePath === "/" ? "index" : routePath.slice(1)}.mreact.tsx`,
        );
        await writeFile(filename, routeCode);
        return {
          code: routeCode,
          filename,
          minify: true,
          routePath,
        };
      }),
    );

    const output = await import("../src/client.js").then((module) =>
      module.buildClientRouteBatchOutput({
        minify: true,
        projectRoot: appDir,
        routes,
      }),
    );
    const sharedChunks = output.chunks.filter((chunk) => !chunk.isEntry);

    expect(sharedChunks.length).toBeGreaterThan(0);
    expect(output.routes.every((route) => route.chunk.imports.length > 0)).toBe(true);
    for (const route of output.routes) {
      expect(gzipSync(route.chunk.code).length).toBeLessThan(4_800);
    }
  });

  test("writes every hashed script referenced by a multi-route client manifest", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-shared-manifest-"));
    const outDir = join(appDir, ".mreact");
    const previousNodeEnv = process.env.NODE_ENV;
    const routeCode = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;

    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
    );
    for (const routeName of ["page", "about/page", "settings/page"]) {
      const routeDir = join(appDir, ...routeName.split("/").slice(0, -1));
      if (routeDir !== appDir) {
        await mkdir(routeDir, { recursive: true });
      }
      await writeFile(join(appDir, `${routeName}.tsx`), routeCode);
    }

    process.env.NODE_ENV = "production";
    try {
      await buildApp({ appDir, outDir });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      assets?: string[];
      routes: Array<{ client: boolean; imports?: string[]; script?: string }>;
    };
    const referencedScripts = new Set([
      ...manifest.routes.flatMap((route) =>
        route.client && route.script !== undefined ? [route.script, ...(route.imports ?? [])] : [],
      ),
      ...(manifest.assets ?? []).filter((asset) => asset.endsWith(".js")),
    ]);

    for (const script of referencedScripts) {
      await expect(readFile(join(outDir, "client", script))).resolves.toBeDefined();
    }
  });

  test("records the complete static and dynamic client chunk graph in production manifests", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-chunk-graph-"));
    const outDir = join(appDir, ".mreact");
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(join(appDir, "shared.ts"), 'export const shared = "shared";');
    await writeFile(
      join(appDir, "page.tsx"),
      `const loadShared = () => import("./shared");

export default function Page() {
  return <button type="button" onClick={() => void loadShared()}>Load</button>;
}`,
    );
    await writeFile(
      join(appDir, "about", "page.tsx"),
      `export default function About() {
  return <main>About</main>;
}`,
    );

    await buildApp({ appDir, outDir });

    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as BrowserDeliveryManifest & {
      routes: Array<{
        dynamicImports?: string[];
        path: string;
        script?: string;
      }>;
    };
    const chunks = manifest.chunks ?? [];
    const graphEdges = chunks.flatMap((chunk) => [
      ...(chunk.imports ?? []),
      ...(chunk.dynamicImports ?? []),
    ]);
    const dynamicImports =
      manifest.routes.find((route) => route.path === "/")?.dynamicImports ?? [];

    expect(chunks.length).toBeGreaterThan(0);
    expect(dynamicImports.length).toBeGreaterThan(0);
    expect(graphEdges).toEqual(expect.arrayContaining([...dynamicImports]));

    for (const file of new Set([
      ...chunks.map((chunk) => chunk.file),
      ...graphEdges,
      ...manifest.routes.flatMap((route) => (route.script === undefined ? [] : [route.script])),
    ])) {
      await expect(readFile(join(outDir, "client", file))).resolves.toBeDefined();
    }

    const report = await measureBrowserDelivery({
      clientDir: join(outDir, "client"),
      initialPath: "/",
      manifest,
      navigation: {
        from: "/",
        fetchedDynamicImports: dynamicImports,
        to: "/",
      },
    });

    expect(report.initial.unavailablePaths).toEqual([]);
    expect(report.navigation?.unavailablePaths).toEqual([]);
    expect(report.navigation?.fetchedPaths).toEqual(expect.arrayContaining([...dynamicImports]));
  });

  test("omits route cell state runtime when the client route does not call cell", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-no-cell-state-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export const clientNavigation = false;

export default function Page() {
  return <button type="button" onClick={() => document.body.setAttribute("data-clicked", "yes")}>Click</button>;
}`;
    await writeFile(file, code);
    const output = await buildClientRouteOutput({
      code,
      filename: file,
      routePath: "/",
    });

    expect(output.code).toContain("__mreactHydrateRoute");
    expect(output.code).not.toContain("__mreactRouteCell");
    expect(output.code).not.toContain("__mreactRouteStates");
    expect(output.code).not.toContain("__mreactActiveCellRecords");
    expect(output.code).not.toContain("__mreactRouteStateSignature");
  });

  test("captures event binding metadata while evaluating route hydration nodes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-event-metadata-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export const clientNavigation = false;

export default function Page() {
  return <button type="button" onClick={() => document.body.setAttribute("data-clicked", "yes")}>Click</button>;
}`;
    await writeFile(file, code);
    const output = await buildClientRouteOutput({
      code,
      filename: file,
      routePath: "/",
    });

    expect(output.code).toContain("function withEventBindingMetadata");
    expect(output.code).toContain("withEventBindingMetadata(() => __mreactEvaluateHydrationNode");
  });

  test("annotates runtime route script imports so Vite does not warn", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-ignore-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export default function Page() {
  return <main>Home</main>;
}`;
    await writeFile(file, code);

    const output = await buildClientRouteOutput({
      code,
      filename: file,
      routePath: "/",
    });

    expect(output.code).toMatch(/import\(\s*\/\* @vite-ignore \*\/\s*script\s*\)/);
  });

  test("does not idle-load the deferred navigation runtime when the DOM has no same-origin anchors", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-deferred-nav-no-anchor-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export default function Page() {
  return <main>Home</main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>Home</main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-navigation-runtime">{"script":"/_mreact/client/assets/navigation.js"}</script>',
    ].join("");
    let idleCallbacks = 0;
    const previousRequestIdleCallback = (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    (
      globalThis as { requestIdleCallback?: (callback: IdleRequestCallback) => number }
    ).requestIdleCallback = () => {
      idleCallbacks += 1;
      return idleCallbacks;
    };

    try {
      const output = await buildClientRouteOutput({
        code,
        filename: file,
        minify: true,
        routePath: "/",
      });
      await import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(output.code)}#deferred-nav-no-anchor`
      );

      expect(idleCallbacks).toBe(0);
    } finally {
      if (previousRequestIdleCallback === undefined) {
        delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
      } else {
        (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback =
          previousRequestIdleCallback;
      }
    }
  });

  test("omits the hydration-time OOB fragment walk for routes that cannot stream fragments", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-no-oob-fragments-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export const clientNavigation = false;

export default function Page() {
  return <main>Home</main>;
}`;
    await writeFile(file, code);

    const entry = await buildClientRouteEntrySource({
      code,
      clientNavigation: false,
      filename: file,
      routePath: "/",
    });

    expect(entry.code).not.toContain("__mreactApplyOutOfOrderFragments(document);");
  });

  test("restores the current browser URL before hydrating shared HTML", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hydration-url-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export const clientNavigation = false;

export default function Page(props) {
  return <main>{props.request.url}</main>;
}`;
    await writeFile(file, code);

    const entry = await buildClientRouteEntrySource({
      code,
      clientNavigation: false,
      filename: file,
      routePath: "/",
    });

    expect(entry.code).toContain("__mreactProps.request.url = __mreactRouteUrl.href");
    expect(entry.code).toContain("__mreactProps.request.search = __mreactRouteUrl.search");
  });

  test("hydrates shared route props with the current pathname and query", async () => {
    history.replaceState(null, "", "/target?tab=profile#bio");
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hydration-location-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export default function Page(props) {
  return <main>{props.request.pathname}|{props.request.search}|{props.request.hash}</main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>/target|?tab=profile|#bio</main></div>',
      '<script type="application/json" id="mreact-props-index">{"request":{"hash":"","pathname":"/","search":"","url":"/"}}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#hydration-location`
    );

    expect(document.querySelector("main")?.textContent).toBe("/target|?tab=profile|#bio");
  });

  test("keeps the hydration-time OOB fragment walk for routes that can stream fragments", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-oob-fragments-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export const clientNavigation = false;

export default function Page() {
  return <main>Home</main>;
}`;
    await writeFile(file, code);

    const entry = await buildClientRouteEntrySource({
      code,
      clientNavigation: false,
      filename: file,
      routeMayUseOutOfOrderFragments: true,
      routePath: "/",
    });

    expect(entry.code).toContain("__mreactApplyOutOfOrderFragments(document);");
  });

  test("route hydration reuses reactive-dom delegated event state instead of a router-local registry", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-event-registry-reuse-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `export const clientNavigation = false;

export default function Page() {
  return <button type="button" onClick={() => document.body.setAttribute("data-clicked", "yes")}>Click</button>;
}`;
    await writeFile(file, code);

    const entry = await buildClientRouteEntrySource({
      code,
      clientNavigation: false,
      filename: file,
      routePath: "/",
    });

    expect(entry.code).not.toContain("__mreactDelegatedEventState");
  });

  test("keeps route cell state runtime when the client route calls cell", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-cell-state-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, code);
    const output = await buildClientRouteOutput({
      code,
      filename: file,
      routePath: "/",
    });

    expect(output.code).toContain("__mreactRouteCell");
    expect(output.code).toContain("__mreactRouteStates");
    expect(output.code).toContain("__mreactActiveCellRecords");
    expect(output.code).toContain("__mreactRouteStateSignature");
  });

  test("keeps route cell state runtime when cell is imported with an alias", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-cell-alias-state-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell as c } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = c(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, code);
    const output = await buildClientRouteOutput({
      code,
      filename: file,
      routePath: "/",
    });

    expect(output.code).toContain("__mreactRouteCell");
    expect(output.code).toContain("__mreactRouteStates");
  });

  test("hydrates named default client route components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-named-default-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function About() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>about count: {count.get()}</button>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="about"><button type="button">about count: 0</button></div>',
      '<script type="application/json" id="mreact-props-about">{}</script>',
    ].join("");
    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/about",
    });

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#named-default-client`
    );
    document.querySelector<HTMLButtonElement>("button")?.click();
    await Promise.resolve();

    expect(
      document
        .querySelector("[data-mreact-route-id='about']")
        ?.getAttribute("data-mreact-hydrated"),
    ).toBe("true");
    expect(document.querySelector("button")?.textContent).toBe("about count: 1");
  });

  test("resolves route-relative TypeScript imports from the page directory", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-relative-ts-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "state.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const count = cell(1);`,
    );
    const code = `import { count } from "./state.ts";

export const clientNavigation = false;

export default function Page() {
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, code);

    const output = await buildClientRouteOutput({
      code,
      filename: file,
      routePath: "/",
    });

    expect(output.code).toContain("__mreactHydrateRoute");
    expect(output.code).toContain("__mreactRouteCell");
  });

  test("does not bundle the devtools package into production client routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-no-devtools-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, code);

    const output = await buildClientRouteOutput({
      code,
      filename: file,
      minify: true,
      routePath: "/",
    });

    expect(output.code).not.toContain("@reckona/mreact-devtools");
    expect(output.code).not.toContain("createDevtools");
    expect(output.code).not.toContain("installDevtools");
  });

  test("stubs reactive-core devtools hooks in production client routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-no-core-devtools-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, code);

    const output = await buildClientRouteOutput({
      code,
      filename: file,
      minify: true,
      routePath: "/",
    });

    expect(output.code).not.toContain("__mreactDevtools");
    expect(output.code).not.toContain("reactive:cell:set");
    expect(output.code).not.toContain("reactive:effect:run");
  });

  test("drops default client console calls while preserving warnings and errors", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-console-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  console.debug("drop-debug-marker");
  console.info("drop-info-marker");
  console.log("drop-log-marker");
  console.warn("keep-warn-marker");
  console.error("keep-error-marker");
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;
    await writeFile(file, code);

    const output = await buildClientRouteOutput({
      code,
      dropClientConsole: true,
      filename: file,
      minify: true,
      routePath: "/",
    });

    expect(output.code).not.toContain("drop-debug-marker");
    expect(output.code).not.toContain("drop-info-marker");
    expect(output.code).not.toContain("drop-log-marker");
    expect(output.code).toContain("keep-warn-marker");
    expect(output.code).toContain("keep-error-marker");
  });

  test("applies configured client console removal through buildApp without stripping server artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-console-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api"), { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  console.log("drop-build-client-log-marker");
  console.warn("keep-build-client-warn-marker");
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "api", "route.ts"),
      `export function GET() {
  console.log("keep-server-log-marker");
  return new Response("ok");
}`,
    );

    await buildApp({
      appDir,
      outDir,
      production: {
        dropClientConsole: ["log"],
      },
    });
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ path: string; script?: string }> };
    const page = manifest.routes.find((route) => route.path === "/");
    const clientCode = await readFile(join(outDir, "client", page?.script ?? ""), "utf8");
    const serverText = await readDirectoryText(join(outDir, "server"));

    expect(clientCode).not.toContain("drop-build-client-log-marker");
    expect(clientCode).toContain("keep-build-client-warn-marker");
    expect(serverText).toContain("keep-server-log-marker");
  });

  test("builds bundled client route modules for interactive pages", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      routes: Array<{ client: boolean; devScript?: string; script?: string; sourceMap?: string }>;
    };
    const script = manifest.routes[0]?.script;

    expect(manifest.routes[0]?.client).toBe(true);
    expect(manifest.routes[0]?.devScript).toBe("routes/index.js");
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(manifest.routes[0]?.sourceMap).toBeUndefined();
    expect(await readFile(join(outDir, "client", script ?? ""), "utf8")).toContain(
      "__mreactHydrateRoute",
    );
  });

  test("builds a client route and cleanup scope for a domRef-only page", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-dom-ref-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main domRef={(element) => {
    const observer = new IntersectionObserver(() => {});
    observer.observe(element);
    return () => observer.disconnect();
  }}>Observed</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = manifest.routes[0]?.script;
    const clientCode = await readFile(join(outDir, "client", script ?? ""), "utf8");

    expect(manifest.routes[0]?.client).toBe(true);
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(clientCode).toContain("__mreactRouteDisposers");
    expect(clientCode).not.toContain("__mreactDomRefBindings");
  });

  test("does not couple unminified output to source-path diagnostics", async () => {
    const filename = "/srv/private/customer/app/page.mreact.tsx";
    const code = `import { cell } from "@reckona/mreact-reactive-core";
const visible = cell(true);
export default function Page() {
  return <main>{visible.get() && <span>Visible</span>}</main>;
}`;

    const productionLike = await buildClientRouteEntrySource({
      code,
      filename,
      minify: false,
      routePath: "/",
    });
    const development = await buildClientRouteEntrySource({
      code,
      debugLabels: true,
      filename,
      minify: false,
      routePath: "/",
    });

    expect(productionLike.code).not.toContain(filename);
    expect(productionLike.code).not.toContain("debugLabel");
    expect(development.code).not.toContain(filename);
    expect(development.code).toContain("page.mreact.tsx#Page");
    expect(development.code).toContain("debugLabel");
  });

  test("does not leak imported component paths into unminified production output", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-production-debug-labels-"));
    const filename = join(rootDir, "page.mreact.tsx");
    const componentFilename = join(rootDir, "ViewTransition.tsx");
    const code = `import { ViewTransition } from "./ViewTransition.js";
export default function Page() {
  return <ViewTransition visible={true} />;
}`;
    await writeFile(filename, code);
    await writeFile(
      componentFilename,
      `export function ViewTransition(props: { visible: boolean }) {
  return <main>{props.visible && <span>Visible</span>}</main>;
}`,
    );

    const output = await buildClientRouteOutput({
      code,
      filename,
      minify: false,
      routePath: "/",
    });

    expect(output.code).not.toContain(rootDir);
    expect(output.code).not.toContain(componentFilename);
    expect(output.code).not.toContain("ViewTransition.tsx#ViewTransition");
    expect(output.code).toContain("//#region ViewTransition.tsx");
    expect(output.code).toContain("//#region page.mreact.tsx?mreact-router-entry");
    expect(output.code).toContain("//#region packages/reactive-dom/src/scope.ts");
  });

  test("does not leak project-relative component paths from production batch output", async () => {
    const rootDir = await mkdtemp(join(process.cwd(), ".mreact-production-batch-regions-"));
    const appDir = join(rootDir, "src");
    const filename = join(appDir, "page.mreact.tsx");
    const componentFilename = join(appDir, "ViewTransition.tsx");
    const storeFilename = join(appDir, "store.ts");
    const code = `import { ViewTransition } from "./ViewTransition.js";
export default function Page() {
  return <ViewTransition />;
}`;
    try {
      await mkdir(appDir, { recursive: true });
      await writeFile(filename, code);
      await writeFile(
        componentFilename,
        `import { label } from "./store.js";
export function ViewTransition() {
  return <main>{label}</main>;
}`,
      );
      await writeFile(storeFilename, `export const label = "Visible";`);

      const output = await import("../src/client.js").then((module) =>
        module.buildClientRouteBatchOutput({
          minify: false,
          projectRoot: process.cwd(),
          routes: [{ code, filename, routePath: "/" }],
        }),
      );
      const bundleCode = output.chunks.map((chunk) => chunk.code).join("\n");

      expect(bundleCode).not.toContain(rootDir);
      expect(bundleCode).not.toContain(componentFilename);
      expect(bundleCode).not.toContain(storeFilename);
      expect(bundleCode).not.toContain(
        join(rootDir.slice(process.cwd().length + 1), "src", "ViewTransition.tsx"),
      );
      expect(bundleCode).not.toContain(
        join(rootDir.slice(process.cwd().length + 1), "src", "store.ts"),
      );
      expect(bundleCode).toContain("//#region ViewTransition.tsx");
      expect(bundleCode).toContain("//#region store.ts");
      expect(bundleCode).toMatch(/\/\/#region packages\/reactive-dom\/src\/[^/\n]+\.ts/);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test("builds client route modules for imported interactive child components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-imported-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { Counter } from "./Counter";

export default function Page() {
  return <Counter />;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = manifest.routes[0]?.script;

    expect(manifest.routes[0]?.client).toBe(true);
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(await readFile(join(outDir, "client", script ?? ""), "utf8")).toContain(
      "__mreactHydrateRoute",
    );
  });

  test("renders hydration markers and client script for interactive pages", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hydrate-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-route-id="index"');
    expect(html).toContain('id="mreact-props-index"');
    expect(html).toContain('src="/_mreact/client/routes/index.js"');
  });

  test("renders a client script for route-side client data loading without event handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-data-load-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const items = cell<readonly string[]>([]);
const started = cell(false);

function startLoad() {
  if (typeof window === "undefined" || started.get()) return;
  started.set(true);
  queueMicrotask(() => items.set(["A"]));
}

export default function Page() {
  startLoad();
  return <main>{items.get().length === 0 ? <p>Empty</p> : <p>Full</p>}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain("<p>Empty</p>");
    expect(html).toContain('src="/_mreact/client/routes/index.js"');
  });

  test("replaces SSR reactive text after route-side client data loading", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-reactive-text-replace-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const child = cell<{ name: string; photoCount: number } | null>(null);
const media = cell<readonly string[]>([]);
const started = cell(false);

function t(key: string, params?: { count?: number; name?: string }) {
  if (key === "child.title") return "お子さま";
  if (key === "child.albumTitle") return \`\${params?.name ?? "お子さま"}のアルバム\`;
  if (key === "album.mediaCount") return \`\${params?.count ?? 0}枚\`;
  return key;
}

function startLoad() {
  if (typeof window === "undefined" || started.get()) return;
  started.set(true);
  queueMicrotask(() => {
    child.set({ name: "Sora", photoCount: 1 });
    media.set(["photo-1"]);
  });
}

export default function Page() {
  startLoad();
  return (
    <main>
      <h1>{t("child.albumTitle", { name: child.get()?.name ?? t("child.title") })}</h1>
      <p>{t("album.mediaCount", { count: child.get()?.photoCount ?? media.get().length })}</p>
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><h1>お子さまのアルバム</h1><p>0枚</p><ul></ul></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#reactive-text-replace`
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector("h1")?.textContent).toBe("Soraのアルバム");
    expect(document.querySelector("p")?.textContent).toBe("1枚");
  });

  test("removes stale SSR fallback branches after route-side client data loading", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-branch-replace-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const child = cell<{ name: string } | null>(null);
const started = cell(false);

function startLoad() {
  if (typeof window === "undefined" || started.get()) return;
  started.set(true);
  queueMicrotask(() => child.set({ name: "Sora" }));
}

export default function Page() {
  startLoad();
  return (
    <main>
      {child.get() === null ? <h1>お子さまのアルバム</h1> : <h1>{child.get()?.name}のアルバム</h1>}
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><h1>お子さまのアルバム</h1></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#dynamic-branch-replace`
    );
    await Promise.resolve();
    await Promise.resolve();

    expect([...document.querySelectorAll("h1")].map((node) => node.textContent)).toEqual([
      "Soraのアルバム",
    ]);
  });

  test("hydrates dynamic branch markers before later client reinsertion", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-marker-reinsert-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(true);

export default function Page() {
  return (
    <main>
      <button type="button" onClick={() => visible.set((current) => !current)}>Toggle</button>
      {visible.get() ? <p>Visible</p> : null}
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><button type="button">Toggle</button><p>Visible</p><!----></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#dynamic-marker-reinsert`
    );

    const button = document.querySelector("button");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")).toBeNull();

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")?.textContent).toBe("Visible");
  });

  test("replaces a route root conditional after async route-side cell loading", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-root-conditional-replace-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const status = cell<"loading" | "ok">("loading");
const sharedMedia = cell<{ title: string } | null>(null);
const started = cell(false);

function startLoad() {
  if (typeof window === "undefined" || started.get()) return;
  started.set(true);
  queueMicrotask(() => {
    sharedMedia.set({ title: "Shared media" });
    status.set("ok");
  });
}

function SharedMediaView(props: { data: { title: string } }) {
  return <section><h1>{props.data.title}</h1></section>;
}

export default function Page() {
  startLoad();
  if (status.get() === "ok" && sharedMedia.get()) {
    return <SharedMediaView data={sharedMedia.get()!} />;
  }

  return <main>Loading...</main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>Loading...</main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#root-conditional-replace`
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector("main")).toBeNull();
    expect(document.querySelector("section h1")?.textContent).toBe("Shared media");
  });

  test("hydrates markers and attaches event handlers from the client bundle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hydrate-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">count: 0</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"Page","moduleId":"./Page","exportName":"Page"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}`);

    const marker = document.querySelector("[data-mreact-route-id='index']");
    const button = document.querySelector("button");
    expect(marker?.getAttribute("data-mreact-hydrated")).toBe("true");
    expect(
      (
        globalThis as typeof globalThis & {
          __mreactClientReferenceManifests?: Map<string, unknown>;
        }
      ).__mreactClientReferenceManifests?.get("index"),
    ).toEqual([
      {
        name: "Page",
        moduleId: "./Page",
        exportName: "Page",
      },
    ]);
    expect(button?.textContent).toBe("count: 0");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.textContent).toBe("count: 1");
  });

  test("hydrates mapped card action buttons inside mouse drag handles", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hydrate-card-actions-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const notes = cell([{ id: "note-1", content: "First note", position_x: 20, position_y: 30 }]);

export default function Page() {
  async function handleDelete(id: string): Promise<void> {
    const res = await fetch("/api/notes/" + id, { method: "DELETE" });
    if (!res.ok) return;
    notes.set((prev) => prev.filter((note) => note.id !== id));
  }

  function handleDragStart(_event: MouseEvent, _id: string): void {}

  return <div class="board">
    {notes.get().map((note) => (
      <div key={note.id} class="note-card" style={\`left: \${note.position_x}px; top: \${note.position_y}px;\`}>
        <div class="note-drag-handle" onMouseDown={(event: MouseEvent) => handleDragStart(event, note.id)}>
          <span>{note.content}</span>
          <button type="button" class="note-btn danger" onClick={() => handleDelete(note.id)}>Del</button>
        </div>
      </div>
    ))}
  </div>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><div class="board"><div class="note-card" style="left: 20px; top: 30px;"><div class="note-drag-handle"><span>First note</span><button type="button" class="note-btn danger">Del</button></div></div><!----></div></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
    const deleteRequests: string[] = [];
    globalThis.fetch = (async (input, init) => {
      deleteRequests.push(`${String(input)}:${String(init?.method ?? "GET")}`);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#mapped-card-actions`
    );

    document
      .querySelector<HTMLButtonElement>("button.note-btn.danger")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deleteRequests).toEqual(["/api/notes/note-1:DELETE"]);
    expect(document.querySelectorAll(".note-card")).toHaveLength(0);
  });

  test("marks the document as hydrated and dispatches a hydration readiness event", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-document-hydrated-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">count: 0</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
    const events: unknown[] = [];
    window.addEventListener("mreact:hydrated", (event) => {
      events.push((event as CustomEvent).detail);
    });

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });

    expect(document.documentElement.hasAttribute("data-mreact-hydrated")).toBe(false);
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#document-hydrated`
    );

    expect(document.documentElement.getAttribute("data-mreact-hydrated")).toBe("true");
    expect(events).toEqual([{ routeId: "index" }]);
  });

  test("hydrates inferred client reference boundaries without rerendering the server shell", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter(props) {
  const count = cell(props.initial);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{props.label}: {count.get()}</button>;
}`,
    );
    const code = `import { Counter } from "./Counter";

export default function Page() {
  return <main><h1>Server shell</h1><Counter initial={2} label="Count" /></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><h1>Server shell</h1><template data-mreact-client-boundary="Counter"></template><script type="application/json" data-mreact-client-boundary-props="Counter">{"initial":2,"label":"Count"}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"Counter","moduleId":"./Counter","exportName":"Counter"}]</script>',
    ].join("");
    const serverMain = document.querySelector("main");
    const serverHeading = document.querySelector("h1");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}`);

    const main = document.querySelector("main");
    const heading = document.querySelector("h1");
    const button = document.querySelector("button");

    expect(main).toBe(serverMain);
    expect(heading).toBe(serverHeading);
    expect(button?.textContent).toBe("Count: 2");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.textContent).toBe("Count: 3");
  });

  test("hydrates inferred client boundary wrappers with SSR fallback children", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-wrapper-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "PullToRefresh.tsx"),
      `export function PullToRefresh(props) {
  return (
    <section data-testid="pull-to-refresh" onTouchStart={() => document.body.setAttribute("data-pull-hydrated", "yes")}>
      {props.children}
    </section>
  );
}`,
    );
    const code = `import { PullToRefresh } from "./PullToRefresh";

export default function Page() {
  return (
    <main>
      <PullToRefresh onRefresh={() => {}}>
        <div data-testid="timeline-virtual-grid"><article>First story</article></div>
      </PullToRefresh>
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><template data-mreact-client-boundary="PullToRefresh" data-mreact-client-boundary-nonserializable="true"></template><div data-testid="timeline-virtual-grid"><article>First story</article></div><script type="application/json" data-mreact-client-boundary-props="PullToRefresh">{}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"PullToRefresh","moduleId":"./PullToRefresh","exportName":"PullToRefresh"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-wrapper-children`
    );

    const wrapper = document.querySelector("[data-testid='pull-to-refresh']");
    const timeline = document.querySelector("[data-testid='timeline-virtual-grid']");

    expect(wrapper).not.toBeNull();
    expect(wrapper?.contains(timeline)).toBe(true);
    expect(document.querySelectorAll("[data-testid='timeline-virtual-grid']")).toHaveLength(1);

    wrapper?.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    expect(document.body.getAttribute("data-pull-hydrated")).toBe("yes");
  });

  test("hydrates native boundary children without nesting the rendered component fallback", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-complete-fallback-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Shell.tsx"),
      `export function Shell(props) {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  return <main data-shell="settings" data-pathname={pathname}>{props.children}</main>;
}`,
    );
    const code = `import { Shell } from "./Shell";

export default function Page() {
  return <Shell><h1>Settings</h1></Shell>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><template data-mreact-client-boundary="Shell" data-mreact-client-boundary-fallback="component"></template><main data-shell="settings"><p>Server-only fallback</p></main><template data-mreact-client-boundary-children="Shell"><!--mreact-client-boundary-children-start--><h1>Settings</h1><!--mreact-client-boundary-children-end--></template><script type="application/json" data-mreact-client-boundary-props="Shell">{}</script></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"Shell","moduleId":"./Shell","exportName":"Shell"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#complete-boundary-fallback`
    );

    const shell = document.querySelector("[data-shell='settings']");

    expect(document.querySelectorAll("[data-shell='settings']")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelectorAll("p")).toHaveLength(0);
    expect(shell?.querySelector("[data-shell='settings']")).toBeNull();
    expect(shell?.textContent).toBe("Settings");
    expect(document.querySelector("template[data-mreact-client-boundary='Shell']")).toBeNull();
    expect(
      document.querySelector("template[data-mreact-client-boundary-children='Shell']"),
    ).toBeNull();
    expect(document.querySelector("script[data-mreact-client-boundary-props='Shell']")).toBeNull();
  });

  test("restores an explicitly empty original children archive as an empty string", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-empty-archive-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Shell.tsx"),
      `export function Shell(props) {
  return <main data-children={props.children === "" ? "empty" : "missing"}>{props.children}</main>;
}`,
    );
    const code = `import { Shell } from "./Shell";

export default function Page(props) {
  return <Shell>{props.label}</Shell>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><template data-mreact-client-boundary="Shell" data-mreact-client-boundary-fallback="component"></template><main data-children="empty"></main><template data-mreact-client-boundary-children="Shell"><!--mreact-client-boundary-children-start--><!--mreact-client-boundary-children-end--></template><script type="application/json" data-mreact-client-boundary-props="Shell">{}</script></div>',
      '<script type="application/json" id="mreact-props-index">{"label":""}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"Shell","moduleId":"./Shell","exportName":"Shell"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#empty-boundary-archive`
    );

    expect(document.querySelector("main")?.getAttribute("data-children")).toBe("empty");
    expect(
      document.querySelector("template[data-mreact-client-boundary-children='Shell']"),
    ).toBeNull();
  });

  test("hydrates nested client boundaries restored from the original children archive", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-nested-archive-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Shell.tsx"),
      `export function Shell(props) {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  return <main data-shell="settings" data-pathname={pathname}>{props.children}</main>;
}`,
    );
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" data-counter onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const code = `import { Counter } from "./Counter";
import { Shell } from "./Shell";

export default function Page() {
  return <Shell><Counter /></Shell>;
}`;
    await writeFile(file, code);
    const nestedBoundary =
      '<template data-mreact-client-boundary="Counter"></template><button type="button" data-counter>count: 0</button><script type="application/json" data-mreact-client-boundary-props="Counter">{}</script>';
    document.body.innerHTML = [
      `<div data-mreact-route-id="index"><template data-mreact-client-boundary="Shell" data-mreact-client-boundary-fallback="component"></template><main data-shell="settings">${nestedBoundary}</main><template data-mreact-client-boundary-children="Shell"><!--mreact-client-boundary-children-start-->${nestedBoundary}<!--mreact-client-boundary-children-end--></template><script type="application/json" data-mreact-client-boundary-props="Shell">{}</script></div>`,
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"Counter","moduleId":"./Counter","exportName":"Counter"},{"name":"Shell","moduleId":"./Shell","exportName":"Shell"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#nested-boundary-archive`
    );

    const counter = document.querySelector<HTMLButtonElement>("button[data-counter]");

    expect(document.querySelectorAll("[data-shell='settings']")).toHaveLength(1);
    expect(document.querySelectorAll("button[data-counter]")).toHaveLength(1);
    expect(document.querySelectorAll("template[data-mreact-client-boundary]")).toHaveLength(0);
    counter?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(counter?.textContent).toBe("count: 1");
  });

  test("hydrates inferred client boundary wrappers with multiple SSR fallback siblings", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-multiple-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "BoundaryPanel.tsx"),
      `export function BoundaryPanel(props) {
  return (
    <section data-testid="boundary-panel" onClick={() => document.body.setAttribute("data-panel-hydrated", "yes")}>
      {props.children}
    </section>
  );
}`,
    );
    const code = `import { BoundaryPanel } from "./BoundaryPanel";

export default function Page() {
  return (
    <main>
      <BoundaryPanel onRefresh={() => {}}>
        Intro <span data-testid="server-a">A</span> <span data-testid="server-b">B</span>
      </BoundaryPanel>
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><template data-mreact-client-boundary="BoundaryPanel" data-mreact-client-boundary-nonserializable="true"></template>Intro <span data-testid="server-a">A</span> <span data-testid="server-b">B</span><script type="application/json" data-mreact-client-boundary-props="BoundaryPanel">{}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"BoundaryPanel","moduleId":"./BoundaryPanel","exportName":"BoundaryPanel"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-multiple-children`
    );

    const wrapper = document.querySelector("[data-testid='boundary-panel']");
    const first = document.querySelector("[data-testid='server-a']");
    const second = document.querySelector("[data-testid='server-b']");

    expect(wrapper?.textContent?.replace(/\s+/g, " ").trim()).toBe("Intro A B");
    expect(wrapper?.contains(first)).toBe(true);
    expect(wrapper?.contains(second)).toBe(true);
    expect(document.querySelectorAll("[data-testid='server-a']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='server-b']")).toHaveLength(1);

    wrapper?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.body.getAttribute("data-panel-hydrated")).toBe("yes");
  });

  test("keeps inferred boundary fallback static when no client callback is provided", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-static-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "StaticActionCard.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function StaticActionCard(props) {
  const label = cell("Static fallback").get();
  if (props.onConfirm === undefined) {
    return <article data-testid="static-action-card"><span>{label}</span></article>;
  }
  return <button type="button" data-testid="static-action-card" onClick={() => props.onConfirm()}>Interactive</button>;
}`,
    );
    const code = `import { StaticActionCard } from "./StaticActionCard";

export default function Page() {
  return <main><StaticActionCard /></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><template data-mreact-client-boundary="StaticActionCard"></template><article data-testid="static-action-card"><span>Static fallback</span></article><script type="application/json" data-mreact-client-boundary-props="StaticActionCard">{}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"StaticActionCard","moduleId":"./StaticActionCard","exportName":"StaticActionCard"}]</script>',
    ].join("");
    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-static-no-callback`
    );

    const hydratedCard = document.querySelector("[data-testid='static-action-card']");

    expect(hydratedCard?.tagName).toBe("ARTICLE");
    expect(hydratedCard?.textContent).toBe("Static fallback");
    expect(document.querySelectorAll("[data-testid='static-action-card']")).toHaveLength(1);
  });

  test("hydrates inferred boundary fallback then switches to interactive branch when a callback arrives", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-late-callback-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "ActionCard.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function ActionCard(props) {
  const label = cell("Static fallback").get();
  if (props.onConfirm === undefined) {
    return <article data-testid="action-card"><span>{label}</span></article>;
  }
  return <button type="button" data-testid="action-card" onClick={() => props.onConfirm()}>Interactive</button>;
}`,
    );
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { ActionCard } from "./ActionCard";

const enabled = cell(false);

export default function Page() {
  return (
    <main>
      <button type="button" data-testid="enable-action" onClick={() => enabled.set(true)}>Enable</button>
      <ActionCard onConfirm={enabled.get() ? () => document.body.setAttribute("data-action-confirmed", "yes") : undefined} />
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><button type="button" data-testid="enable-action">Enable</button><template data-mreact-client-boundary="ActionCard"></template><article data-testid="action-card"><span>Static fallback</span></article><script type="application/json" data-mreact-client-boundary-props="ActionCard">{}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"ActionCard","moduleId":"./ActionCard","exportName":"ActionCard"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-late-callback`
    );

    const staticCard = document.querySelector("[data-testid='action-card']");

    expect(staticCard?.tagName).toBe("ARTICLE");
    expect(staticCard?.textContent).toBe("Static fallback");
    expect(document.querySelectorAll("[data-testid='action-card']")).toHaveLength(1);

    document
      .querySelector("[data-testid='enable-action']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    const interactiveCard = document.querySelector("[data-testid='action-card']");

    expect(interactiveCard?.tagName).toBe("BUTTON");
    expect(interactiveCard?.textContent).toBe("Interactive");
    expect(document.querySelectorAll("[data-testid='action-card']")).toHaveLength(1);

    interactiveCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.body.getAttribute("data-action-confirmed")).toBe("yes");
  });

  test("hydrates parser-sensitive table fallback without duplicating rows", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-table-fallback-hydrate-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "InteractiveRows.tsx"),
      `export function InteractiveRows(props) {
  if (props.onSelect === undefined) {
    return <tbody>{props.children}</tbody>;
  }

  return <tbody onClick={() => props.onSelect()}>{props.children}</tbody>;
}`,
    );
    const code = `import { InteractiveRows } from "./InteractiveRows";

export default function Page() {
  return (
    <main>
      <table>
        <InteractiveRows onSelect={() => document.body.setAttribute("data-row-selected", "yes")}>
          <tr data-testid="user-row"><td>Ada</td></tr>
        </InteractiveRows>
      </table>
    </main>
  );
}`;
    await writeFile(file, code);
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="InteractiveRows"');
    setDocumentBodyFromHtml(html);
    const serverRow = document.querySelector("[data-testid='user-row']");
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#table-fallback-hydrate`
    );

    const tbody = document.querySelector("tbody");
    const row = document.querySelector("[data-testid='user-row']");

    expect(document.querySelectorAll("[data-testid='user-row']")).toHaveLength(1);
    expect(row).toBe(serverRow);
    expect(tbody?.contains(row)).toBe(true);
  });

  test("hydrates route picture media without duplicating sources", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-picture-media-hydrate-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const ready = cell(false);

export default function Page() {
  return (
    <main>
      <picture data-testid="hero-picture">
        <source media="(min-width: 640px)" srcSet="/hero-wide.avif" />
        <img data-testid="hero-image" src="/hero.jpg" alt="Hero" />
      </picture>
      <button type="button" onClick={() => ready.set(true)}>{ready.get() ? "Ready" : "Idle"}</button>
    </main>
  );
}`;
    await writeFile(file, code);
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain("<source");
    setDocumentBodyFromHtml(html);
    const serverPicture = document.querySelector("[data-testid='hero-picture']");
    const serverSource = document.querySelector("source");
    const serverImage = document.querySelector("[data-testid='hero-image']");
    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#picture-media-hydrate`
    );

    const picture = document.querySelector("[data-testid='hero-picture']");
    const source = document.querySelector("source");
    const image = document.querySelector("[data-testid='hero-image']");
    const button = document.querySelector("button");

    expect(document.querySelectorAll("[data-testid='hero-picture']")).toHaveLength(1);
    expect(document.querySelectorAll("source")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='hero-image']")).toHaveLength(1);
    expect(picture).toBe(serverPicture);
    expect(source).toBe(serverSource);
    expect(image).toBe(serverImage);

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(button?.textContent).toBe("Ready");
  });

  test("hydrates boundary children containing a keyed map and a second boundary", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-keyed-second-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "BoundaryPanel.tsx"),
      `export function BoundaryPanel(props) {
  return (
    <section data-testid="keyed-boundary-panel" onClick={() => document.body.setAttribute("data-keyed-panel-hydrated", "yes")}>
      {props.children}
    </section>
  );
}`,
    );
    await writeFile(
      join(appDir, "StatusBadge.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function StatusBadge() {
  const active = cell(false);
  return <button type="button" data-testid="status-badge" onClick={() => active.set(true)}>{active.get() ? "Ready" : "Pending"}</button>;
}`,
    );
    const code = `import { BoundaryPanel } from "./BoundaryPanel";
import { StatusBadge } from "./StatusBadge";

const items = [{ id: "a" }, { id: "b" }];

export default function Page() {
  return (
    <main>
      <BoundaryPanel onRefresh={() => {}}>
        <ul data-testid="keyed-list">
          {items.map((item) => <li key={item.id} data-item-id={item.id}>{item.id}</li>)}
        </ul>
        <StatusBadge />
      </BoundaryPanel>
    </main>
  );
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><template data-mreact-client-boundary="BoundaryPanel" data-mreact-client-boundary-nonserializable="true"></template><ul data-testid="keyed-list"><li data-item-id="a">a</li><li data-item-id="b">b</li></ul><template data-mreact-client-boundary="StatusBadge"></template><script type="application/json" data-mreact-client-boundary-props="StatusBadge">{}</script><script type="application/json" data-mreact-client-boundary-props="BoundaryPanel">{}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"BoundaryPanel","moduleId":"./BoundaryPanel","exportName":"BoundaryPanel"},{"name":"StatusBadge","moduleId":"./StatusBadge","exportName":"StatusBadge"}]</script>',
    ].join("");
    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-keyed-second`
    );

    const wrapper = document.querySelector("[data-testid='keyed-boundary-panel']");
    const list = document.querySelector("[data-testid='keyed-list']");
    const badge = document.querySelector<HTMLButtonElement>("[data-testid='status-badge']");

    expect(wrapper?.contains(list)).toBe(true);
    expect(wrapper?.contains(badge)).toBe(true);
    expect(document.querySelector("[data-item-id='a']")?.textContent).toBe("a");
    expect(document.querySelector("[data-item-id='b']")?.textContent).toBe("b");
    expect(document.querySelectorAll("[data-testid='keyed-list']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid='status-badge']")).toHaveLength(1);

    wrapper?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.body.getAttribute("data-keyed-panel-hydrated")).toBe("yes");

    expect(badge?.textContent).toBe("Pending");
    badge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(badge?.textContent).toBe("Ready");
  });

  test("hydrates conditional client boundary siblings after earlier static children", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-conditional-boundary-order-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "ActivityThumbnailGrid.tsx"),
      `"use client";

export function ActivityThumbnailGrid() {
  return <div data-testid="thumbnail-grid">Thumbnail grid</div>;
}`,
    );
    const code = `import { ActivityThumbnailGrid } from "./ActivityThumbnailGrid";

export default function ActivityRow() {
  const hasThumbnails = true;
  return (
    <section data-testid="activity-row">
      <button type="button">Activity header</button>
      {hasThumbnails ? <ActivityThumbnailGrid /> : null}
    </section>
  );
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain("Activity header");
    expect(html).toContain('data-mreact-client-boundary="ActivityThumbnailGrid"');

    setDocumentBodyFromHtml(html);

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#conditional-boundary-order`
    );

    const row = document.querySelector("[data-testid='activity-row']");
    expect(
      Array.from(row?.children ?? []).map(
        (node) => node.getAttribute("data-testid") ?? node.tagName,
      ),
    ).toEqual(["BUTTON", "thumbnail-grid"]);
  });

  test("renders SSR fallback HTML for inferred client boundaries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-inferred-boundary-ssr-fallback-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "AppNavigation.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const unreadCount = cell(0);

export function AppNavigation() {
  const count = unreadCount.get();
  return (
    <nav aria-label="Desktop navigation">
      <a href="/albums">Albums</a>
      <a href="/favorites">Favorites</a>
      {count > 0 ? <span>{count}</span> : null}
    </nav>
  );
}`,
    );
    const code = `import { AppNavigation } from "./AppNavigation";

export default function AppShell() {
  return <div><AppNavigation /><main>Page content</main></div>;
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="AppNavigation"');
    expect(html).toContain("Albums");
    expect(html).toContain("Favorites");
    expect(html.indexOf("Albums")).toBeLessThan(html.indexOf("Page content"));
  });

  test("renders an inferred interactive client boundary inside a shared wrapper during SSR", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-shared-wrapper-interactive-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Rail.tsx"),
      `import { cell, computed } from "@reckona/mreact-reactive-core";

const selected = cell("Queue");
const label = computed(() => selected.get());

export function Rail() {
  return <aside><button type="button" onClick={() => { selected.set("Updated"); }}>{label.get()}</button></aside>;
}`,
    );
    await writeFile(
      join(appDir, "AppShell.tsx"),
      `import { Rail } from "./Rail";

export function AppShell(props) {
  return <div class="shell"><Rail /><main>{props.children}</main></div>;
}`,
    );
    await writeFile(
      file,
      `"use client";
import { AppShell } from "./AppShell";

export default function Page() {
  return <AppShell><p>Tickets</p></AppShell>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="Rail"');
    expect(html).toContain('<aside><button type="button">Queue</button></aside>');
    expect(html).toContain("<p>Tickets</p>");
    expect(html).not.toContain("onclick=");
  });

  test("preserves named element props through SSR and client hydration", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-named-element-props-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Detail.tsx"),
      `export function Detail({ actions, comments, untrusted }) {
  return <section><header data-testid="actions" data-actions={actions}>{actions}</header><div data-testid="comments">{comments}</div><aside data-testid="untrusted">{untrusted}</aside></section>;
}`,
    );
    await writeFile(
      join(appDir, "WatchToggle.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const watching = cell(false);

export function WatchToggle() {
  return <button type="button" data-testid="watch-toggle" onClick={() => watching.set(value => !value)}>{watching.get() ? "Watching" : "Watch"}</button>;
}`,
    );
    await writeFile(
      join(appDir, "CommentThread.tsx"),
      `export function CommentThread() {
  return <article data-testid="comment-thread">First comment</article>;
}`,
    );
    const code = `"use client";
import { Detail } from "./Detail";
import { WatchToggle } from "./WatchToggle";
import { CommentThread } from "./CommentThread";

export default function Page() {
  return <main><Detail actions={true ? <WatchToggle /> : null} comments={[<CommentThread />]} untrusted={"<script>globalThis.__namedPropInjected = true</script>"} /></main>;
}`;
    await writeFile(file, code);
    let renderError: unknown;

    const response = await renderAppRequest({
      appDir,
      onRenderError: (error) => {
        renderError = error;
      },
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(renderError).toBeUndefined();
    expect(html).toContain('<button type="button" data-testid="watch-toggle">Watch</button>');
    expect(html).toContain('<article data-testid="comment-thread">First comment</article>');
    expect(html).not.toContain("&lt;button");
    expect(html).toContain(
      '<aside data-testid="untrusted">&lt;script&gt;globalThis.__namedPropInjected = true&lt;/script&gt;</aside>',
    );

    setDocumentBodyFromHtml(html);

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#named-element-props`
    );

    const watchToggle = document.querySelector("[data-testid='watch-toggle']");
    const comments = document.querySelector("[data-testid='comments']");
    const untrusted = document.querySelector("[data-testid='untrusted']");

    expect(watchToggle?.textContent).toBe("Watch");
    expect(document.querySelector("[data-testid='actions']")?.hasAttribute("data-actions")).toBe(
      false,
    );
    expect(comments?.textContent).toBe("First comment");
    expect(untrusted?.textContent).toBe("<script>globalThis.__namedPropInjected = true</script>");
    expect(untrusted?.querySelector("script")).toBeNull();

    watchToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("[data-testid='watch-toggle']")?.textContent).toBe("Watching");
  });

  test("hydrates an AppShell client boundary that initially returns null inside a list", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-shell-null-boundary-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "UploadNavigationItem.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const canUpload = cell(false);
let loaded = false;

export function UploadNavigationItem(props: {
  readonly compact?: boolean;
  readonly linkClass: string;
}) {
  if (!loaded) {
    loaded = true;
    Promise.resolve().then(() => {
      globalThis.__uploadRequests = (globalThis.__uploadRequests ?? 0) + 1;
      canUpload.set(true);
    });
  }

  if (!canUpload.get()) return null;

  return <li class={props.compact ? "compact" : ""}><a class={props.linkClass} href="/upload">Upload</a></li>;
}`,
    );
    await writeFile(
      join(appDir, "AppShell.tsx"),
      `import { UploadNavigationItem } from "./UploadNavigationItem";

function NavigationLinkItem(props: { readonly href: string; readonly label: string; readonly linkClass: string }) {
  return <li><a class={props.linkClass} href={props.href}>{props.label}</a></li>;
}

export function AppShell(props: { readonly compact?: boolean }) {
  const linkClass = "nav-link";
  return (
    <nav aria-label="Desktop navigation">
      <ul>
        <NavigationLinkItem href="/" label="Home" linkClass={linkClass} />
        <UploadNavigationItem compact={props.compact} linkClass={linkClass} />
        <NavigationLinkItem href="/albums" label="Albums" linkClass={linkClass} />
      </ul>
    </nav>
  );
}`,
    );
    const code = `import { AppShell } from "./AppShell";

export default function Page() {
  return <main><AppShell /></main>;
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="UploadNavigationItem"');
    expect(html).toContain('data-mreact-client-boundary-props="UploadNavigationItem"');

    setDocumentBodyFromHtml(html);
    const navTextNodes = Array.from(document.querySelectorAll("nav ul"))
      .flatMap((node) => Array.from(node.childNodes))
      .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "");

    expect(navTextNodes.join("")).not.toContain('"linkClass"');
    expect(document.querySelector("nav a[href='/upload']")).toBeNull();

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#app-shell-null-boundary`
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect((globalThis as { __uploadRequests?: number }).__uploadRequests).toBe(1);
    expect(document.querySelector("nav a[href='/upload']")?.textContent).toBe("Upload");
  });

  test("hydrates a native client boundary returning null as no DOM", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-null-client-boundary-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "AppBoot.client.tsx"),
      `export function AppBoot() {
  globalThis.__mreactBootRuns = (globalThis.__mreactBootRuns ?? 0) + 1;
  return null;
}`,
    );
    const code = `import { AppBoot } from "./AppBoot.client";

export default function Page() {
  return <><AppBoot /><main data-page-shell>Page content</main></>;
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).not.toContain(">null<");
    setDocumentBodyFromHtml(html);
    const pageShell = document.querySelector("[data-page-shell]");

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#null-client-boundary`
    );

    expect((globalThis as { __mreactBootRuns?: number }).__mreactBootRuns).toBe(1);
    expect(
      Array.from(document.body.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent),
    ).not.toContain("null");
    expect(pageShell?.isConnected).toBe(true);
    expect(document.querySelector("template[data-mreact-client-boundary]")).toBeNull();
    expect(document.querySelector("script[data-mreact-client-boundary-props]")).toBeNull();
  });

  test("hydrates an initially-null client boundary after a window event cell update", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-window-event-null-boundary-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "InstallBanner.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const showBanner = cell(false);
const watchStarted = cell(false);

function startWatch(): void {
  if (typeof window === "undefined" || watchStarted.get()) return;
  watchStarted.set(true);
  window.addEventListener("mreact-install-ready", (event) => {
    event.preventDefault();
    showBanner.set(true);
  });
}

export function InstallBanner() {
  startWatch();
  if (!showBanner.get()) return null;
  return <div role="status">Install app</div>;
}`,
    );
    const code = `import { InstallBanner } from "./InstallBanner";

export default function Page() {
  return <main><InstallBanner /></main>;
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="InstallBanner"');

    setDocumentBodyFromHtml(html);
    expect(document.querySelector("[role='status']")).toBeNull();

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#window-event-null-boundary`
    );

    expect(document.querySelector("[role='status']")).toBeNull();

    window.dispatchEvent(new Event("mreact-install-ready"));
    await Promise.resolve();

    expect(document.querySelector("[role='status']")?.textContent).toBe("Install app");
  });

  test("hydrates adjacent initially-null client boundaries after independent window events", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-adjacent-window-event-null-boundaries-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "OfflineBanner.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const offlineVisible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-offline-ready", () => offlineVisible.set(true));
}

export function OfflineBanner() {
  startWatch();
  if (!offlineVisible.get()) return null;
  return <div id="offline-banner">Offline</div>;
}`,
    );
    await writeFile(
      join(appDir, "InstallBanner.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const installVisible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-install-ready", (event) => {
    event.preventDefault();
    installVisible.set(true);
  });
}

export function InstallBanner() {
  startWatch();
  if (!installVisible.get()) return null;
  return <div id="install-banner">Install</div>;
}`,
    );
    await writeFile(
      join(appDir, "UpdateBanner.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const updateVisible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-update-ready", () => updateVisible.set(true));
}

export function UpdateBanner() {
  startWatch();
  if (!updateVisible.get()) return null;
  return <div id="update-banner">Update</div>;
}`,
    );
    const code = `import { OfflineBanner } from "./OfflineBanner";
import { InstallBanner } from "./InstallBanner";
import { UpdateBanner } from "./UpdateBanner";

export default function Page() {
  return (
    <main>
      <OfflineBanner />
      <InstallBanner />
      <UpdateBanner />
    </main>
  );
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="OfflineBanner"');
    expect(html).toContain('data-mreact-client-boundary="InstallBanner"');
    expect(html).toContain('data-mreact-client-boundary="UpdateBanner"');

    setDocumentBodyFromHtml(html);
    expect(document.querySelector("#offline-banner")).toBeNull();
    expect(document.querySelector("#install-banner")).toBeNull();
    expect(document.querySelector("#update-banner")).toBeNull();

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#adjacent-window-event-null-boundaries`
    );

    expect(document.querySelector("#offline-banner")).toBeNull();
    expect(document.querySelector("#install-banner")).toBeNull();
    expect(document.querySelector("#update-banner")).toBeNull();

    window.dispatchEvent(new Event("mreact-install-ready"));
    await Promise.resolve();

    expect(document.querySelector("#install-banner")?.textContent).toBe("Install");

    window.dispatchEvent(new Event("mreact-update-ready"));
    await Promise.resolve();

    expect(document.querySelector("#update-banner")?.textContent).toBe("Update");

    window.dispatchEvent(new Event("mreact-offline-ready"));
    await Promise.resolve();

    expect(document.querySelector("#offline-banner")?.textContent).toBe("Offline");
  });

  test("hydrates an AppShell client boundary whose hidden attribute changes after async state", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-shell-hidden-boundary-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "UploadNavigationItem.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const canUpload = cell(false);
let loaded = false;

export function UploadNavigationItem(props: {
  readonly compact?: boolean;
  readonly linkClass: string;
}) {
  if (!loaded) {
    loaded = true;
    new Promise<void>((resolve) => {
      globalThis.__resolveUploadHiddenAccess = resolve;
    }).then(() => {
      globalThis.__uploadHiddenRequests = (globalThis.__uploadHiddenRequests ?? 0) + 1;
      canUpload.set(true);
    });
  }

  return (
    <li class={props.compact ? "compact" : ""} hidden={!canUpload.get()}>
      <a class={props.linkClass} href="/upload">Upload</a>
    </li>
  );
}`,
    );
    await writeFile(
      join(appDir, "AppShell.tsx"),
      `import { UploadNavigationItem } from "./UploadNavigationItem";

export function AppShell(props: { readonly compact?: boolean }) {
  const linkClass = "nav-link";
  return (
    <nav aria-label="Desktop navigation">
      <ul>
        <li><a class={linkClass} href="/">Home</a></li>
        <UploadNavigationItem compact={props.compact} linkClass={linkClass} />
        <li><a class={linkClass} href="/albums">Albums</a></li>
      </ul>
    </nav>
  );
}`,
    );
    const code = `import { AppShell } from "./AppShell";

export default function Page() {
  return <main><AppShell /></main>;
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    setDocumentBodyFromHtml(html);

    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#app-shell-hidden-boundary`
    );

    let uploadItem = document.querySelector("nav a[href='/upload']")?.closest("li");
    expect(uploadItem).not.toBeNull();
    expect(uploadItem?.hasAttribute("hidden")).toBe(true);

    (globalThis as { __resolveUploadHiddenAccess?: () => void }).__resolveUploadHiddenAccess?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    uploadItem = document.querySelector("nav a[href='/upload']")?.closest("li");
    expect((globalThis as { __uploadHiddenRequests?: number }).__uploadHiddenRequests).toBe(1);
    expect(uploadItem).not.toBeNull();
    expect(uploadItem?.hasAttribute("hidden")).toBe(false);
  });

  test("hydrates a built layout AppShell client boundary whose hidden attribute changes after async state", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-built-app-shell-hidden-boundary-"));
    const appDir = join(rootDir, "src", "app");
    const componentsDir = join(rootDir, "src", "components");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "UploadNavigationItem.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const uploadAccessLoaded = cell(false);
const canUpload = cell(false);

function loadUploadAccess(): void {
  if (typeof window === "undefined" || uploadAccessLoaded.get()) return;
  uploadAccessLoaded.set(true);
  queueMicrotask(async () => {
    globalThis.__uploadHiddenRequests = (globalThis.__uploadHiddenRequests ?? 0) + 1;
    canUpload.set(true);
  });
}

export function UploadNavigationItem(props: {
  readonly compact?: boolean;
  readonly linkClass: string;
}) {
  loadUploadAccess();
  return (
    <li class={props.compact ? "compact" : ""} hidden={!canUpload.get()}>
      <a aria-label="Upload" class={props.linkClass} href="/upload">Upload</a>
    </li>
  );
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import { UploadNavigationItem } from "./UploadNavigationItem";

export function AppShell(props: { readonly compact?: boolean }) {
  const linkClass = "nav-link";
  return (
    <nav aria-label="Desktop navigation">
      <ul>
        <li><a class={linkClass} href="/">Home</a></li>
        <UploadNavigationItem compact={props.compact} linkClass={linkClass} />
        <li><a class={linkClass} href="/albums">Albums</a></li>
      </ul>
    </nav>
  );
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { AppShell } from "../components/AppShell";

export default function Layout() {
  return <html><body><AppShell /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Home</main>;
}`,
    );

    await buildApp({ projectRoot: rootDir, routesDir: appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = manifest.routes[0]?.script;
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    setDocumentBodyFromHtml(await response.text());
    expect(script).toBeDefined();
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(
        await readFile(join(outDir, "client", script ?? ""), "utf8"),
      )}#built-layout-app-shell-hidden-boundary`
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const uploadItem = document.querySelector("nav a[href='/upload']")?.closest("li");
    expect(uploadItem).not.toBeNull();
    expect(uploadItem?.hasAttribute("hidden")).toBe(false);
    expect((globalThis as { __uploadHiddenRequests?: number }).__uploadHiddenRequests).toBe(1);
  });

  test("hydrates dev layout AppShell client boundaries from the page route asset", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-dev-app-shell-hydrate-"));
    const appDir = join(rootDir, "src", "app");
    const componentsDir = join(rootDir, "src", "components");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "AccountMenu.tsx"),
      `"use client";

export function AccountMenu() {
  globalThis.__accountMenuHydrated = (globalThis.__accountMenuHydrated ?? 0) + 1;
  return <button type="button" aria-label="Account menu">Account</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import { AccountMenu } from "./AccountMenu";

export function AppShell() {
  return <header><AccountMenu /></header>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { AppShell } from "../components/AppShell";

export default function Layout() {
  return <html><body><AppShell /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Home</main>;
}`,
    );
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();
    const routeAsset = await renderAppRouterClientAsset(appDir, "/_mreact/client/routes/index.js");
    const routeScript = await routeAsset.text();

    setDocumentBodyFromHtml(html);
    expect(routeAsset.status).toBe(200);
    expect(html).toContain('data-mreact-client-boundary="AccountMenu"');
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(routeScript)}#dev-layout-app-shell-hydrate`
    );
    await Promise.resolve();
    await Promise.resolve();

    expect((globalThis as { __accountMenuHydrated?: number }).__accountMenuHydrated).toBe(1);
    expect(document.querySelector("header button")?.getAttribute("aria-label")).toBe(
      "Account menu",
    );
  });

  test("hydrates dev settings AppShell client boundaries from the matched route asset", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-dev-settings-app-shell-hydrate-"));
    const appDir = join(rootDir, "src", "app");
    const componentsDir = join(rootDir, "src", "components");
    await mkdir(join(appDir, "settings"), { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "UploadNavigationItem.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const loaded = cell(false);
const canUpload = cell(false);

function loadUploadAccess(): void {
  if (typeof window === "undefined" || loaded.get()) return;
  loaded.set(true);
  queueMicrotask(() => {
    globalThis.__devUploadRequests = (globalThis.__devUploadRequests ?? 0) + 1;
    canUpload.set(true);
  });
}

export function UploadNavigationItem(props: { readonly linkClass: string }) {
  loadUploadAccess();
  return (
    <li hidden={!canUpload.get()}>
      <a aria-label="Upload" class={props.linkClass} href="/upload">Upload</a>
    </li>
  );
}`,
    );
    await writeFile(
      join(componentsDir, "AccountMenu.tsx"),
      `"use client";

export function AccountMenu() {
  globalThis.__accountMenuHydrated = (globalThis.__accountMenuHydrated ?? 0) + 1;
  return <button type="button" aria-label="Account menu">Account</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import { AccountMenu } from "./AccountMenu";
import { UploadNavigationItem } from "./UploadNavigationItem";

export function AppShell() {
  const linkClass = "nav-link";
  return <header><nav aria-label="Desktop navigation"><ul><UploadNavigationItem linkClass={linkClass} /></ul></nav><AccountMenu /></header>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { AppShell } from "../components/AppShell";

export default function Layout() {
  return <html><body><AppShell /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "settings", "page.tsx"),
      `export default function SettingsPage() {
  return <main>Settings</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      importPolicy: {
        allowedSourceDirs: [join(rootDir, "src")],
        projectRoot: rootDir,
      },
      request: new Request("http://local.test/settings"),
    });
    const routeAsset = await renderAppRouterClientAsset(
      appDir,
      "/_mreact/client/routes/settings.js",
    );
    const routeScript = await routeAsset.text();
    const html = await response.text();

    expect(html).toContain('src="/_mreact/client/routes/settings.js"');
    setDocumentBodyFromHtml(html);
    expect(routeAsset.status).toBe(200);
    expect(document.querySelector("header button")).toBeNull();
    expect(document.querySelector("nav a[href='/upload']")).toBeNull();

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(routeScript)}#dev-settings-app-shell-hydrate`
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect((globalThis as { __accountMenuHydrated?: number }).__accountMenuHydrated).toBe(1);
    expect((globalThis as { __devUploadRequests?: number }).__devUploadRequests).toBe(1);
    expect(document.querySelector("header button")?.getAttribute("aria-label")).toBe(
      "Account menu",
    );
    expect(document.querySelector("nav a[href='/upload']")?.textContent).toBe("Upload");
  });

  test("hydrates page-imported AppShell nested client boundaries in dev route assets", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-dev-page-imported-app-shell-"));
    const appDir = join(rootDir, "src", "app");
    const componentsDir = join(rootDir, "src", "components", "layout");
    const libDir = join(rootDir, "src", "lib");
    await mkdir(join(appDir, "settings"), { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "locale-state.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const activeLocale = cell("ja");
`,
    );
    await writeFile(
      join(libDir, "i18n.ts"),
      `export function t(key: string, locale: string): string {
  return \`\${locale}:\${key}\`;
}
`,
    );
    await writeFile(
      join(libDir, "auth-guard.ts"),
      `import { readFileSync } from "node:fs";

export function requireSession(_request: Request): void {
  if (readFileSync === undefined) throw new Error("unreachable");
}`,
    );
    await writeFile(
      join(componentsDir, "UploadNavigationItem.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const loaded = cell(false);
const canUpload = cell(false);

function loadUploadAccess(): void {
  if (typeof window === "undefined" || loaded.get()) return;
  loaded.set(true);
  queueMicrotask(() => {
    globalThis.__devUploadRequests = (globalThis.__devUploadRequests ?? 0) + 1;
    canUpload.set(true);
  });
}

export function UploadNavigationItem(props: { readonly compact?: boolean; readonly linkClass: string }) {
  loadUploadAccess();
  return (
    <li class={\`\${props.compact ? "compact" : ""} \${canUpload.get() ? "" : "hidden"}\`}>
      <a aria-label="Upload" class={props.linkClass} href="/upload">Upload</a>
    </li>
  );
}`,
    );
    await writeFile(
      join(componentsDir, "AccountMenu.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function AccountMenu() {
  const loaded = cell(false);
  if (!loaded.get()) {
    loaded.set(true);
    globalThis.__accountMenuHydrated = (globalThis.__accountMenuHydrated ?? 0) + 1;
  }
  return <button type="button" aria-label="Account menu">Account</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "ProfileLocaleSynchronizer.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const started = cell(false);

export function ProfileLocaleSynchronizer() {
  if (!started.get()) {
    started.set(true);
    globalThis.__profileLocaleSyncHydrated = (globalThis.__profileLocaleSyncHydrated ?? 0) + 1;
  }
  return <span aria-hidden="true" hidden data-locale-sync="" />;
}`,
    );
    await writeFile(
      join(componentsDir, "OfflineBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-offline-ready", () => visible.set(true));
}

export function OfflineBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="offline-banner">Offline</div>;
}`,
    );
    await writeFile(
      join(componentsDir, "InstallBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    visible.set(true);
  });
}

export function InstallBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="install-banner">Install</div>;
}`,
    );
    await writeFile(
      join(componentsDir, "SwUpdateBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const hasUpdate = cell(false);
let watching = false;

async function startWatch(): Promise<void> {
  if (typeof navigator === "undefined" || navigator.serviceWorker === undefined || watching) return;
  watching = true;
  const registration = await navigator.serviceWorker.ready;
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (worker === null) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") {
        hasUpdate.set(true);
      }
    });
  });
}

export function SwUpdateBanner() {
  void startWatch();
  if (!hasUpdate.get()) return null;
  return <div id="sw-update-banner" role="status">Update</div>;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import type { JSX } from "@reckona/mreact/jsx-runtime";
import { AccountMenu } from "./AccountMenu";
import { InstallBanner } from "./InstallBanner";
import { OfflineBanner } from "./OfflineBanner";
import { ProfileLocaleSynchronizer } from "./ProfileLocaleSynchronizer";
import { SwUpdateBanner } from "./SwUpdateBanner";
import { UploadNavigationItem } from "./UploadNavigationItem";
import { t } from "../../lib/i18n";
import { activeLocale } from "../../lib/locale-state";

function NavigationLinkItem(props: { readonly compact?: boolean; readonly href: string; readonly label: string; readonly linkClass: string }) {
  return <li class={props.compact ? "compact" : ""}><a aria-label={props.label} class={props.linkClass} href={props.href}>{props.label}</a></li>;
}

function NavigationLinks(props: { readonly compact?: boolean }) {
  const linkClass = props.compact ? "mobile-link" : "desktop-link";
  return (
    <ul>
      <NavigationLinkItem compact={props.compact} href="/" label="Home" linkClass={linkClass} />
      <UploadNavigationItem compact={props.compact} linkClass={linkClass} />
      <NavigationLinkItem compact={props.compact} href="/settings" label="Settings" linkClass={linkClass} />
    </ul>
  );
}

export function AppShell(props: { readonly children: JSX.Element }) {
  const locale = activeLocale.get();
  return (
    <div>
      <header><AccountMenu /></header>
      <nav aria-label="Desktop navigation"><NavigationLinks /></nav>
      <main aria-label={t("settings", locale)}>{props.children}</main>
      <nav aria-label="Mobile navigation"><NavigationLinks compact /></nav>
      <ProfileLocaleSynchronizer />
      <OfflineBanner />
      <InstallBanner />
      <SwUpdateBanner />
    </div>
  );
}`,
    );
    await writeFile(
      join(appDir, "settings", "page.tsx"),
      `import { AppShell } from "../../components/layout/AppShell";
import { requireSession } from "../../lib/auth-guard";

export function loader(context: { readonly request: Request }) {
  requireSession(context.request);
  return {};
}

export default function SettingsPage() {
  return <AppShell><section>Settings</section></AppShell>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      importPolicy: {
        allowedSourceDirs: [join(rootDir, "src")],
        projectRoot: rootDir,
      },
      request: new Request("http://local.test/settings"),
    });
    const routeAsset = await renderAppRouterClientAsset(
      appDir,
      "/_mreact/client/routes/settings.js",
    );
    const routeScript = await routeAsset.text();
    const html = await response.text();
    const installingWorker = new EventTarget() as EventTarget & { state: string };
    const registration = new EventTarget() as EventTarget & {
      installing: (EventTarget & { state: string }) | null;
    };
    installingWorker.state = "installing";
    registration.installing = installingWorker;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve(registration),
      },
    });

    expect(html).toContain('src="/_mreact/client/routes/settings.js"');
    setDocumentBodyFromHtml(html);
    expect(routeAsset.status).toBe(200);
    expect(document.querySelector("header button")).toBeNull();
    expect(document.querySelector("nav a[href='/upload']")).toBeNull();
    expect(document.querySelector("#offline-banner")).toBeNull();
    expect(document.querySelector("#install-banner")).toBeNull();
    expect(document.querySelector("#sw-update-banner")).toBeNull();

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(routeScript)}#dev-page-imported-app-shell`
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect((globalThis as { __accountMenuHydrated?: number }).__accountMenuHydrated).toBe(1);
    expect((globalThis as { __devUploadRequests?: number }).__devUploadRequests).toBe(1);
    expect(
      (globalThis as { __profileLocaleSyncHydrated?: number }).__profileLocaleSyncHydrated,
    ).toBe(1);
    expect(document.querySelector("#offline-banner")).toBeNull();
    expect(document.querySelector("#install-banner")).toBeNull();
    expect(document.querySelector("#sw-update-banner")).toBeNull();
    expect(document.querySelector("header button")?.getAttribute("aria-label")).toBe(
      "Account menu",
    );
    expect(document.querySelectorAll("nav a[href='/upload']")).toHaveLength(2);
    expect(
      Array.from(document.querySelectorAll("nav a[href='/upload']")).every(
        (link) => !link.closest("li")?.classList.contains("hidden"),
      ),
    ).toBe(true);

    const installEvent = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "dismissed"; platform: string }>;
    };
    installEvent.prompt = () => Promise.resolve();
    installEvent.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
    window.dispatchEvent(installEvent);
    await Promise.resolve();

    expect(document.querySelector("#install-banner")?.textContent).toBe("Install");

    registration.dispatchEvent(new Event("updatefound"));
    installingWorker.state = "installed";
    installingWorker.dispatchEvent(new Event("statechange"));
    await Promise.resolve();

    expect(document.querySelector("#sw-update-banner")?.textContent).toBe("Update");

    window.dispatchEvent(new Event("mreact-offline-ready"));
    await Promise.resolve();

    expect(document.querySelector("#offline-banner")?.textContent).toBe("Offline");
  });

  test("dev client route entry strips TypeScript syntax from emitted JavaScript", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-ts-strip-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const fileChildIds = cell<Record<string, readonly string[]>>({});

export default function Page() {
  const draft = cell("");
  return (
    <main>
      <input onInput={(event: InputEvent) => draft.set((event.currentTarget as HTMLInputElement).value)} />
      <output>{Object.keys(fileChildIds.get()).length}:{draft.get()}</output>
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    const entry = await buildClientRouteEntrySource({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });

    expect(entry.code).not.toContain("cell<Record");
    expect(entry.code).not.toContain("event: InputEvent");
    expect(entry.code).not.toContain(" as HTMLInputElement");
  });

  test("dev client route entry lowers component returns after an early prologue branch", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-early-prologue-return-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const landing = cell(false);
const variant = cell(false);
const statusMessage = cell("Saved");

function LandingPage() { return <section>Landing</section>; }
function MainView() { return <main>Main</main>; }

export default function Page() {
  landing.get();
  if (landing.get()) {
    return <LandingPage />;
  }

  const showVariant = variant.get();
  const ready = true;
  if (showVariant && ready) {
    return <aside>Variant{statusMessage.get() && <p aria-live="polite">{statusMessage.get()}</p>}</aside>;
  }

  return <MainView />;
}`;
    await writeFile(file, code);

    const entry = await buildClientRouteEntrySource({
      code,
      filename: file,
      routePath: "/",
    });

    expect(entry.code).not.toContain("&& <p");
    expect(entry.code).not.toContain("return <MainView");
  });

  test("hydrates explicit client routes whose handlers live only in imported children", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-imported-child-route-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "AuthLayout.tsx"),
      `export function AuthLayout(props: { readonly children: unknown }) {
  return <main>{props.children}</main>;
}`,
    );
    await writeFile(
      join(appDir, "LoginForm.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const submitted = cell(false);

export function LoginForm() {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted.set(true);
        globalThis.__loginSubmitHandled = submitted.get();
      }}
    >
      <input name="email" defaultValue="ada@example.com" />
      <input name="password" defaultValue="secret" />
      <button type="submit">Sign in</button>
    </form>
  );
}`,
    );
    const code = `"use client";
import { LoginForm } from "./LoginForm";
import { AuthLayout } from "./AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    const bundle = await buildClientRouteBundle({
      code,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/login",
    });

    document.body.innerHTML = [
      '<div data-mreact-route-id="login"><main><form><input name="email" value="ada@example.com"><input name="password" value="secret"><button type="submit">Sign in</button></form></main></div>',
      '<script type="application/json" id="mreact-props-login">{}</script>',
    ].join("");

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#explicit-client-imported-child`
    );
    const form = document.querySelector("form");
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submit);
    await Promise.resolve();

    expect(bundle).not.toContain("const __mreactComponent = undefined;");
    expect(submit.defaultPrevented).toBe(true);
    expect((globalThis as { __loginSubmitHandled?: boolean }).__loginSubmitHandled).toBe(true);
  });

  test("hydrates Futaba-shaped explicit client routes with imported interactive children", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-futaba-login-route-"));
    const appDir = join(rootDir, "apps", "web-mreact", "src", "app");
    const authComponentsDir = join(rootDir, "apps", "web-mreact", "src", "components", "auth");
    const layoutComponentsDir = join(rootDir, "apps", "web-mreact", "src", "components", "layout");
    const commonComponentsDir = join(rootDir, "apps", "web-mreact", "src", "components", "common");
    const servicesDir = join(rootDir, "apps", "web-mreact", "src", "services");
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(authComponentsDir, { recursive: true });
    await mkdir(layoutComponentsDir, { recursive: true });
    await mkdir(commonComponentsDir, { recursive: true });
    await mkdir(servicesDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { SentryInitializer } from "../components/common/SentryInitializer";

export default function Layout() {
  return <html><body><SentryInitializer /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(commonComponentsDir, "SentryInitializer.tsx"),
      `"use client";

export function SentryInitializer() {
  globalThis.__futabaSentryInitialized = true;
  return null;
}`,
    );
    await writeFile(
      join(servicesDir, "auth-service.ts"),
      `export async function loginWithPassword(input: {
  readonly email: string;
  readonly password: string;
}): Promise<void> {
  globalThis.__futabaLoginPayload = input;
}`,
    );
    await writeFile(
      join(layoutComponentsDir, "AuthLayout.tsx"),
      `import { ConsentBanner } from "../common/ConsentBanner";

export function AuthLayout(props: { readonly children: unknown }) {
  return <main><section>{props.children}</section>{ConsentBanner()}</main>;
}`,
    );
    await writeFile(
      join(commonComponentsDir, "ConsentBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const accepted = cell(false);

export function ConsentBanner() {
  return (
    <aside hidden={accepted.get()}>
      <button type="button" onClick={() => accepted.set(true)}>Accept</button>
    </aside>
  );
}`,
    );
    await writeFile(
      join(authComponentsDir, "LoginForm.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { loginWithPassword } from "../../services/auth-service";

export function LoginForm() {
  const isSubmitting = cell(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        isSubmitting.set(true);
        const form = event.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        void loginWithPassword({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        });
      }}
    >
      <input name="email" defaultValue="ada@example.com" />
      <input name="password" defaultValue="secret" />
      <button type="submit" disabled={isSubmitting.get()}>Sign in</button>
    </form>
  );
}`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `"use client";
import { LoginForm } from "../../components/auth/LoginForm";
import { AuthLayout } from "../../components/layout/AuthLayout";

export const metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}`,
    );
    const routeAsset = await renderAppRouterClientAsset(appDir, "/_mreact/client/routes/login.js");
    const routeScript = await routeAsset.text();
    const response = await renderAppRequest({
      appDir,
      importPolicy: {
        allowedSourceDirs: [join(rootDir, "apps", "web-mreact", "src")],
        projectRoot: rootDir,
      },
      request: new Request("http://local.test/login"),
    });

    expect(routeAsset.status).toBe(200);
    expect(routeScript).not.toMatch(/const\s+__mreactComponent\s*=\s*(?:undefined|void 0);/);
    expect(routeScript).toContain("LoginPage");
    expect(routeScript).toContain("LoginForm");
    expect(routeScript).toContain("loginWithPassword");

    const html = await response.text();
    setDocumentBodyFromHtml(html);
    const marker = document.querySelector("[data-mreact-route-id='login']");

    expect(marker?.querySelectorAll("main")).toHaveLength(1);
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(routeScript)}#futaba-login-route`
    );

    expect(marker?.querySelectorAll("main")).toHaveLength(1);
    expect(marker?.children).toHaveLength(1);
    expect(marker?.querySelector("template[data-mreact-client-boundary]")).toBeNull();
    expect(marker?.querySelector("script[data-mreact-client-boundary-props]")).toBeNull();

    const form = document.querySelector("form");
    const email = document.querySelector<HTMLInputElement>("input[name='email']");
    const password = document.querySelector<HTMLInputElement>("input[name='password']");
    if (email !== null) {
      email.value = "ada@example.com";
      email.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    if (password !== null) {
      password.value = "secret";
      password.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submit);
    await Promise.resolve();

    expect(submit.defaultPrevented).toBe(true);
    expect((globalThis as { __futabaSentryInitialized?: boolean }).__futabaSentryInitialized).toBe(
      true,
    );
    expect((globalThis as { __futabaLoginPayload?: unknown }).__futabaLoginPayload).toEqual({
      email: "ada@example.com",
      password: "secret",
    });
  });

  test("resumes route-owned event handlers when client boundaries share the route", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-mixed-boundary-route-event-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>boundary: {count.get()}</button>;
}`,
    );
    const code = `import { Counter } from "./Counter";

export default function Page() {
  return <main><button type="button" onClick={() => document.body.setAttribute("data-route-clicked", "yes")}>route event</button><Counter /></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><button type="button">route event</button><template data-mreact-client-boundary="Counter"></template><script type="application/json" data-mreact-client-boundary-props="Counter">{}</script></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"Counter","moduleId":"./Counter","exportName":"Counter"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#mixed-boundary-route-event`
    );

    document.querySelector("main > button")?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
      }),
    );

    expect(document.body.getAttribute("data-route-clicked")).toBe("yes");
  });

  test("hydrates client reference boundaries rendered outside the page route marker", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-boundary-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "LocaleSwitcher.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function LocaleSwitcher() {
  const locale = cell("ja");
  return <button type="button" onClick={() => locale.set("en")}>{locale.get()}</button>;
}`,
    );
    const code = `import { LocaleSwitcher } from "./LocaleSwitcher";

export default function Page() {
  return <main><LocaleSwitcher /></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<header><template data-mreact-client-boundary="LocaleSwitcher"></template><script type="application/json" data-mreact-client-boundary-props="LocaleSwitcher">{}</script></header>',
      '<div data-mreact-route-id="index"><main>Server page</main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"LocaleSwitcher","moduleId":"./LocaleSwitcher","exportName":"LocaleSwitcher"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#layout-boundary`
    );

    const button = document.querySelector("header button");
    expect(button?.textContent).toBe("ja");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.textContent).toBe("en");
  });

  test("hydrates imported client components outside the app directory as DOM nodes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-external-client-boundary-"));
    const appDir = join(rootDir, "app");
    const routeDir = join(appDir, "legal", "terms");
    const componentDir = join(rootDir, "components", "legal");
    const libDir = join(rootDir, "lib");
    const file = join(routeDir, "page.mreact.tsx");
    await mkdir(routeDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "locale-state.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const activeLocale = cell("ja");`,
    );
    await writeFile(
      join(componentDir, "LegalPage.tsx"),
      `"use client";

import { activeLocale } from "../../lib/locale-state";

export function LegalPage() {
  const locale = activeLocale.get();
  return <main>{locale}</main>;
}`,
    );
    const code = `import { LegalPage } from "../../../components/legal/LegalPage";

export default function TermsPage() {
  return <LegalPage />;
}`;
    await writeFile(file, code);
    const clientSource = stripRouteClientOnlyExports(code);
    const references = await collectClientRouteReferences({
      appDir,
      code: clientSource,
      filename: file,
    });
    document.body.innerHTML = [
      '<div data-mreact-route-id="legal_terms"><template data-mreact-client-boundary="LegalPage"></template><script type="application/json" data-mreact-client-boundary-props="LegalPage">{}</script></div>',
      '<script type="application/json" id="mreact-props-legal_terms">{}</script>',
      '<script type="application/json" id="mreact-client-references-legal_terms">[{"name":"LegalPage","moduleId":"../../../components/legal/LegalPage","exportName":"LegalPage"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code: clientSource,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/legal/terms",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#external-client-boundary`
    );

    expect(document.querySelector("main")?.textContent).toBe("ja");
    expect(document.querySelector("[data-mreact-route-id='legal_terms']")?.textContent).not.toBe(
      "[object Object]",
    );
  });

  test("hydrates imported client boundaries with conditional siblings before text bindings", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-boundary-conditional-text-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "LegalPage.tsx"),
      `"use client";

import { cell } from "@reckona/mreact-reactive-core";

const locale = cell("ja");

export function LegalPage(props) {
  return (
    <article>
      <h1>{locale.get() === "ja" ? props.titleJa : props.titleEn}</h1>
      {props.terms ? <p class="sr-only" lang="en">Terms of Service</p> : null}
      <p>{locale.get() === "ja" ? props.noticeJa : props.noticeEn}</p>
    </article>
  );
}`,
    );
    const code = `import { LegalPage } from "../components/LegalPage";

export default function Page() {
  return <LegalPage terms={true} titleJa="利用規約" titleEn="Terms of Service" noticeJa="日本語" noticeEn="English" />;
}`;
    await writeFile(file, code);
    const clientSource = stripRouteClientOnlyExports(code);
    const references = await collectClientRouteReferences({
      appDir,
      code: clientSource,
      filename: file,
    });
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><template data-mreact-client-boundary="LegalPage"></template><script type="application/json" data-mreact-client-boundary-props="LegalPage">{"terms":true,"titleJa":"利用規約","titleEn":"Terms of Service","noticeJa":"日本語","noticeEn":"English"}</script></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"LegalPage","moduleId":"../components/LegalPage","exportName":"LegalPage"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code: clientSource,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-conditional-text`
    );

    expect(document.querySelector("article")?.textContent).toContain("利用規約");
    expect(document.querySelector("article")?.textContent).toContain("Terms of Service");
    expect(document.querySelector("article")?.textContent).toContain("日本語");
  });

  test("activates events inside imported client boundaries", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-boundary-events-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "LegalPage.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const locale = cell("ja");

export function LegalPage() {
  return (
    <main>
      <button type="button" onClick={() => locale.set("en")}>English</button>
      <h1>{locale.get() === "ja" ? "利用規約" : "Terms of Service"}</h1>
    </main>
  );
}`,
    );
    const code = `import { LegalPage } from "../components/LegalPage";

export default function Page() {
  return <LegalPage />;
}`;
    await writeFile(file, code);
    const boundaryClientSource = stripRouteClientOnlyExports(code);
    const references = await collectClientRouteReferences({
      appDir,
      code: boundaryClientSource,
      filename: file,
    });
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><template data-mreact-client-boundary="LegalPage"></template><script type="application/json" data-mreact-client-boundary-props="LegalPage">{}</script></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"LegalPage","moduleId":"../components/LegalPage","exportName":"LegalPage"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code: boundaryClientSource,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-events`
    );

    expect(document.querySelector("h1")?.textContent).toBe("利用規約");
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("h1")?.textContent).toBe("Terms of Service");
  });

  test("preserves event handler props passed to imported client components from client routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-boundary-handler-props-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "FormField.tsx"),
      `export function FormField(props) {
  return (
    <label>
      <span>{props.label}</span>
      <input onInput={props.onInput} onBlur={props.onBlur} value={props.value} />
    </label>
  );
}`,
    );
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { FormField } from "../components/FormField";

const value = cell("");
const blurred = cell(false);

export default function Page() {
  return (
    <main>
      <FormField
        label="Email"
        value={value.get()}
        onInput={(event) => value.set(event.currentTarget.value)}
        onBlur={() => blurred.set(true)}
      />
      <p>{value.get()}</p>
      <output>{blurred.get() ? "blurred" : "focused"}</output>
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><template data-mreact-client-boundary="FormField" data-mreact-client-boundary-nonserializable="true"></template><script type="application/json" data-mreact-client-boundary-props="FormField">{"label":"Email","value":""}</script><p></p><output>focused</output></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[{"name":"FormField","moduleId":"../components/FormField","exportName":"FormField"}]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#boundary-handler-props`
    );

    const input = document.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    input!.value = "ada@example.test";
    input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input!.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")?.textContent).toBe("ada@example.test");
    expect(document.querySelector("output")?.textContent).toBe("blurred");
  });

  test("does not bundle server-only route imports for client-boundary-only routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-boundary-server-imports-"));
    const appDir = join(rootDir, "app");
    const componentsDir = join(rootDir, "components");
    const libDir = join(rootDir, "lib");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "store.ts"),
      `import { basename } from "node:path";

export function readTitle(id) {
  return basename(id);
}`,
    );
    await writeFile(
      join(componentsDir, "ConversationShell.tsx"),
      `import { readTitle } from "../lib/store";

export function ConversationShell(props) {
  return <h1>{readTitle(props.id)}</h1>;
}`,
    );
    await writeFile(
      join(componentsDir, "ChatForm.client.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const draft = cell("");

export function ChatForm(props) {
  return <input aria-label="message" value={draft.get()} onInput={(event) => draft.set(event.target.value)} data-conversation-id={props.conversationId} />;
}`,
    );
    const code = `import { ConversationShell } from "../components/ConversationShell";
import { ChatForm } from "../components/ChatForm.client";
import { readTitle } from "../lib/store";

export const stream = true;

export function loader(ctx) {
  return { title: readTitle(ctx.params.id) };
}

export default function Page() {
  return <main><ConversationShell id="abc" /><ChatForm conversationId="abc" /></main>;
}`;
    await writeFile(file, code);
    const boundaryOnlyClientSource = stripRouteClientOnlyExports(code);
    const references = await collectClientRouteReferences({
      appDir,
      code: boundaryOnlyClientSource,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([
      {
        exportName: "ChatForm",
        moduleId: "../components/ChatForm.client",
        name: "ChatForm",
      },
    ]);

    const bundle = await buildClientRouteBundle({
      code: boundaryOnlyClientSource,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });

    expect(bundle).toContain("ChatForm");
    expect(bundle).not.toContain("ConversationShell");
    expect(bundle).not.toContain("node:path");
    expect(bundle).not.toContain("readTitle");
  });

  test("infers imported function-call components as client routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-function-call-client-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "LegalPage.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function LegalPage() {
  const locale = cell("ja");
  return <button type="button" onClick={() => locale.set("en")}>{locale.get()}</button>;
}`,
    );
    const code = `import { LegalPage } from "../components/LegalPage";

export default function Page() {
  return LegalPage();
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">ja</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#function-call-client`
    );

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("button")?.textContent).toBe("en");
  });

  test("hydrates compat client references with hooks and refs from route components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-compat-client-ref-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "VideoPlayer.compat.tsx"),
      `"use client";
import { useEffect, useRef } from "@reckona/mreact-compat";

export function formatLabel(value: string) {
  return value.toUpperCase();
}

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    videoRef.current?.setAttribute("data-ready", formatLabel("yes"));
  }, []);
  return <video ref={videoRef} />;
}`,
    );
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { VideoPlayer } from "../components/VideoPlayer.compat";

const count = cell(0);

export default function Page() {
  return <main><button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button><VideoPlayer /></main>;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([
      {
        exportName: "VideoPlayer",
        moduleId: "../components/VideoPlayer.compat",
        name: "VideoPlayer",
      },
    ]);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    setDocumentBodyFromHtml(await response.text());

    const bundle = await buildClientRouteBundle({
      code,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#compat-client-ref`
    );
    await Promise.resolve();

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("button")?.textContent).toBe("count: 1");
    expect(
      document
        .querySelector("[data-mreact-compat-boundary='VideoPlayer'] video")
        ?.getAttribute("data-ready"),
    ).toBe("YES");
  });

  test("hydrates compat client references into empty boundary parents for layout-sensitive children", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-compat-parent-host-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "ParentProbe.compat.tsx"),
      `"use client";
import { useLayoutEffect, useRef, useState } from "@reckona/mreact-compat";

export function ParentProbe() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [parentClass, setParentClass] = useState("pending");
  useLayoutEffect(() => {
    setParentClass(ref.current?.parentElement?.className || "none");
  }, []);
  return <span ref={ref}>{parentClass}</span>;
}`,
    );
    const code = `import { ParentProbe } from "../components/ParentProbe.compat";

export default function Page() {
  return <main><div class="chart-container"><ParentProbe /></div></main>;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    setDocumentBodyFromHtml(await response.text());

    const bundle = await buildClientRouteBundle({
      code,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#compat-parent-host`
    );
    await Promise.resolve();

    expect(document.querySelector(".chart-container span")?.textContent).toBe("chart-container");
  });

  test("hydrates compat client references whose dependencies import React by default", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-compat-transitive-react-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const rechartsDir = join(rootDir, "node_modules", "recharts");
    const file = join(appDir, "page.mreact.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await mkdir(rechartsDir, { recursive: true });
    await writeFile(
      join(rechartsDir, "package.json"),
      `{"name":"recharts","version":"0.0.0","type":"module","exports":"./index.js"}`,
    );
    await writeFile(
      join(rechartsDir, "index.js"),
      `import React, { useState } from "react";

export function BarChart() {
  const [label] = useState("Revenue");
  return React.createElement("figure", { "data-chart": label }, label);
}
`,
    );
    await writeFile(
      join(componentDir, "RevenueChart.compat.tsx"),
      `"use client";
import { BarChart } from "recharts";

export function RevenueChart() {
  return <BarChart />;
}
`,
    );
    const code = `import { RevenueChart } from "../components/RevenueChart.compat";

export default function Page() {
  return <main><h1>Dashboard</h1><RevenueChart /></main>;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    setDocumentBodyFromHtml(await response.text());

    const bundle = await buildClientRouteBundle({
      code,
      clientBoundaryImports: references.clientBoundaryImports,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#compat-transitive-react`
    );
    await Promise.resolve();

    expect(document.querySelector("h1")?.textContent).toBe("Dashboard");
    expect(
      document.querySelector("[data-mreact-compat-boundary='RevenueChart'] figure")?.textContent,
    ).toBe("Revenue");
  });

  test("hydrates route-local function-call component event handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-function-call-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const currentTheme = cell("system");

function ThemeToggle() {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={currentTheme.get() === "dark" ? "true" : "false"}
      onClick={() => {
        currentTheme.set("dark");
        localStorage.setItem("futaba-theme", "dark");
        document.documentElement.classList.add("dark");
      }}
    >
      Dark
    </button>
  );
}

export default function SettingsAppearancePage() {
  return <main>{ThemeToggle()}</main>;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="settings_appearance"><main><button type="button" role="radio" aria-checked="false">Dark</button></main></div>',
      '<script type="application/json" id="mreact-props-settings_appearance">{}</script>',
    ].join("");
    localStorage.clear();

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/settings/appearance",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-function-call-client`
    );

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(localStorage.getItem("futaba-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.querySelector("button")?.getAttribute("aria-checked")).toBe("true");
  });

  test("hydrates event handlers passed through route-local component props", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-prop-handler-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const enabled = cell(true);

function SwitchControl(props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked ? "true" : "false"}
      aria-labelledby={props.labelledBy}
      onClick={props.onToggle}
    >
      toggle
    </button>
  );
}

export default function SettingsNotificationsPage() {
  return (
    <main>
      <p id="email-notifications-label">Email notifications</p>
      <SwitchControl
        checked={enabled.get()}
        labelledBy="email-notifications-label"
        onToggle={() => enabled.set(!enabled.get())}
      />
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="settings_notifications"><main><p id="email-notifications-label">Email notifications</p><button type="button" role="switch" aria-checked="true" aria-labelledby="email-notifications-label">toggle</button></main></div>',
      '<script type="application/json" id="mreact-props-settings_notifications">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/settings/notifications",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-prop-handler-client`
    );

    const button = document.querySelector("button");
    expect(button?.getAttribute("aria-checked")).toBe("true");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.getAttribute("aria-checked")).toBe("false");
  });

  test("keeps local aliases of route cell reads reactive in client route bindings", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-cell-alias-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const displayNameError = cell("");

export default function ProfilePage() {
  const error = displayNameError.get();

  return (
    <main>
      <button type="button" onClick={() => displayNameError.set("Required")}>
        Save
      </button>
      {error && <p>{error}</p>}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="settings_profile"><main><button type="button">Save</button></main></div>',
      '<script type="application/json" id="mreact-props-settings_profile">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/settings/profile",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-cell-alias-client`
    );

    expect(document.querySelector("p")).toBeNull();

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")?.textContent).toBe("Required");
  });

  test("keeps local aliases of route cell reads reactive in conditional lists", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-cell-alias-list-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const itemsCell = cell<readonly string[]>([]);

export default function ItemsPage() {
  const items = itemsCell.get();

  return (
    <main>
      <button type="button" onClick={() => itemsCell.set(["A"])}>
        Load
      </button>
      {items.length === 0 && <p>Empty</p>}
      {items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="items"><main><button type="button">Load</button></main></div>',
      '<script type="application/json" id="mreact-props-items">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/items",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-cell-alias-list-client`
    );

    expect(document.querySelector("p")?.textContent).toBe("Empty");
    expect(document.querySelector("li")).toBeNull();

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("li")?.textContent).toBe("A");
  });

  test("resumes memoized keyed DOM across an unrelated sibling update", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-memoized-keyed-sibling-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { memo } from "@reckona/mreact";
import { cell } from "@reckona/mreact-reactive-core";

const selectionMode = cell(false);
const media = [{ id: "a", src: "/a.jpg" }, { id: "b", src: "/b.jpg" }];

const MediaList = memo(
  function MediaList(props: { readonly items: typeof media; readonly signature: string }) {
    (globalThis as any).__memoizedKeyedRenders = ((globalThis as any).__memoizedKeyedRenders ?? 0) + 1;
    return <section data-testid="media-list">{props.items.map((item) => (
      <article key={item.id} data-id={item.id}><img src={item.src} alt={item.id} /></article>
    ))}</section>;
  },
  (previous, next) => {
    (globalThis as any).__memoizedKeyedComparisons = ((globalThis as any).__memoizedKeyedComparisons ?? 0) + 1;
    return previous.signature === next.signature;
  },
);

export default function Page() {
  const selecting = selectionMode.get();
  (globalThis as any).__memoizedKeyedPageEvaluations = ((globalThis as any).__memoizedKeyedPageEvaluations ?? 0) + 1;

  return <main>
    <button type="button" onClick={() => selectionMode.set(!selectionMode.get())}>Toggle</button>
    {selecting && <aside data-testid="selection">Selecting</aside>}
    <MediaList items={media} signature="stable" />
  </main>;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><button type="button">Toggle</button><section data-testid="media-list"><article data-id="a"><img src="/a.jpg" alt="a"></article><article data-id="b"><img src="/b.jpg" alt="b"></article></section></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#memoized-keyed-sibling-client`
    );
    await flushRouterMicrotasks();

    const route = document.querySelector<HTMLElement>("[data-mreact-route-id='index']");
    const firstCard = route?.querySelector<HTMLElement>("[data-id='a']");
    const firstImage = firstCard?.querySelector<HTMLImageElement>("img");
    const initialPageEvaluations = (
      globalThis as typeof globalThis & { __memoizedKeyedPageEvaluations?: number }
    ).__memoizedKeyedPageEvaluations;
    const removedMediaNodes: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (
            node instanceof HTMLElement &&
            (node.matches("article, img") || node.querySelector("article, img") !== null)
          ) {
            removedMediaNodes.push(node);
          }
        }
      }
    });
    observer.observe(route as HTMLElement, { childList: true, subtree: true });

    route?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushRouterMicrotasks();
    observer.disconnect();

    expect(route?.querySelector("[data-testid='selection']")?.textContent).toBe("Selecting");
    expect(
      (globalThis as typeof globalThis & { __memoizedKeyedPageEvaluations?: number })
        .__memoizedKeyedPageEvaluations,
    ).toBe(initialPageEvaluations);
    expect(route?.querySelector("[data-id='a']")).toBe(firstCard);
    expect(route?.querySelector("[data-id='a'] img")).toBe(firstImage);
    expect(firstCard?.isConnected).toBe(true);
    expect(firstImage?.isConnected).toBe(true);
    expect(removedMediaNodes).toEqual([]);

    delete (globalThis as typeof globalThis & { __memoizedKeyedPageEvaluations?: number })
      .__memoizedKeyedPageEvaluations;
    delete (globalThis as typeof globalThis & { __memoizedKeyedRenders?: number })
      .__memoizedKeyedRenders;
    delete (globalThis as typeof globalThis & { __memoizedKeyedComparisons?: number })
      .__memoizedKeyedComparisons;
  });

  test("passes object row properties to route-local components inside client route maps", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-component-map-props-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";

import { cell } from "@reckona/mreact-reactive-core";

interface MediaMonthGroup {
  readonly yearMonth: string;
  readonly ids: readonly string[];
}

interface MediaItem {
  readonly createdAt: string;
  readonly id: string;
  readonly takenAt?: string | null;
}

const mediaCell = cell<readonly MediaItem[]>([]);
const activeLocale = cell<"ja" | "en">("ja");
let loaded = false;

function loadGroups() {
  if (loaded) return;
  loaded = true;
  Promise.resolve().then(() => mediaCell.set([
    { id: "media-1", createdAt: "2025-06-15T00:00:00.000Z" },
    { id: "media-2", createdAt: "2025-03-15T00:00:00.000Z" },
  ]));
}

function getMediaMonthKey(item: MediaItem): string {
  const date = new Date(item.takenAt ?? item.createdAt);
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return year + "-" + month;
}

function formatYearMonth(key: string): string {
  const [year, monthValue] = key.split("-");
  const month = Number(monthValue);
  if (activeLocale.get() === "ja") return year + "年" + month + "月";
  return month + "/" + year;
}

const selectedMonth = cell("");

function openCalendarForMonth(yearMonth: string): void {
  selectedMonth.set(yearMonth);
  globalThis.__selectedCalendarMonth = yearMonth;
}

function MonthHeader(props: { readonly onClick: () => void; readonly yearMonth: string }) {
  return (
    <div class="month-header">
      <button type="button" onClick={props.onClick}>
        {formatYearMonth(props.yearMonth)}
        <span>▼</span>
      </button>
    </div>
  );
}

function AppShell(props: { readonly children: JSX.Element }) {
  return (
    <div>
      <header>{activeLocale.get()}</header>
      <main>{props.children}</main>
    </div>
  );
}

function getMediaMonthGroups(): readonly MediaMonthGroup[] {
  const groups = new Map<string, string[]>();
  for (const item of mediaCell.get()) {
    const yearMonth = getMediaMonthKey(item);
    const existing = groups.get(yearMonth);
    if (existing === undefined) {
      groups.set(yearMonth, [item.id]);
    } else {
      existing.push(item.id);
    }
  }
  return Array.from(groups.entries()).map(([yearMonth, ids]) => ({ yearMonth, ids }));
}

export default function CalendarPage() {
  loadGroups();
  const mediaMonthGroups = getMediaMonthGroups();

  return (
    <AppShell>
      <div>
        {mediaCell.get().length > 0 && (
          <button type="button" onClick={() => undefined}>
            Select
          </button>
        )}
      </div>
      {mediaCell.get().length > 0 && (
        <div class="grid">
          {mediaMonthGroups.map((group) => (
            <div class="contents" key={group.yearMonth}>
              <MonthHeader
                yearMonth={group.yearMonth}
                onClick={() => openCalendarForMonth(group.yearMonth)}
              />
              {group.ids.map((mediaId) => (
                <div key={mediaId}>{mediaId}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="calendar"><div><header>ja</header><main></main></div></div>',
      '<script type="application/json" id="mreact-props-calendar">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/calendar",
    });
    expect(bundle).toContain("() => getMediaMonthGroups()");
    expect(bundle).not.toContain("() => mediaMonthGroups");
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-component-map-props`
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(
      [...document.querySelectorAll(".month-header button")].map((node) => node.textContent),
    ).toEqual(["2025年6月▼", "2025年3月▼"]);
    expect(
      [...document.querySelectorAll(".contents > div:last-child")].map((node) => node.textContent),
    ).toEqual(["media-1", "media-2"]);
    document
      .querySelector(".month-header button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect((globalThis as { __selectedCalendarMonth?: string }).__selectedCalendarMonth).toBe(
      "2025-06",
    );
  });

  test("keeps object row props available when nested client route maps read the same row", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-component-nested-map-props-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";

import { cell } from "@reckona/mreact-reactive-core";

interface MediaMonthGroup {
  readonly yearMonth: string;
  readonly ids: readonly string[];
}

const mediaMonthGroups = cell<readonly MediaMonthGroup[]>([]);
let loaded = false;

function loadGroups() {
  if (loaded) return;
  loaded = true;
  Promise.resolve().then(() => mediaMonthGroups.set([
    { yearMonth: "2025-06", ids: ["media-1", "media-2", "media-3", "media-4"] },
  ]));
}

function formatYearMonth(key: string): string {
  const [year, monthValue] = key.split("-");
  return year + "年" + Number(monthValue) + "月";
}

function MonthHeader(props: { readonly yearMonth: string }) {
  return <h2>{formatYearMonth(props.yearMonth)}</h2>;
}

function MediaCard(props: { readonly mediaId: string; readonly quiltHero: boolean }) {
  return <article data-hero={props.quiltHero ? "yes" : "no"}>{props.mediaId}</article>;
}

export default function Page() {
  loadGroups();

  return (
    <main>
      {mediaMonthGroups.get().map((group) => (
        <section class="contents" key={group.yearMonth}>
          <MonthHeader yearMonth={group.yearMonth} />
          {group.ids.map((mediaId) => (
            <MediaCard
              key={mediaId}
              mediaId={mediaId}
              quiltHero={group.ids.length >= 4 && group.ids[0] === mediaId}
            />
          ))}
        </section>
      ))}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    document.body.innerHTML = [
      '<div data-mreact-route-id="nested_timeline"><main></main></div>',
      '<script type="application/json" id="mreact-props-nested_timeline">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/nested/timeline",
    });

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#nested-map-object-row-props`
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector("h2")?.textContent).toBe("2025年6月");
    expect([...document.querySelectorAll("article")].map((node) => node.textContent)).toEqual([
      "media-1",
      "media-2",
      "media-3",
      "media-4",
    ]);
    expect(
      [...document.querySelectorAll("article")].map((node) => node.getAttribute("data-hero")),
    ).toEqual(["yes", "no", "no", "no"]);
  });

  test("does not reuse runtime list item state as route cell state across conditional maps", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-runtime-list-state-route-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";

import { cell } from "@reckona/mreact-reactive-core";

const phase = cell(0);
let started = false;

function start() {
  if (started) return;
  started = true;
  queueMicrotask(() => phase.set(1));
  queueMicrotask(() => phase.set(2));
}

function formatYearMonth(key: string): string {
  const [year, monthValue] = key.split("-");
  return year + "年" + Number(monthValue) + "月";
}

function MonthHeader(props: { readonly yearMonth: string }) {
  return <h2>{formatYearMonth(props.yearMonth)}</h2>;
}

const staleRows = [{ id: "stale-row" }];
const mediaMonthGroups = [{ yearMonth: "2025-06", ids: ["media-1"] }];

export default function Page() {
  start();

  return (
    <main>
      {phase.get() === 1 && (
        <section>
          {staleRows.map((row) => (
            <p key={row.id}>{row.id}</p>
          ))}
        </section>
      )}
      {phase.get() === 2 && (
        <section>
          {mediaMonthGroups.map((group) => (
            <div key={group.yearMonth}>
              <MonthHeader yearMonth={group.yearMonth} />
              {group.ids.map((id) => (
                <p key={id}>{id}</p>
              ))}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    document.body.innerHTML = [
      '<div data-mreact-route-id="timeline"><main></main></div>',
      '<script type="application/json" id="mreact-props-timeline">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/timeline",
    });

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#runtime-list-state-route`
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector("h2")?.textContent).toBe("2025年6月");
    expect([...document.querySelectorAll("p")].map((node) => node.textContent)).toEqual([
      "media-1",
    ]);
  });

  test("hydrates mapped route fragments before later siblings and nested component text", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-fragment-text-"));
    const routeDir = join(appDir, "legal", "privacy");
    const file = join(routeDir, "page.tsx");
    await mkdir(routeDir, { recursive: true });
    const code = `"use client";

import { cell } from "@reckona/mreact-reactive-core";

interface Block {
  readonly textEn: string;
  readonly textJa: string;
}

interface Section {
  readonly blocks: readonly Block[];
  readonly heading: string;
}

const page: { readonly sections: readonly Section[] } = {
  sections: [
    {
      heading: "Introduction",
      blocks: [{
        textEn: "Service terms remain visible after hydration.",
        textJa: "利用規約本文はhydration後も表示されます。",
      }],
    },
    {
      heading: "Contact",
      blocks: [{
        textEn: "Personal information manager: CEO",
        textJa: "株式会社レコナ 個人情報保護管理者: 代表取締役",
      }],
    },
  ],
};

const activeLocale = cell<"ja" | "en">("ja");

function InlineText(props: { readonly textEn: string; readonly textJa: string }) {
  return <span>{activeLocale.get() === "ja" ? props.textJa : props.textEn}</span>;
}

function LegalParagraphText(props: { readonly textEn: string; readonly textJa: string }) {
  return <InlineText textEn={props.textEn} textJa={props.textJa} />;
}

function LegalDocumentBlockView(props: { readonly block: Block }) {
  return (
    <p>
      <LegalParagraphText textEn={props.block.textEn} textJa={props.block.textJa} />
    </p>
  );
}

function LegalSectionView(props: { readonly section: Section }) {
  return (
    <>
      <h2>{props.section.heading}</h2>
      {props.section.blocks.map((block) => (
        <LegalDocumentBlockView block={block} key={block.textJa} />
      ))}
    </>
  );
}

export default function LegalPage() {
  return (
    <article>
      <button type="button" onClick={() => activeLocale.set("en")}>English</button>
      {page.sections.map((section) => (
        <LegalSectionView section={section} key={section.heading} />
      ))}
      <footer>Company contact</footer>
    </article>
  );
}`;
    await writeFile(file, code);
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/legal/privacy"),
    });
    const html = await response.text();
    const routeScriptUrl = /<script type="module" src="([^"]+)"><\/script>/.exec(html)?.[1];
    expect(routeScriptUrl).toBeDefined();
    const routeAsset = await renderAppRouterClientAsset(appDir, routeScriptUrl ?? "");
    const routeScript = await routeAsset.text();

    expect(routeAsset.status).toBe(200);
    setDocumentBodyFromHtml(html);
    expect([...document.querySelectorAll("article > *")].map((node) => node.tagName)).toEqual([
      "BUTTON",
      "H2",
      "P",
      "H2",
      "P",
      "FOOTER",
    ]);

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(routeScript)}#route-fragment-text`
    );
    await Promise.resolve();

    expect([...document.querySelectorAll("article > *")].map((node) => node.tagName)).toEqual([
      "BUTTON",
      "H2",
      "P",
      "H2",
      "P",
      "FOOTER",
    ]);
    expect([...document.querySelectorAll("p")].map((node) => node.textContent)).toEqual([
      "利用規約本文はhydration後も表示されます。",
      "株式会社レコナ 個人情報保護管理者: 代表取締役",
    ]);
    expect(document.querySelector("article > :last-child")?.textContent).toBe("Company contact");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect([...document.querySelectorAll("article > *")].map((node) => node.tagName)).toEqual([
      "BUTTON",
      "H2",
      "P",
      "H2",
      "P",
      "FOOTER",
    ]);
    expect([...document.querySelectorAll("p")].map((node) => node.textContent)).toEqual([
      "Service terms remain visible after hydration.",
      "Personal information manager: CEO",
    ]);
  });

  test("preserves array map callback array parameters in client route bindings", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-map-callback-array-param-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";

const mediaMonthGroups = [{ yearMonth: "2025-06", ids: ["media-1", "media-2", "media-3", "media-4"] }];

function MediaCard(props: { readonly hero: boolean; readonly mediaId: string }) {
  return <article data-hero={props.hero ? "yes" : "no"}>{props.mediaId}</article>;
}

export default function Page() {
  return (
    <main>
      {mediaMonthGroups.map((group) => (
        <section key={group.yearMonth}>
          {group.ids.map((mediaId, index, monthMediaIds) => (
            <MediaCard
              key={mediaId}
              mediaId={mediaId}
              hero={index === 0 && monthMediaIds.length >= 4}
            />
          ))}
        </section>
      ))}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    document.body.innerHTML = [
      '<div data-mreact-route-id="mapcallbackarray"><main></main></div>',
      '<script type="application/json" id="mreact-props-mapcallbackarray">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/mapcallbackarray",
    });

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#map-callback-array-param`
    );
    await Promise.resolve();

    expect([...document.querySelectorAll("article")].map((node) => node.textContent)).toEqual([
      "media-1",
      "media-2",
      "media-3",
      "media-4",
    ]);
    expect(
      [...document.querySelectorAll("article")].map((node) => node.getAttribute("data-hero")),
    ).toEqual(["yes", "no", "no", "no"]);
  });

  test("hydrates keyed lists that insert filtered items after async route cell updates", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-filtered-nav-list-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";

import { cell } from "@reckona/mreact-reactive-core";

const canUpload = cell(false);
const navItems = [
  { href: "/", label: "Home" },
  { href: "/children", label: "Children" },
  { href: "/upload", label: "Upload" },
  { href: "/albums", label: "Albums" },
];

let loaded = false;

function loadUploadPermission() {
  if (loaded) return;
  loaded = true;
  Promise.resolve().then(() => canUpload.set(true));
}

function NavigationLinks() {
  const visibleNavItems = navItems.filter((item) => item.href !== "/upload" || canUpload.get());

  return (
    <ul>
      {visibleNavItems.map((item) => (
        <li key={item.href}>
          <a href={item.href}>{item.label}</a>
        </li>
      ))}
    </ul>
  );
}

export default function AppShell() {
  loadUploadPermission();
  return <nav aria-label="Desktop navigation"><NavigationLinks /></nav>;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><nav aria-label="Desktop navigation"><ul><li><a href="/">Home</a></li><li><a href="/children">Children</a></li><li><a href="/albums">Albums</a></li><!----></ul></nav></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#filtered-nav-list-client`
    );

    await Promise.resolve();
    await Promise.resolve();

    expect([...document.querySelectorAll("nav a")].map((link) => link.textContent)).toEqual([
      "Home",
      "Children",
      "Upload",
      "Albums",
    ]);
  });

  test("renders repeated route cell reads across sibling empty-state conditionals", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-repeated-cell-empty-state-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const albums = cell<readonly string[]>([]);
const isLoading = cell(false);

export default function AlbumsPage() {
  return (
    <main>
      <button type="button" onClick={() => albums.set(["A"])}>Load</button>
      {isLoading.get() && albums.get().length === 0 && <p>Loading</p>}
      {albums.get().length > 0 && <ul>{albums.get().map((album) => <li key={album}>{album}</li>)}</ul>}
      {!isLoading.get() && albums.get().length === 0 && <p>Empty albums</p>}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="albums"><main><button type="button">Load</button><p>Empty albums</p></main></div>',
      '<script type="application/json" id="mreact-props-albums">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/albums",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#repeated-cell-empty-state`
    );

    expect(document.querySelector("p")?.textContent).toBe("Empty albums");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector("li")?.textContent).toBe("A");
  });

  test("renders route-local component branches across repeated cell reads", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-component-cell-branches-"));
    await mkdir(join(appDir, "albums"), { recursive: true });
    const file = join(appDir, "albums", "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { AlbumGrid } from "./AlbumGrid";
import { EmptyAlbums } from "./EmptyAlbums";
import { Loading } from "./Loading";

const albums = cell<readonly string[]>([]);
const isLoading = cell(false);

export default function AlbumsPage() {
  return (
    <main>
      <button type="button" onClick={() => albums.set(["A"])}>Load</button>
      {isLoading.get() && albums.get().length === 0 && <Loading />}
      {albums.get().length > 0 && <AlbumGrid albums={albums.get()} />}
      {!isLoading.get() && albums.get().length === 0 && <EmptyAlbums />}
    </main>
  );
}`;
    await writeFile(file, code);
    await writeFile(
      join(appDir, "albums", "Loading.tsx"),
      `export function Loading() {
  return <p>Loading albums</p>;
}`,
    );
    await writeFile(
      join(appDir, "albums", "AlbumGrid.tsx"),
      `export function AlbumGrid(props: { albums: readonly string[] }) {
  return <ul>{props.albums.map((album) => <li key={album}>{album}</li>)}</ul>;
}`,
    );
    await writeFile(
      join(appDir, "albums", "EmptyAlbums.tsx"),
      `export function EmptyAlbums() {
  return <p>Empty albums</p>;
}`,
    );
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/albums"),
    });
    setDocumentBodyFromHtml(await response.text());

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/albums",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#component-cell-branches`
    );

    expect(document.querySelector("main")?.textContent).toContain("Empty albums");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("main")?.textContent).not.toContain("Empty albums");
    expect(document.querySelector("li")?.textContent).toBe("A");
  });

  test("keeps nested ternary route branches reactive after cell updates", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-nested-ternary-route-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const currentFamily = cell<{ name: string } | null>({ name: "Initial" });
const isLoading = cell(false);
const statusMessage = cell("");

export default function FamilyPage() {
  const activeFamily = currentFamily.get() ?? null;

  return (
    <main>
      {isLoading.get() && !activeFamily ? (
        <p>Loading</p>
      ) : activeFamily ? (
        <section><h2>{activeFamily.name}</h2></section>
      ) : (
        <p>No family</p>
      )}
      <button type="button" onClick={() => {
        currentFamily.set({ name: "Updated" });
        statusMessage.set("Saved");
      }}>Save</button>
      {statusMessage.get() && <p aria-live="polite">{statusMessage.get()}</p>}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="family"><main><section><h2>Initial</h2></section><button type="button">Save</button></main></div>',
      '<script type="application/json" id="mreact-props-family">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/family",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#nested-ternary-route`
    );

    expect(document.querySelector("section")?.textContent).toBe("Initial");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("section")?.textContent).toBe("Updated");
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("Saved");
  });

  test("keeps route-local component ternary branches mounted after sibling cell updates", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-component-ternary-route-"));
    await mkdir(join(appDir, "settings", "family"), { recursive: true });
    const file = join(appDir, "settings", "family", "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { FamilyReadyState } from "./FamilyReadyState";
import { Loading } from "./Loading";
import { NoFamilyState } from "./NoFamilyState";

const currentFamily = cell<{ name: string } | null>({ name: "Initial" });
const isLoading = cell(false);
const statusMessage = cell("");

export default function FamilyPage() {
  const activeFamily = currentFamily.get() ?? null;

  return (
    <main>
      {isLoading.get() && !activeFamily ? (
        <Loading />
      ) : activeFamily ? (
        <FamilyReadyState family={activeFamily} />
      ) : (
        <NoFamilyState />
      )}
      <button type="button" onClick={() => statusMessage.set("Saved")}>Save</button>
      {statusMessage.get() && <p aria-live="polite">{statusMessage.get()}</p>}
    </main>
  );
}`;
    await writeFile(file, code);
    await writeFile(
      join(appDir, "settings", "family", "Loading.tsx"),
      `export function Loading() {
  return <p>Loading family</p>;
}`,
    );
    await writeFile(
      join(appDir, "settings", "family", "FamilyReadyState.tsx"),
      `export function FamilyReadyState(props: { family: { name: string } }) {
  return <section><h2>{props.family.name}</h2></section>;
}`,
    );
    await writeFile(
      join(appDir, "settings", "family", "NoFamilyState.tsx"),
      `export function NoFamilyState() {
  return <p>No family</p>;
}`,
    );
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/settings/family"),
    });
    setDocumentBodyFromHtml(await response.text());
    expect(document.body.innerHTML).toContain('data-mreact-route-id="settings_family"');

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/settings/family",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#component-ternary-route`
    );
    await Promise.resolve();

    expect(document.querySelector("h2")?.textContent).toBe("Initial");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("h2")?.textContent).toBe("Initial");
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("Saved");
  });

  test("keeps repeated route cell reads reactive across sibling conditional branches", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-repeated-cell-route-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const isLoading = cell(true);
const albums = cell<string[]>([]);

export default function AlbumsPage() {
  return (
    <main>
      <button type="button" onClick={() => isLoading.set(false)}>Finish</button>
      {isLoading.get() && albums.get().length === 0 && <p>Loading</p>}
      {albums.get().length > 0 && <ul>{albums.get().map((album) => <li>{album}</li>)}</ul>}
      {!isLoading.get() && albums.get().length === 0 && <p>Empty albums</p>}
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="albums"><main><button type="button">Finish</button><p>Loading</p><!----><!----></main></div>',
      '<script type="application/json" id="mreact-props-albums">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/albums",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#repeated-cell-branches`
    );

    expect(document.querySelector("main")?.textContent).toContain("Loading");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("main")?.textContent).not.toContain("Loading");
    expect(document.querySelector("main")?.textContent).toContain("Empty albums");
  });

  test("hydrates route-local components that initially return null", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-null-component-client-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const open = cell(false);

function FamilyDialog() {
  if (!open.get()) return null;
  return <div role="dialog">Dialog</div>;
}

export default function SettingsFamilyPage() {
  return (
    <main>
      <button type="button" onClick={() => open.set(true)}>Open</button>
      <FamilyDialog />
    </main>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="settings_family"><main><button type="button">Open</button><!----></main></div>',
      '<script type="application/json" id="mreact-props-settings_family">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/settings/family",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-null-component-client`
    );

    expect(document.querySelector("main")?.textContent).toBe("Open");
    expect(document.querySelector("[role='dialog']")).toBeNull();

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("[role='dialog']")?.textContent).toBe("Dialog");
  });

  test("hydrates route-level function-call components inside fragment roots", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-function-call-fragment-client-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "ConsentBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function ConsentBanner() {
  const visible = cell(true);
  return visible.get() ? <aside><button type="button" onClick={() => visible.set(false)}>accept</button></aside> : null;
}`,
    );
    const code = `import { ConsentBanner } from "../components/ConsentBanner";

function AuthLayout() {
  return <main>Login</main>;
}

export default function LoginPage() {
  return (
    <>
      <AuthLayout />
      {ConsentBanner()}
    </>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);

    document.body.innerHTML = [
      '<div data-mreact-route-id="login"><main>Login</main><aside><button type="button">accept</button></aside></div>',
      '<script type="application/json" id="mreact-props-login">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/login",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#function-call-fragment-client`
    );

    const marker = document.querySelector("[data-mreact-route-id='login']");
    expect(marker?.getAttribute("data-mreact-hydrated")).toBe("true");
    expect(document.querySelector("main")?.textContent).toBe("Login");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("aside")).toBeNull();
  });

  test("retargets route-level function-call component reactive attributes to server DOM", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-function-call-fragment-attrs-"));
    const appDir = join(rootDir, "app");
    const componentDir = join(rootDir, "components");
    const file = join(appDir, "page.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentDir, { recursive: true });
    await writeFile(
      join(componentDir, "ConsentBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function ConsentBanner() {
  const visible = cell(true);
  return <aside data-testid="consent-banner" {...{ "data-state": visible.get() ? "pending" : "accepted" }} class={\`\${visible.get() ? "" : "hidden"} fixed\`}><button type="button" onClick={() => visible.set(false)}>accept</button></aside>;
}`,
    );
    await writeFile(
      join(componentDir, "AuthLayout.tsx"),
      `import { ConsentBanner } from "./ConsentBanner";

export function AuthLayout() {
  return (
    <main>
      Login
      {ConsentBanner()}
    </main>
  );
}`,
    );
    const code = `import { AuthLayout } from "../components/AuthLayout";

export default function LoginPage() {
  return <AuthLayout />;
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);

    document.body.innerHTML = [
      '<div data-mreact-route-id="login"><main>Login<aside data-testid="consent-banner" data-state="pending" class=" fixed"><button type="button">accept</button></aside></main></div>',
      '<script type="application/json" id="mreact-props-login">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/login",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#function-call-fragment-attrs`
    );

    const hydratedAside = document.querySelector("aside");
    expect(hydratedAside?.getAttribute("class")).toBe(" fixed");
    expect(hydratedAside?.getAttribute("data-state")).toBe("pending");

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("aside")).toBe(hydratedAside);
    expect(hydratedAside?.getAttribute("class")).toBe("hidden fixed");
    expect(hydratedAside?.getAttribute("data-state")).toBe("accepted");
  });

  test("hydrates loader-derived function-call route content without normalizer errors", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-function-call-loader-data-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

function ResetPasswordConfirmContent(props) {
  const complete = cell(false);

  return (
    <>
      {complete.get() ? (
        <p>Updated {props.token}</p>
      ) : (
        <form>
          <input name="token" value={props.token ?? ""} />
          <button type="button" onClick={() => complete.set(true)}>Reset</button>
        </form>
      )}
    </>
  );
}

function AuthLayout(props) {
  return (
    <main>
      <div>{props.children}</div>
    </main>
  );
}

export default function ResetPasswordConfirmPage(props) {
  const token = props.data?.token ?? null;

  return (
    <AuthLayout>
      {ResetPasswordConfirmContent({ token })}
    </AuthLayout>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);

    document.body.innerHTML = [
      '<div data-mreact-route-id="reset-password_confirm"><main><div><form><input name="token" value="abc"><button type="button">Reset</button></form></div></main></div>',
      '<script type="application/json" id="mreact-props-reset-password_confirm">{"data":{"token":"abc"}}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/reset-password/confirm",
    });

    await expect(
      import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#loader-function-call-content`
      ),
    ).resolves.toBeDefined();

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")?.textContent).toBe("Updated abc");
  });

  test("hydrates interactive loader routes after stripping loader-only server imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-server-import-hydrate-"));
    const file = join(appDir, "page.mreact.tsx");
    await writeFile(
      join(appDir, "db.ts"),
      `import { basename } from "node:path";

export function getAllTasks() {
  return [{ id: "1", title: basename("/tmp/Task") }];
}
`,
    );
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { getAllTasks } from "./db";

export function loader() {
  return getAllTasks();
}

export default function Page(props: { data: Array<{ id: string; title: string }> }) {
  const clicked = cell(false);
  return (
    <main>
      <h1>Tasks</h1>
      <p>{props.data[0]?.title}</p>
      <button type="button" onClick={() => clicked.set(true)}>{clicked.get() ? "Clicked" : "Test"}</button>
    </main>
  );
}`;
    await writeFile(file, code);

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const clientSource = stripRouteClientOnlyExports(code);
    const references = await collectClientRouteReferences({
      appDir,
      code: clientSource,
      filename: file,
    });

    expect(response.status).toBe(200);
    expect(references.client).toBe(true);
    expect(clientSource).not.toContain("./db");
    setDocumentBodyFromHtml(await response.text());

    const asset = await renderAppRouterClientAsset(appDir, "/_mreact/client/routes/index.js");
    const bundle = await asset.text();

    expect(asset.status).toBe(200);
    expect(bundle).not.toContain("node:path");

    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#loader-server-import-dev-hydrate`
    );
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("button")?.textContent).toBe("Clicked");
  });

  test("hydrates compat JSX route content passed through layout children without normalizer errors", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-compat-function-call-children-"));
    const file = join(appDir, "page.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";
import { jsx, jsxs } from "@reckona/mreact-compat/jsx-runtime";

function ResetPasswordConfirmContent(props) {
  const complete = cell(false);

  return complete.get()
    ? jsx("p", { children: ["Updated ", props.token] })
    : jsxs("form", {
        children: [
          jsx("input", { name: "token", value: props.token ?? "" }),
          jsx("button", { type: "button", onClick: () => complete.set(true), children: "Reset" }),
        ],
      });
}

function AuthLayout(props) {
  return (
    <main>
      <div>{props.children}</div>
    </main>
  );
}

export default function ResetPasswordConfirmPage(props) {
  const token = props.data?.token ?? null;

  return (
    <AuthLayout>
      {ResetPasswordConfirmContent({ token })}
    </AuthLayout>
  );
}`;
    await writeFile(file, code);
    const references = await collectClientRouteReferences({
      appDir,
      code,
      filename: file,
    });

    expect(references.client).toBe(true);

    document.body.innerHTML = [
      '<div data-mreact-route-id="reset-password_confirm"><main><div><form><input name="token" value="abc"><button type="button">Reset</button></form></div></main></div>',
      '<script type="application/json" id="mreact-props-reset-password_confirm">{"data":{"token":"abc"}}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/reset-password/confirm",
    });

    await expect(
      import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#compat-function-call-children`
      ),
    ).resolves.toBeDefined();

    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("p")?.textContent).toBe("Updated abc");
  });

  test("resumes matching server DOM instead of replacing the whole route subtree", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-resume-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main><h1>Counter</h1><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><h1>Counter</h1><button type="button">count: 0</button></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
    const serverMain = document.querySelector("main");
    const serverHeading = document.querySelector("h1");
    const serverButton = document.querySelector("button");
    let serverButtonClickListeners = 0;
    let documentClickListeners = 0;
    const serverButtonAddEventListener = serverButton?.addEventListener.bind(serverButton);
    const documentAddEventListener = document.addEventListener.bind(document);

    if (serverButton !== null && serverButtonAddEventListener !== undefined) {
      serverButton.addEventListener = ((type, listener, options) => {
        if (type === "click") {
          serverButtonClickListeners += 1;
        }
        serverButtonAddEventListener(type, listener, options);
      }) as typeof serverButton.addEventListener;
    }

    document.addEventListener = ((type, listener, options) => {
      if (type === "click") {
        documentClickListeners += 1;
      }
      documentAddEventListener(type, listener, options);
    }) as typeof document.addEventListener;

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}`);

    document.addEventListener = documentAddEventListener;

    const resumedMain = document.querySelector("main");
    const resumedHeading = document.querySelector("h1");
    const resumedButton = document.querySelector("button");

    expect(resumedMain).toBe(serverMain);
    expect(resumedHeading).toBe(serverHeading);
    expect(resumedButton).toBe(serverButton);
    expect(serverButtonClickListeners).toBe(0);
    expect(documentClickListeners).toBeGreaterThan(0);

    resumedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(resumedButton?.textContent).toBe("count: 1");
  });

  test("removes stale boundary fallback siblings when route resume replaces the first child", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-resume-replaced-boundary-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main data-shell="active"><h1>Settings</h1><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><template data-mreact-client-boundary="Shell"></template><main data-shell="stale"><h1>Stale settings</h1></main><script type="application/json" data-mreact-client-boundary-props="Shell">{}</script></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
      '<script type="application/json" id="mreact-client-references-index">[]</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#replaced-boundary-cleanup`
    );

    const marker = document.querySelector("[data-mreact-route-id='index']");

    expect(marker?.children).toHaveLength(1);
    expect(marker?.querySelectorAll("main")).toHaveLength(1);
    expect(marker?.querySelector("[data-shell='active']")).not.toBeNull();
    expect(marker?.querySelector("[data-shell='stale']")).toBeNull();
    expect(marker?.querySelector("script[data-mreact-client-boundary-props]")).toBeNull();
  });

  test("exports a hot hydrate entrypoint that preserves route cell state", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hot-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">count: 0</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#hot-state`
    )) as {
      __mreactHydrateRoute: () => void;
    };
    const button = document.querySelector("button");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(button?.textContent).toBe("count: 1");

    routeModule.__mreactHydrateRoute();
    const resumedButton = document.querySelector("button");
    resumedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(resumedButton?.textContent).toBe("count: 2");
  });

  test("preserves route cell state written through setValue and update", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cell-write-apis-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main><button id="set" type="button" onClick={() => count.setValue(1)}>set {count.get()}</button><button id="update" type="button" onClick={() => count.update(value => value + 1)}>update {count.get()}</button></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><button id="set" type="button">set 0</button><button id="update" type="button">update 0</button></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#route-cell-write-apis`
    )) as { __mreactHydrateRoute: () => void };

    document.querySelector<HTMLButtonElement>("#set")?.click();
    await Promise.resolve();
    expect(document.querySelector("#set")?.textContent).toBe("set 1");

    routeModule.__mreactHydrateRoute();
    expect(document.querySelector("#set")?.textContent).toBe("set 1");

    document.querySelector<HTMLButtonElement>("#update")?.click();
    await Promise.resolve();
    expect(document.querySelector("#update")?.textContent).toBe("update 2");

    routeModule.__mreactHydrateRoute();
    expect(document.querySelector("#update")?.textContent).toBe("update 2");
  });

  test("keeps function values opaque across route cell write APIs", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cell-function-writes-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const callback = cell(() => "initial");
  return <main><button id="set-value" type="button" onClick={() => callback.setValue(() => "set-value")}>{callback.get()()}</button><button id="update" type="button" onClick={() => callback.update(() => () => "updated")}>{callback.get()()}</button></main>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><button id="set-value" type="button">initial</button><button id="update" type="button">initial</button></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#route-cell-function-writes`
    )) as { __mreactHydrateRoute: () => void };

    document.querySelector<HTMLButtonElement>("#set-value")?.click();
    await Promise.resolve();
    expect(document.querySelector("#set-value")?.textContent).toBe("set-value");

    routeModule.__mreactHydrateRoute();
    expect(document.querySelector("#set-value")?.textContent).toBe("set-value");

    document.querySelector<HTMLButtonElement>("#update")?.click();
    await Promise.resolve();
    expect(document.querySelector("#update")?.textContent).toBe("updated");

    routeModule.__mreactHydrateRoute();
    expect(document.querySelector("#update")?.textContent).toBe("updated");
  });

  test("preserves route cell state across fresh hot module imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hot-fresh-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const firstCode = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    const secondCode = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(100);
  return <button type="button" data-version="next" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, firstCode);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">count: 0</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const firstBundle = await buildClientRouteBundle({
      code: firstCode,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(firstBundle)}#hot-fresh-a`
    );
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(document.querySelector("button")?.textContent).toBe("count: 1");

    const secondBundle = await buildClientRouteBundle({
      code: secondCode,
      filename: file,
      routePath: "/",
    });
    const secondModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(secondBundle)}#hot-fresh-b`
    )) as { __mreactHydrateRoute: () => void };
    secondModule.__mreactHydrateRoute();

    const button = document.querySelector("button");
    expect(button?.getAttribute("data-version")).toBe("next");
    expect(button?.textContent).toBe("count: 1");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(button?.textContent).toBe("count: 2");
  });

  test("drops route cell state when a hot module changes the cell callsite signature", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hot-signature-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const firstCode = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    const secondCode = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(100);
  const other = cell("new");
  return <button type="button" data-other={other.get()} onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, firstCode);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">count: 0</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const firstBundle = await buildClientRouteBundle({
      code: firstCode,
      filename: file,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(firstBundle)}#hot-signature-a`
    );
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(document.querySelector("button")?.textContent).toBe("count: 1");

    const secondBundle = await buildClientRouteBundle({
      code: secondCode,
      filename: file,
      routePath: "/",
    });
    const secondModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(secondBundle)}#hot-signature-b`
    )) as { __mreactHydrateRoute: () => void };
    secondModule.__mreactHydrateRoute();

    const button = document.querySelector("button");
    expect(button?.getAttribute("data-other")).toBe("new");
    expect(button?.textContent).toBe("count: 100");
  });

  test("exports client navigation that swaps route HTML and hydrates the next route", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-navigate-runtime-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`;
    await writeFile(file, code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><button type="button">count: 0</button></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#navigation`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="about"><button type="button">count: 0</button></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
      ].join(""),
      "/about",
    );

    expect(document.querySelector("[data-mreact-route-id='index']")).toBeNull();
    expect(document.querySelector("[data-mreact-route-id='about']")).not.toBeNull();
    expect(document.getElementById("mreact-props-index")).toBeNull();
    expect(document.getElementById("mreact-props-about")).not.toBeNull();
  });

  test("disposes route-scope reactive effects on SPA navigation", async () => {
    const code = `import { effect } from "@reckona/mreact-reactive-core";

const state = globalThis as typeof globalThis & { __opens?: number; __closes?: number };

export default function Page() {
  effect(() => {
    state.__opens = (state.__opens ?? 0) + 1;
    return () => {
      state.__closes = (state.__closes ?? 0) + 1;
    };
  });

  return <main>One</main>;
}`;
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: [],
      clientReferenceManifest: [],
      filename: "/app/one/page.mreact.tsx",
      routePath: "/one",
    });

    const state = globalThis as typeof globalThis & { __opens?: number; __closes?: number };
    state.__opens = 0;
    state.__closes = 0;
    document.body.innerHTML = [
      '<div data-mreact-route-id="one"><main>One</main></div>',
      '<script type="application/json" id="mreact-props-one">{}</script>',
    ].join("");

    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#effect-route-cleanup`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };

    expect(state.__opens).toBe(1);
    expect(state.__closes).toBe(0);

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="two"><main>Two</main></div>',
        '<script type="application/json" id="mreact-props-two">{}</script>',
      ].join(""),
      "/two",
    );

    expect(document.querySelector("main")?.textContent).toBe("Two");
    expect(state.__closes).toBe(1);
  });

  test("retargets domRef to retained SSR DOM and cleans it up on navigation", async () => {
    const code = `const state = globalThis as typeof globalThis & {
  __domRefAttaches?: number;
  __domRefCleanups?: number;
  __domRefConnected?: boolean;
  __domRefNode?: Element;
};

export default function Page() {
  return <main domRef={(element) => {
    state.__domRefAttaches = (state.__domRefAttaches ?? 0) + 1;
    state.__domRefConnected = element.isConnected;
    state.__domRefNode = element;
    return () => {
      state.__domRefCleanups = (state.__domRefCleanups ?? 0) + 1;
    };
  }}>One</main>;
}`;
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: [],
      clientReferenceManifest: [],
      filename: "/app/one/page.mreact.tsx",
      routePath: "/one",
    });
    const state = globalThis as typeof globalThis & {
      __domRefAttaches?: number;
      __domRefCleanups?: number;
      __domRefConnected?: boolean;
      __domRefNode?: Element;
    };
    state.__domRefAttaches = 0;
    state.__domRefCleanups = 0;
    document.body.innerHTML = [
      '<div data-mreact-route-id="one"><main>One</main></div>',
      '<script type="application/json" id="mreact-props-one">{}</script>',
    ].join("");
    const ssrNode = document.querySelector("main");

    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#dom-ref-route`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };
    await Promise.resolve();

    expect(state.__domRefNode).toBe(ssrNode);
    expect(state.__domRefConnected).toBe(true);
    expect(state.__domRefAttaches).toBe(1);
    expect(state.__domRefCleanups).toBe(0);

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="two"><main>Two</main></div>',
        '<script type="application/json" id="mreact-props-two">{}</script>',
      ].join(""),
      "/two",
    );

    expect(state.__domRefCleanups).toBe(1);
  });

  test("continues SPA navigation after one route cleanup throws", async () => {
    const code = `import { effect } from "@reckona/mreact-reactive-core";

const state = globalThis as typeof globalThis & { __cleanupEvents?: string[] };

export default function Page() {
  effect(() => () => {
    state.__cleanupEvents?.push("first");
  });
  effect(() => () => {
    state.__cleanupEvents?.push("second");
    throw new Error("cleanup failed");
  });
  return <main>One</main>;
}`;
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: [],
      clientReferenceManifest: [],
      filename: "/app/one/page.mreact.tsx",
      routePath: "/one",
    });
    const state = globalThis as typeof globalThis & { __cleanupEvents?: string[] };
    state.__cleanupEvents = [];
    document.body.innerHTML = [
      '<div data-mreact-route-id="one"><main>One</main></div>',
      '<script type="application/json" id="mreact-props-one">{}</script>',
    ].join("");
    const tasks: VoidFunction[] = [];
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((task) => tasks.push(task));
    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#throwing-route-cleanup`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="two"><main>Two</main></div>',
        '<script type="application/json" id="mreact-props-two">{}</script>',
      ].join(""),
      "/two",
    );

    expect(document.querySelector("main")?.textContent).toBe("Two");
    expect(state.__cleanupEvents).toEqual(["first", "second"]);
    expect(
      tasks.some((task) => {
        try {
          task();
          return false;
        } catch (error) {
          return error instanceof Error && error.message === "cleanup failed";
        }
      }),
    ).toBe(true);
    queueMicrotaskSpy.mockRestore();
  });

  test("unmounts compat client boundary roots before SPA navigation removes them", async () => {
    const code = `export default function Page() {
  return <main>One</main>;
}`;
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: [],
      clientReferenceManifest: [],
      filename: "/app/one/page.mreact.tsx",
      routePath: "/one",
    });

    const state = globalThis as typeof globalThis & { __compatUnmounts?: number };
    state.__compatUnmounts = 0;
    document.body.innerHTML = [
      '<div data-mreact-route-id="one"><main><section data-mreact-compat-boundary="Chart"></section></main></div>',
      '<script type="application/json" id="mreact-props-one">{}</script>',
    ].join("");
    const boundary = document.querySelector("[data-mreact-compat-boundary]") as
      | (Element & { __mreactCompatRoot?: { unmount(): void } })
      | null;
    boundary!.__mreactCompatRoot = {
      unmount() {
        state.__compatUnmounts = (state.__compatUnmounts ?? 0) + 1;
      },
    };

    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#compat-boundary-navigation-cleanup`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="two"><main>Two</main></div>',
        '<script type="application/json" id="mreact-props-two">{}</script>',
      ].join(""),
      "/two",
    );

    expect(document.querySelector("main")?.textContent).toBe("Two");
    expect(state.__compatUnmounts).toBe(1);
  });

  test("disposes route event listeners on SPA navigation", async () => {
    const code = `const state = globalThis as typeof globalThis & { __routeClicks?: number };

export default function Page() {
  return <button type="button" onClick={() => {
    state.__routeClicks = (state.__routeClicks ?? 0) + 1;
  }}>One</button>;
}`;
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: [],
      clientReferenceManifest: [],
      filename: "/app/one/page.mreact.tsx",
      routePath: "/one",
    });

    const state = globalThis as typeof globalThis & { __routeClicks?: number };
    state.__routeClicks = 0;
    document.body.innerHTML = [
      '<div data-mreact-route-id="one"><button type="button">One</button></div>',
      '<script type="application/json" id="mreact-props-one">{}</script>',
    ].join("");

    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#event-route-cleanup`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };
    const oldButton = document.querySelector("button");
    oldButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(state.__routeClicks).toBe(1);

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="two"><main>Two</main></div>',
        '<script type="application/json" id="mreact-props-two">{}</script>',
      ].join(""),
      "/two",
    );

    oldButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(state.__routeClicks).toBe(1);
  });

  test("disposes route dynamic text bindings on SPA navigation", async () => {
    const code = `import { cell } from "@reckona/mreact-reactive-core";

const state = globalThis as typeof globalThis & { __routeCount?: ReturnType<typeof cell<number>> };

export default function Page() {
  state.__routeCount ??= cell(0);
  return <span>{state.__routeCount.get()}</span>;
}`;
    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: [],
      clientReferenceManifest: [],
      filename: "/app/one/page.mreact.tsx",
      routePath: "/one",
    });

    const state = globalThis as typeof globalThis & {
      __routeCount?: { set(value: number): void };
    };
    state.__routeCount = undefined;
    document.body.innerHTML = [
      '<div data-mreact-route-id="one"><span>0</span></div>',
      '<script type="application/json" id="mreact-props-one">{}</script>',
    ].join("");

    const routeModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#text-route-cleanup`
    )) as {
      __mreactNavigateToHtml: (html: string, url: string) => void;
    };
    const oldSpan = document.querySelector("span");
    state.__routeCount?.set(1);
    await Promise.resolve();
    expect(oldSpan?.textContent).toBe("1");

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="two"><main>Two</main></div>',
        '<script type="application/json" id="mreact-props-two">{}</script>',
      ].join(""),
      "/two",
    );

    state.__routeCount?.set(2);
    await Promise.resolve();
    expect(oldSpan?.textContent).toBe("1");
  });

  test("prefetches client route scripts without fetching navigation HTML", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-script");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="about"><main>About</main></div>',
          '<script type="application/json" id="mreact-props-about">{}</script>',
        ].join(""),
      );
    };
    installRoutePrefetchManifest([
      {
        path: "/about",
        script: "/_mreact/client/assets/routes/about.12345678.js",
      },
    ]);

    await expect(routeModule.__mreactPrefetch("/about")).resolves.toBe(true);

    expect(fetchCalls).toBe(0);
    expect(
      document.head.querySelector<HTMLLinkElement>(
        'link[rel="modulepreload"][href="http://localhost:3000/_mreact/client/assets/routes/about.12345678.js"]',
      ),
    ).not.toBeNull();
  });

  test("prefetches server route navigation HTML when no client route script matches", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-server-html");
    const requests: Array<{ headers: string | null; url: string }> = [];
    globalThis.fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        headers: headers.get("x-mreact-navigation"),
        url: String(url),
      });
      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="server"><main>Server</main></div>',
          '<script type="application/json" id="mreact-props-server">{}</script>',
        ].join(""),
      );
    };

    await expect(routeModule.__mreactPrefetch("/server")).resolves.toBe(true);
    await expect(routeModule.__mreactPrefetch("/server")).resolves.toBe(true);

    expect(requests).toEqual([
      {
        headers: "1",
        url: "http://localhost:3000/server",
      },
    ]);
  });

  test("reuses in-flight server route HTML prefetch for navigation", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-server-html-in-flight");
    const requests: Array<{ headers: string | null; url: string }> = [];
    let resolveFetch: ((response: Response) => void) | undefined;
    globalThis.fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        headers: headers.get("x-mreact-navigation"),
        url: String(url),
      });

      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    };

    const prefetch = routeModule.__mreactPrefetch("/server");
    await Promise.resolve();
    const navigation = routeModule.__mreactNavigate("/server");
    await Promise.resolve();

    expect(requests).toEqual([
      {
        headers: "1",
        url: "http://localhost:3000/server",
      },
    ]);

    resolveFetch?.(
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="server"><main>Server</main></div>',
          '<script type="application/json" id="mreact-props-server">{}</script>',
        ].join(""),
      ),
    );

    await expect(prefetch).resolves.toBe(true);
    await expect(navigation).resolves.toBe(true);
    expect(document.querySelector("[data-mreact-route-id='server']")?.textContent).toBe("Server");
  });

  test("preloads matching client route scripts while navigation HTML is still loading", async () => {
    const { routeModule } = await importRouteRuntime("navigation-preloads-script-before-html");
    let resolveFetch: ((response: Response) => void) | undefined;
    globalThis.fetch = async () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    installRoutePrefetchManifest([
      {
        path: "/about",
        script: "/_mreact/client/assets/routes/about.12345678.js",
      },
    ]);

    const navigation = routeModule.__mreactNavigate("/about");
    await Promise.resolve();

    expect(
      document.head.querySelector<HTMLLinkElement>(
        'link[rel="modulepreload"][href="http://localhost:3000/_mreact/client/assets/routes/about.12345678.js"]',
      ),
    ).not.toBeNull();

    resolveFetch?.(
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="about"><main>About</main></div>',
          '<script type="application/json" id="mreact-props-about">{}</script>',
        ].join(""),
      ),
    );
    await expect(navigation).resolves.toBe(true);
  });

  test("bounds prefetched navigation HTML cache entries", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-html-cache-bound");
    globalThis.fetch = async (url) =>
      new Response(
        [
          "<!DOCTYPE html>",
          `<div data-mreact-route-id="server"><main>${String(url)}</main></div>`,
          '<script type="application/json" id="mreact-props-server">{}</script>',
        ].join(""),
      );

    for (let index = 0; index < 70; index += 1) {
      await expect(routeModule.__mreactPrefetch(`/server-${index}`)).resolves.toBe(true);
    }

    const cache = (
      globalThis as {
        __mreactNavigationState?: { cache?: Map<string, string> };
      }
    ).__mreactNavigationState?.cache;
    expect(cache?.size).toBeLessThanOrEqual(64);
    expect(cache?.has(`${location.origin}/server-0`)).toBe(false);
    expect(cache?.has(`${location.origin}/server-69`)).toBe(true);
  });

  test("refetches navigation HTML after prefetched URL history eviction", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-url-history-bound");
    const requests: string[] = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response(
        [
          "<!DOCTYPE html>",
          `<div data-mreact-route-id="server"><main>${String(url)}</main></div>`,
          '<script type="application/json" id="mreact-props-server">{}</script>',
        ].join(""),
      );
    };

    for (let index = 0; index < 70; index += 1) {
      await expect(routeModule.__mreactPrefetch(`/server-${index}`)).resolves.toBe(true);
    }
    await expect(routeModule.__mreactPrefetch("/server-0")).resolves.toBe(true);

    expect(requests.filter((url) => url === `${location.origin}/server-0`)).toHaveLength(2);
  });

  test("does not cache stale in-flight prefetch HTML after revalidation", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-in-flight-revalidate");
    const fetchCalls: string[] = [];
    let resolveStalePrefetch: ((response: Response) => void) | undefined;
    let staleRequests = 0;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      fetchCalls.push(url);

      if (url.endsWith("/stale")) {
        staleRequests += 1;

        if (staleRequests === 1) {
          return new Promise<Response>((resolve) => {
            resolveStalePrefetch = resolve;
          });
        }

        return new Response(
          [
            "<!DOCTYPE html>",
            '<div data-mreact-route-id="stale"><main>Fresh Stale</main></div>',
            '<script type="application/json" id="mreact-props-stale">{}</script>',
          ].join(""),
        );
      }

      if (url.endsWith("/refresh")) {
        return new Response(
          [
            "<!DOCTYPE html>",
            '<div data-mreact-route-id="refresh"><main>Refresh</main></div>',
            '<script type="application/json" id="mreact-props-refresh">{}</script>',
          ].join(""),
          { headers: { "x-mreact-revalidate": "/stale" } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const prefetch = routeModule.__mreactPrefetch("/stale");
    await Promise.resolve();
    await routeModule.__mreactNavigate("/refresh");
    resolveStalePrefetch?.(
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="stale"><main>Old Stale</main></div>',
          '<script type="application/json" id="mreact-props-stale">{}</script>',
        ].join(""),
      ),
    );
    await expect(prefetch).resolves.toBe(true);
    await routeModule.__mreactNavigate("/stale");

    const origin = location.origin;
    expect(fetchCalls).toEqual([`${origin}/stale`, `${origin}/refresh`, `${origin}/stale`]);
    expect(document.querySelector("[data-mreact-route-id='stale']")?.textContent).toBe(
      "Fresh Stale",
    );
  });

  test("bounds prefetched route script history entries", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-script-history-bound");
    installRoutePrefetchManifest(
      Array.from({ length: 70 }, (_, index) => ({
        path: `/client-${index}`,
        script: `/_mreact/client/assets/routes/client-${index}.12345678.js`,
      })),
    );

    for (let index = 0; index < 70; index += 1) {
      await expect(routeModule.__mreactPrefetch(`/client-${index}`)).resolves.toBe(true);
    }

    const prefetchedScripts = (
      globalThis as {
        __mreactNavigationState?: { prefetchedScripts?: Set<string> };
      }
    ).__mreactNavigationState?.prefetchedScripts;
    expect(prefetchedScripts?.size).toBeLessThanOrEqual(64);
    expect(
      prefetchedScripts?.has(
        `${location.origin}/_mreact/client/assets/routes/client-0.12345678.js`,
      ),
    ).toBe(false);
    expect(
      prefetchedScripts?.has(
        `${location.origin}/_mreact/client/assets/routes/client-69.12345678.js`,
      ),
    ).toBe(true);
  });

  test("skips cross-origin navigation HTML prefetches", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-cross-origin-html");
    const requests: string[] = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response("<!DOCTYPE html><main>External</main>");
    };

    await expect(routeModule.__mreactPrefetch("https://example.com/server")).resolves.toBe(false);

    expect(requests).toEqual([]);
  });

  test("skips prefetch and navigation for the current route", async () => {
    const { routeModule } = await importRouteRuntime("current-route-noop");
    const requests: string[] = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response("<!DOCTYPE html><main>Current</main>");
    };
    installRoutePrefetchManifest([
      {
        path: "/",
        script: "/_mreact/client/assets/routes/index.12345678.js",
      },
    ]);
    document.body.insertAdjacentHTML("beforeend", '<a href="/">Current</a>');

    await expect(routeModule.__mreactPrefetch("/")).resolves.toBe(false);
    document
      .querySelector("a")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }));
    await Promise.resolve();

    expect(requests).toEqual([]);
    expect(document.head.querySelector("link[rel='modulepreload']")).toBeNull();
  });

  test("skips intent prefetch fetches for cross-origin anchors", async () => {
    await importRouteRuntime("prefetch-cross-origin-intent-events");
    const requests: string[] = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response("<!DOCTYPE html><main>External</main>");
    };
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="https://example.com/about">External</a>',
    );
    const anchor = document.querySelector("a");

    anchor?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    anchor?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    anchor?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await Promise.resolve();

    expect(requests).toEqual([]);
  });

  test("skips viewport prefetch fetches for cross-origin anchors", async () => {
    const observed: Element[] = [];
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observer: IntersectionObserver = {
      root: null,
      rootMargin: "",
      scrollMargin: "",
      thresholds: [],
      disconnect(): void {},
      observe(target: Element): void {
        observed.push(target);
      },
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      },
      unobserve(): void {},
    };
    globalThis.IntersectionObserver = function (callback: IntersectionObserverCallback) {
      intersectionCallback = callback;
      return observer;
    } as unknown as typeof IntersectionObserver;
    await importRouteRuntime(
      "prefetch-cross-origin-viewport",
      '<a href="https://example.com/about" data-mreact-prefetch="viewport">External</a>',
    );
    const requests: string[] = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response("<!DOCTYPE html><main>External</main>");
    };

    expect(observed).toHaveLength(1);
    intersectionCallback?.(
      [{ isIntersecting: true, target: observed[0] } as IntersectionObserverEntry],
      observer,
    );
    await Promise.resolve();

    expect(requests).toEqual([]);
  });

  test("falls back from unsupported navigation responses without reading the body", async () => {
    const { routeModule } = await importRouteRuntime("unsupported-navigation-response");
    const requests: Array<{ headers: string | null; url: string }> = [];
    let textCalls = 0;
    globalThis.fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        headers: headers.get("x-mreact-navigation"),
        url: String(url),
      });

      return {
        headers: new Headers({ "x-mreact-navigation": "reload" }),
        status: 204,
        text() {
          textCalls += 1;
          return Promise.resolve("<!DOCTYPE html><html><body>full document</body></html>");
        },
      } as Response;
    };

    await expect(routeModule.__mreactNavigate("/cloudflare")).resolves.toBe(false);

    expect(requests).toEqual([
      {
        headers: "1",
        url: "http://localhost:3000/cloudflare",
      },
    ]);
    expect(textCalls).toBe(0);
    expect(document.querySelector("[data-mreact-route-id='index']")).not.toBeNull();
  });

  test("matches dynamic route patterns when prefetching client route scripts", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-dynamic-script");
    installRoutePrefetchManifest([
      {
        path: "/users/:id",
        script: "/_mreact/client/assets/routes/users__id.12345678.js",
      },
    ]);

    await expect(routeModule.__mreactPrefetch("/users/ada")).resolves.toBe(true);

    expect(
      document.head.querySelector<HTMLLinkElement>(
        'link[rel="modulepreload"][href="http://localhost:3000/_mreact/client/assets/routes/users__id.12345678.js"]',
      ),
    ).not.toBeNull();
  });

  test("skips client route script prefetch when Save-Data is enabled", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-save-data");
    installRoutePrefetchManifest([
      {
        path: "/about",
        script: "/_mreact/client/assets/routes/about.12345678.js",
      },
    ]);
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });

    await expect(routeModule.__mreactPrefetch("/about")).resolves.toBe(false);

    expect(document.head.querySelector("link[rel='modulepreload']")).toBeNull();
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: undefined,
    });
  });

  test("intent-prefetches internal anchors from pointer and focus events", async () => {
    await importRouteRuntime("prefetch-intent-events");
    installRoutePrefetchManifest([
      {
        path: "/about",
        script: "/_mreact/client/assets/routes/about.12345678.js",
      },
    ]);
    document.body.insertAdjacentHTML("beforeend", '<a href="/about">About</a>');
    document.querySelector("a")?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    expect(
      document.head.querySelector<HTMLLinkElement>(
        'link[rel="modulepreload"][href="http://localhost:3000/_mreact/client/assets/routes/about.12345678.js"]',
      ),
    ).not.toBeNull();
  });

  test("intent-prefetches internal anchors from pointerover before click", async () => {
    await importRouteRuntime("prefetch-intent-pointerover");
    installRoutePrefetchManifest([
      {
        path: "/about",
        script: "/_mreact/client/assets/routes/about.12345678.js",
      },
    ]);
    document.body.insertAdjacentHTML("beforeend", '<a href="/about">About</a>');
    document.querySelector("a")?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));

    expect(
      document.head.querySelector<HTMLLinkElement>(
        'link[rel="modulepreload"][href="http://localhost:3000/_mreact/client/assets/routes/about.12345678.js"]',
      ),
    ).not.toBeNull();
  });

  test("invalidates cached navigation entries from revalidation headers", async () => {
    const { routeModule } = await importRouteRuntime("prefetch-revalidate");
    const fetchCalls: string[] = [];
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      fetchCalls.push(url);

      if (url.endsWith("/refresh")) {
        return new Response(
          [
            "<!DOCTYPE html>",
            '<div data-mreact-route-id="refresh"><main>Refresh</main></div>',
            '<script type="application/json" id="mreact-props-refresh">{}</script>',
          ].join(""),
          { headers: { "x-mreact-revalidate": "/stale" } },
        );
      }

      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="stale"><main>Stale</main></div>',
          '<script type="application/json" id="mreact-props-stale">{}</script>',
        ].join(""),
      );
    };

    await routeModule.__mreactNavigate("/stale");
    await routeModule.__mreactNavigate("/refresh");
    await routeModule.__mreactNavigate("/stale");

    const origin = location.origin;
    expect(fetchCalls).toEqual([`${origin}/stale`, `${origin}/refresh`, `${origin}/stale`]);
  });

  test("invalidates cached navigation entries after client-side mutations", async () => {
    const fetchCalls: Array<{
      cache: string | null;
      method: string;
      navigation: string | null;
      url: string;
    }> = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      const headers = new Headers(init?.headers ?? request?.headers);
      const method = init?.method ?? request?.method ?? "GET";
      const url = String(input);
      fetchCalls.push({
        cache: headers.get("x-mreact-navigation-cache"),
        method,
        navigation: headers.get("x-mreact-navigation"),
        url,
      });

      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="index"><main>Home</main></div>',
          '<script type="application/json" id="mreact-props-index">{}</script>',
        ].join(""),
      );
    };
    const { routeModule } = await importRouteRuntime("client-mutation-revalidate");

    await routeModule.__mreactNavigate("/");
    await fetch("/api/items/123", { method: "DELETE" });
    await routeModule.__mreactNavigate("/");
    await routeModule.__mreactNavigate("/other");

    expect(fetchCalls).toEqual([
      {
        cache: null,
        method: "GET",
        navigation: "1",
        url: `${location.origin}/`,
      },
      {
        cache: null,
        method: "DELETE",
        navigation: null,
        url: "/api/items/123",
      },
      {
        cache: "reload",
        method: "GET",
        navigation: "1",
        url: `${location.origin}/`,
      },
      {
        cache: null,
        method: "GET",
        navigation: "1",
        url: `${location.origin}/other`,
      },
    ]);
  });

  test("fetches the dedicated navigation artifact for a static export", async () => {
    const fetchCalls: Array<{ navigation: string | null; url: string }> = [];
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta name="mreact-static-navigation" content="/_mreact/navigation">',
    );
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      const headers = new Headers(init?.headers ?? request?.headers);
      fetchCalls.push({
        navigation: headers.get("x-mreact-navigation"),
        url: String(input),
      });
      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="about"><main>About</main></div>',
          '<script type="application/json" id="mreact-props-about">{}</script>',
        ].join(""),
      );
    };
    const { routeModule } = await importRouteRuntime("static-navigation-artifact");

    await expect(routeModule.__mreactNavigate("/about?tab=profile")).resolves.toBe(true);

    expect(fetchCalls).toEqual([
      {
        navigation: "1",
        url: `${location.origin}/_mreact/navigation/about/index.html?tab=profile`,
      },
    ]);
    expect(document.querySelector("main")?.textContent).toBe("About");
  });

  test("applies server action single-flight HTML without a follow-up GET", async () => {
    const fetchCalls: Array<{
      bodyTitle: string | null;
      method: string;
      singleFlight: string | null;
      url: string;
    }> = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      const headers = new Headers(init?.headers ?? request?.headers);
      const method = init?.method ?? request?.method ?? "GET";
      const body = init?.body instanceof FormData ? init.body : undefined;
      const url = String(input);
      fetchCalls.push({
        bodyTitle: body?.get("title")?.toString() ?? null,
        method,
        singleFlight: headers.get("x-mreact-action-single-flight"),
        url,
      });

      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="index"><main><h1>Published</h1></main></div>',
          '<script type="application/json" id="mreact-props-index">{}</script>',
        ].join(""),
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-mreact-action-single-flight": "1",
            "x-mreact-revalidate": "/",
          },
        },
      );
    };
    await importRouteRuntime("server-action-single-flight");
    document.body.innerHTML = [
      '<div data-mreact-route-id="index">',
      '<main><h1>Draft</h1><form method="post" action="/_mreact/actions">',
      '<input type="hidden" name="__mreact_module_id" value="actions.ts" />',
      '<input type="hidden" name="__mreact_export_name" value="save" />',
      '<input type="hidden" name="__mreact_csrf" value="csrf" />',
      '<input type="hidden" name="__mreact_action_nonce" value="nonce" />',
      '<input type="hidden" name="__mreact_action_token" value="token" />',
      '<input name="title" value="Published" />',
      '<button type="submit">Save</button>',
      "</form></main></div>",
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const submit = new Event("submit", { bubbles: true, cancelable: true });
    document.querySelector("form")?.dispatchEvent(submit);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(submit.defaultPrevented).toBe(true);
    expect(document.querySelector("h1")?.textContent).toBe("Published");
    expect(fetchCalls).toEqual([
      {
        bodyTitle: "Published",
        method: "POST",
        singleFlight: "1",
        url: `${location.origin}/_mreact/actions`,
      },
    ]);
  });

  test("does not intercept server action forms when the submitter overrides the action", async () => {
    const fetchCalls: string[] = [];
    globalThis.fetch = async (input: string | URL | Request) => {
      fetchCalls.push(String(input));
      return new Response(null, { status: 204 });
    };
    await importRouteRuntime("server-action-submitter-override");
    document.body.innerHTML = [
      '<div data-mreact-route-id="index">',
      '<main><form method="post" action="/_mreact/actions">',
      '<button type="submit" formaction="/api/save">Save elsewhere</button>',
      "</form></main></div>",
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const submit = new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: document.querySelector("button"),
    });
    document.querySelector("form")?.dispatchEvent(submit);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(submit.defaultPrevented).toBe(false);
    expect(fetchCalls).toEqual([]);
  });

  test("drops prefetched navigation HTML after mutations from rerendered content", async () => {
    const fetchCalls: Array<{
      cache: string | null;
      method: string;
      navigation: string | null;
      url: string;
    }> = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      const headers = new Headers(init?.headers ?? request?.headers);
      const method = init?.method ?? request?.method ?? "GET";
      const url = String(input);
      fetchCalls.push({
        cache: headers.get("x-mreact-navigation-cache"),
        method,
        navigation: headers.get("x-mreact-navigation"),
        url,
      });

      if (method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      const stale =
        fetchCalls.filter((call) => call.method === "GET" && call.url === url).length === 1;
      return new Response(
        [
          "<!DOCTYPE html>",
          `<div data-mreact-route-id="index"><main>${stale ? "Stale dashboard" : "Fresh dashboard"}</main></div>`,
          '<script type="application/json" id="mreact-props-index">{}</script>',
        ].join(""),
      );
    };
    const { routeModule } = await importRouteRuntime("client-mutation-prefetched-rerendered-link");

    await routeModule.__mreactPrefetch("/dashboard");
    await fetch("/api/items/123", { method: "DELETE" });
    document.querySelector("[data-mreact-route-id='index']")!.innerHTML =
      '<main>Deleted</main><a href="/dashboard">Back to dashboard</a>';
    await routeModule.__mreactNavigate("/dashboard");

    expect(fetchCalls).toEqual([
      {
        cache: null,
        method: "GET",
        navigation: "1",
        url: `${location.origin}/dashboard`,
      },
      {
        cache: null,
        method: "DELETE",
        navigation: null,
        url: "/api/items/123",
      },
      {
        cache: "reload",
        method: "GET",
        navigation: "1",
        url: `${location.origin}/dashboard`,
      },
    ]);
    expect(document.querySelector("main")?.textContent).toBe("Fresh dashboard");
  });

  test("resets route cell state when SPA navigation applies fresh loader props", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-navigation-cell-props-"));
    const indexFile = join(appDir, "page.mreact.tsx");
    const indexCode = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page(props) {
  const sensors = cell(props.data.sensors);
  return <main>{sensors.get().length === 0 ? <p>No sensors</p> : <ul>{sensors.get().map((sensor) => <li>{sensor}</li>)}</ul>}</main>;
}`;
    await writeFile(indexFile, indexCode);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><ul><li>sensor-a</li></ul></main></div>',
      '<script type="application/json" id="mreact-props-index">{"data":{"sensors":["sensor-a"]}}</script>',
    ].join("");
    const indexBundle = await buildClientRouteBundle({
      code: indexCode,
      filename: indexFile,
      routePath: "/",
    });
    const indexModule = (await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(indexBundle)}#navigation-cell-props-index`
    )) as {
      __mreactHydrateRoute: () => void;
      __mreactNavigateToHtml: (html: string, url: string) => boolean;
    };

    expect(document.querySelector("main")?.textContent).toBe("sensor-a");

    indexModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="detail"><main>Detail</main></div>',
        '<script type="application/json" id="mreact-props-detail">{}</script>',
      ].join(""),
      "/detail",
    );
    document.querySelector("[data-mreact-route-id='detail']")!.innerHTML =
      '<main><p>Sensor deleted</p><a href="/">Back to dashboard</a></main>';

    indexModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="index"><main><p>No sensors</p></main></div>',
        '<script type="application/json" id="mreact-props-index">{"data":{"sensors":[]}}</script>',
      ].join(""),
      "/",
    );
    indexModule.__mreactHydrateRoute();

    expect(document.querySelector("main")?.textContent).toBe("No sensors");
  });

  test("marks navigation pending and clears it after HTML is applied", async () => {
    const { routeModule } = await importRouteRuntime("pending");
    const from = location.href;
    const to = new URL("/slow", location.href).href;
    let resolveResponse: ((response: Response) => void) | undefined;
    globalThis.fetch = () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });

    const navigation = routeModule.__mreactNavigate("/slow");

    expect(document.documentElement.getAttribute("data-mreact-navigation-pending")).toBe("true");
    expect(document.documentElement.getAttribute("data-mreact-navigation-from")).toBe(from);
    expect(document.documentElement.getAttribute("data-mreact-navigation-to")).toBe(to);
    expect(document.documentElement.getAttribute("data-mreact-navigation-type")).toBe("push");
    expect(routeModule.__mreactGetNavigationState()).toEqual({
      from,
      pending: true,
      to,
      type: "push",
    });

    resolveResponse?.(
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="slow"><main>Slow</main></div>',
          '<script type="application/json" id="mreact-props-slow">{}</script>',
        ].join(""),
      ),
    );
    await navigation;

    expect(document.documentElement.hasAttribute("data-mreact-navigation-pending")).toBe(false);
    expect(document.documentElement.hasAttribute("data-mreact-navigation-from")).toBe(false);
    expect(document.documentElement.hasAttribute("data-mreact-navigation-to")).toBe(false);
    expect(document.documentElement.hasAttribute("data-mreact-navigation-type")).toBe(false);
    expect(routeModule.__mreactGetNavigationState()).toEqual({
      from: null,
      pending: false,
      to: null,
      type: null,
    });
  });

  test("applies error recovery HTML returned during client navigation", async () => {
    const { routeModule } = await importRouteRuntime("error-recovery");
    globalThis.fetch = async () =>
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="index"><main><h1>Error</h1><p>broken</p></main></div>',
          '<script type="application/json" id="mreact-props-index">{}</script>',
        ].join(""),
        { status: 500 },
      );

    await routeModule.__mreactNavigate("/");

    expect(document.querySelector("[data-mreact-route-id='index']")?.textContent).toBe(
      "Errorbroken",
    );
    expect(document.documentElement.hasAttribute("data-mreact-navigation-pending")).toBe(false);
  });

  test("restores route HTML and scroll position on popstate", async () => {
    const { routeModule } = await importRouteRuntime("popstate");
    const scrollCalls: Array<[number, number]> = [];
    globalThis.scrollTo = ((xOrOptions?: number | ScrollToOptions, y?: number) => {
      if (typeof xOrOptions === "number" && y !== undefined) {
        scrollCalls.push([xOrOptions, y]);
      }
    }) as typeof globalThis.scrollTo;

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="about"><main>About</main></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
      ].join(""),
      "/about",
    );
    routeModule.__mreactRestoreHistoryState({
      __mreact: true,
      html: [
        '<div data-mreact-route-id="index"><main>Home</main></div>',
        '<script type="application/json" id="mreact-props-index">{}</script>',
      ].join(""),
      scrollX: 3,
      scrollY: 42,
      url: "/",
    });

    expect(document.querySelector("[data-mreact-route-id='index']")?.textContent).toBe("Home");
    expect(scrollCalls.at(-1)).toEqual([3, 42]);
  });

  test("enables manual browser scroll restoration while SPA navigation is installed", async () => {
    await importRouteRuntime("manual-scroll-restoration");

    expect(history.scrollRestoration).toBe("manual");
  });

  test("does not intercept same-page hash navigation", async () => {
    await importRouteRuntime("hash-only-navigation");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("");
    };
    document.body.insertAdjacentHTML("beforeend", '<a href="#details">Details</a>');
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    document.querySelector("a")?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(fetchCalls).toBe(0);
  });

  test("does not intercept cross-origin link clicks", async () => {
    await importRouteRuntime("cross-origin-link-click");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("");
    };
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="https://example.com/about">External</a>',
    );
    let defaultPreventedByRuntime: boolean | undefined;
    document.addEventListener(
      "click",
      (clickEvent) => {
        defaultPreventedByRuntime = clickEvent.defaultPrevented;
        clickEvent.preventDefault();
      },
      { once: true },
    );
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    document.querySelector("a")?.dispatchEvent(event);

    expect(defaultPreventedByRuntime).toBe(false);
    expect(fetchCalls).toBe(0);
  });

  test("saves the current history entry before restoring a popstate entry", async () => {
    const { routeModule } = await importRouteRuntime("popstate-save-current");
    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="about"><main>About</main></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
      ].join(""),
      "/about",
    );
    Object.defineProperty(globalThis, "scrollX", {
      configurable: true,
      value: 7,
    });
    Object.defineProperty(globalThis, "scrollY", {
      configurable: true,
      value: 200,
    });
    const originalReplaceState = history.replaceState.bind(history);
    const replacedStates: unknown[] = [];
    history.replaceState = (state, title, url) => {
      replacedStates.push(state);
      return originalReplaceState(state, title, url);
    };

    dispatchEvent(
      new PopStateEvent("popstate", {
        state: {
          __mreact: true,
          html: [
            '<div data-mreact-route-id="index"><main>Home</main></div>',
            '<script type="application/json" id="mreact-props-index">{}</script>',
          ].join(""),
          scrollX: 0,
          scrollY: 25,
          url: "/",
        },
      }),
    );

    expect(replacedStates[0]).toMatchObject({
      __mreact: true,
      scrollX: 7,
      scrollY: 200,
      url: expect.stringContaining("/about"),
    });
    expect((replacedStates[0] as { html?: string }).html).toContain("About");
    expect((replacedStates[0] as { html?: string }).html).toContain("mreact-props-about");
  });

  test("saves the current route HTML before pushing a navigation entry", async () => {
    const { routeModule } = await importRouteRuntime("pushstate-current-html");
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><h1>Home</h1><button type="button">count: 1</button></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
    const originalReplaceState = history.replaceState.bind(history);
    const replacedStates: unknown[] = [];
    history.replaceState = (state, title, url) => {
      replacedStates.push(state);
      return originalReplaceState(state, title, url);
    };

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="about"><main>About</main></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
      ].join(""),
      "/about",
    );

    expect(replacedStates[0]).toMatchObject({
      __mreact: true,
      url: expect.stringContaining("/"),
    });
    expect((replacedStates[0] as { html?: string }).html).toContain("count: 1");
    expect((replacedStates[0] as { html?: string }).html).toContain("mreact-props-index");
  });

  test("does not intercept reload links", async () => {
    await importRouteRuntime("reload-link");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("");
    };
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="/about" data-mreact-reload="true">About</a>',
    );
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    document.querySelector("a")?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(fetchCalls).toBe(0);
  });

  test("preserves scroll for links that opt out of top scrolling", async () => {
    await importRouteRuntime("preserve-scroll-link");
    const scrollCalls: Array<[number, number]> = [];
    globalThis.scrollTo = ((xOrOptions?: number | ScrollToOptions, y?: number) => {
      if (typeof xOrOptions === "number" && y !== undefined) {
        scrollCalls.push([xOrOptions, y]);
      }
    }) as typeof globalThis.scrollTo;
    globalThis.fetch = async () =>
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="about"><main>About</main></div>',
          '<script type="application/json" id="mreact-props-about">{}</script>',
        ].join(""),
      );
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="/about" data-mreact-scroll="preserve">About</a>',
    );

    document.querySelector("a")?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector("[data-mreact-route-id='about']")).not.toBeNull();
    expect(scrollCalls).toEqual([]);
  });

  test("wraps opt-in link navigation in a view transition when available", async () => {
    await importRouteRuntime("view-transition-link");
    const transitions: number[] = [];
    document.startViewTransition = (callback: () => void) => {
      transitions.push(1);
      callback();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      } as ViewTransition;
    };
    globalThis.fetch = async () =>
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="about"><main>About</main></div>',
          '<script type="application/json" id="mreact-props-about">{}</script>',
        ].join(""),
      );
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="/about" data-mreact-transition="auto">About</a>',
    );

    document.querySelector("a")?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transitions).toEqual([1]);
    expect(document.querySelector("[data-mreact-route-id='about']")).not.toBeNull();
  });

  test("skips automatic view transitions when reduced motion is requested", async () => {
    await importRouteRuntime("view-transition-reduced-motion");
    const transitions: number[] = [];
    document.startViewTransition = (callback: () => void) => {
      transitions.push(1);
      callback();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      } as ViewTransition;
    };
    globalThis.matchMedia = (query: string) =>
      ({
        addEventListener() {},
        addListener() {},
        dispatchEvent: () => true,
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        removeEventListener() {},
        removeListener() {},
      }) as MediaQueryList;
    globalThis.fetch = async () =>
      new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="about"><main>About</main></div>',
          '<script type="application/json" id="mreact-props-about">{}</script>',
        ].join(""),
      );
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="/about" data-mreact-transition="auto">About</a>',
    );

    document.querySelector("a")?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transitions).toEqual([]);
    expect(document.querySelector("[data-mreact-route-id='about']")).not.toBeNull();
  });

  test("resets focus, syncs html lang, and announces successful SPA navigation", async () => {
    const { routeModule } = await importRouteRuntime("navigation-accessibility");
    document.documentElement.lang = "en";
    document.head.innerHTML = "<title>Home</title>";
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>Home</main><a href="/about">About</a></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
    document.querySelector<HTMLAnchorElement>("a")?.focus();

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<html lang="ja">',
        "<head><title>About</title></head>",
        "<body>",
        '<div data-mreact-route-id="about"><main><h1>About</h1></main></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
        "</body>",
        "</html>",
      ].join(""),
      "/about",
    );

    const main = document.querySelector("main");
    expect(document.documentElement.lang).toBe("ja");
    expect(document.activeElement).toBe(main);
    expect(main?.getAttribute("tabindex")).toBe("-1");
    expect(document.getElementById("mreact-route-announcement")?.textContent).toBe("Loaded About");
  });

  test("preserves layout boundaries and remounts template boundaries on navigation", async () => {
    const { routeModule } = await importRouteRuntime("shell-boundaries");
    document.body.innerHTML = [
      '<div data-mreact-route-id="index">',
      '<section data-mreact-layout-boundary="root">',
      '<article data-mreact-template-boundary="root"><main>Home</main></article>',
      "</section>",
      "</div>",
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
    const layout = document.querySelector("[data-mreact-layout-boundary='root']");
    const template = document.querySelector("[data-mreact-template-boundary='root']");

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="about">',
        '<section data-mreact-layout-boundary="root">',
        '<article data-mreact-template-boundary="root"><main>About</main></article>',
        "</section>",
        "</div>",
        '<script type="application/json" id="mreact-props-about">{}</script>',
      ].join(""),
      "/about",
    );

    expect(document.querySelector("[data-mreact-layout-boundary='root']")).toBe(layout);
    expect(document.querySelector("[data-mreact-template-boundary='root']")).not.toBe(template);
    expect(document.querySelector("[data-mreact-route-id='about']")?.textContent).toBe("About");
  });

  test("removes stale nested layout boundaries when navigating to a sibling layout", async () => {
    const { routeModule } = await importRouteRuntime("stale-nested-layout");
    document.body.innerHTML = [
      '<section data-mreact-layout-boundary="root">',
      "<header>Root</header>",
      '<section data-mreact-layout-boundary="register">',
      "<h1>Registration Wizard</h1>",
      '<ol aria-label="Progress"><li>Step 1</li></ol>',
      '<div data-mreact-route-id="register_step_1"><main><button type="button">Cancel</button></main></div>',
      "</section>",
      "</section>",
      '<script type="application/json" id="mreact-props-register_step_1">{}</script>',
    ].join("");

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<section data-mreact-layout-boundary="root">',
        "<header>Root</header>",
        '<div data-mreact-route-id="applications"><main><h1>Applications (3)</h1></main></div>',
        "</section>",
        '<script type="application/json" id="mreact-props-applications">{}</script>',
      ].join(""),
      "/applications",
    );

    expect(document.querySelector("[data-mreact-route-id='applications']")).not.toBeNull();
    expect(document.querySelector("[data-mreact-layout-boundary='register']")).toBeNull();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe("Applications (3)");
    expect(document.body.textContent).not.toContain("Registration Wizard");
  });

  test("syncs managed head metadata while preserving unmanaged head nodes", async () => {
    const { routeModule } = await importRouteRuntime("head-metadata-sync");
    document.head.innerHTML = [
      "<title>Home</title>",
      '<meta name="description" content="Home description">',
      '<meta name="unmanaged" content="keep">',
    ].join("");

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<title>About</title>",
        '<meta name="description" content="About description">',
        '<meta property="og:title" content="About OG">',
        "</head>",
        "<body>",
        '<div data-mreact-route-id="about"><main>About</main></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
        "</body>",
        "</html>",
      ].join(""),
      "/about",
    );

    expect(document.title).toBe("About");
    expect(document.querySelectorAll("head title")).toHaveLength(1);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "About description",
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      "About OG",
    );
    expect(document.querySelector('meta[name="unmanaged"]')?.getAttribute("content")).toBe("keep");
  });

  test("syncs html lang while preserving managed head metadata", async () => {
    const { routeModule } = await importRouteRuntime("head-metadata-lang-sync");
    document.documentElement.lang = "en";
    document.head.innerHTML = "<title>Home</title>";

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<html lang="ja">',
        "<head><title>About</title></head>",
        "<body>",
        '<div data-mreact-route-id="about"><main>About</main></div>',
        '<script type="application/json" id="mreact-props-about">{}</script>',
        "</body>",
        "</html>",
      ].join(""),
      "/about",
    );

    expect(document.documentElement.lang).toBe("ja");
    expect(document.title).toBe("About");
  });

  test("preserves unrelated route data scripts during navigation sync", async () => {
    const { routeModule } = await importRouteRuntime("route-data-script-sync");
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>Home</main></div>',
      '<script type="application/json" id="mreact-props-index">{"page":"home"}</script>',
      '<script type="application/json" id="mreact-client-references-index">[]</script>',
      '<script type="application/json" id="mreact-props-layout">{"layout":"root"}</script>',
      '<script type="application/json" id="mreact-client-references-layout">[]</script>',
    ].join("");

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="about"><main>About</main></div>',
        '<script type="application/json" id="mreact-props-about">{"page":"about"}</script>',
        '<script type="application/json" id="mreact-client-references-about">[]</script>',
      ].join(""),
      "/about",
    );

    expect(document.getElementById("mreact-props-index")).toBeNull();
    expect(document.getElementById("mreact-client-references-index")).toBeNull();
    expect(document.getElementById("mreact-props-about")?.textContent).toBe('{"page":"about"}');
    expect(document.getElementById("mreact-client-references-about")).not.toBeNull();
    expect(document.getElementById("mreact-props-layout")?.textContent).toBe('{"layout":"root"}');
    expect(document.getElementById("mreact-client-references-layout")).not.toBeNull();
  });

  test("replaces and clears auth claims hand-off scripts during navigation", async () => {
    const { routeModule } = await importRouteRuntime("auth-claims-navigation-sync");
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>Home</main></div>',
      '<script type="application/json" id="__mreact_auth_session">{"roles":["admin"]}</script>',
    ].join("");

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="account"><main>Account</main></div>',
        '<script type="application/json" id="__mreact_auth_session">{"roles":["member"]}</script>',
        '<script type="application/json" id="mreact-props-account">{}</script>',
      ].join(""),
      "/account",
    );

    expect(document.getElementById("__mreact_auth_session")?.textContent).toBe(
      '{"roles":["member"]}',
    );

    routeModule.__mreactNavigateToHtml(
      [
        "<!DOCTYPE html>",
        '<div data-mreact-route-id="public"><main>Public</main></div>',
        '<script type="application/json" id="mreact-props-public">{}</script>',
      ].join(""),
      "/public",
    );

    expect(document.getElementById("__mreact_auth_session")).toBeNull();
  });

  test("deferred navigation runtime intercepts immediate same-origin link clicks", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-deferred-nav-click-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(0);
  return <main><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`;
    await writeFile(file, code);
    const runtimeCalls: Array<{ options: unknown; url: string }> = [];
    (
      globalThis as { __mreactDeferredNavigationCalls?: typeof runtimeCalls }
    ).__mreactDeferredNavigationCalls = runtimeCalls;
    const runtimeUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(`
export async function __mreactNavigate(url, options) {
  globalThis.__mreactDeferredNavigationCalls.push({ url, options });
  return true;
}
`)}`;
    document.body.innerHTML = [
      '<script type="application/json" id="mreact-navigation-runtime">',
      JSON.stringify({ script: runtimeUrl }),
      "</script>",
      '<a href="/target" data-mreact-prefetch="viewport">Details</a>',
    ].join("");
    const output = await buildClientRouteOutput({
      code,
      filename: file,
      minify: true,
      routePath: "/",
    });

    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(output.code)}`);
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    document.querySelector("a")?.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushRouterMicrotasks();

    expect(event.defaultPrevented).toBe(true);
    expect(runtimeCalls).toEqual([
      {
        options: { scroll: true, transition: false },
        url: "http://localhost:3000/target",
      },
    ]);
  });

  test("runs a Link user handler and the actual router navigation runtime", async () => {
    await importRouteRuntime("link-user-handler-navigation");
    const requests: Array<{ navigation: string | null; url: string }> = [];
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        navigation: headers.get("x-mreact-navigation"),
        url: String(input),
      });
      return new Response(
        [
          "<!DOCTYPE html>",
          '<div data-mreact-route-id="target"><main>Target</main></div>',
          '<script type="application/json" id="mreact-props-target">{}</script>',
        ].join(""),
      );
    };
    let userClicks = 0;
    const anchor = Link({
      children: "Target",
      href: "/target",
      onClick: () => {
        userClicks += 1;
      },
      prefetch: "viewport",
      scroll: "preserve",
      transition: "auto",
    }) as unknown as HTMLAnchorElement;
    document.body.append(anchor);
    expect(anchor.getAttribute("data-mreact-prefetch")).toBe("viewport");
    expect(anchor.getAttribute("data-mreact-scroll")).toBe("preserve");
    expect(anchor.getAttribute("data-mreact-transition")).toBe("auto");

    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    anchor.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushRouterMicrotasks();

    expect(userClicks).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    expect(requests).toEqual([{ navigation: "1", url: "http://localhost:3000/target" }]);
    expect(document.querySelector("[data-mreact-route-id='target']")?.textContent).toBe("Target");
  });
});

async function readDirectoryText(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return readDirectoryText(path);
      }

      return readFile(path, "utf8");
    }),
  );

  return chunks.join("\n");
}

function setDocumentBodyFromHtml(html: string): void {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  document.body.innerHTML = body.replaceAll(
    /<script\b[^>]*type=["']module["'][^>]*><\/script>/gi,
    "",
  );
}

function installRoutePrefetchManifest(routes: Array<{ path: string; script: string }>): void {
  document.head.insertAdjacentHTML(
    "beforeend",
    `<script type="application/json" id="mreact-route-prefetch-manifest">${JSON.stringify(routes)}</script>`,
  );
}

async function flushRouterMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

async function importRouteRuntime(
  suffix: string,
  bodyHtml?: string,
): Promise<{
  routeModule: {
    __mreactNavigate: (url: string) => Promise<boolean>;
    __mreactNavigateToHtml: (html: string, url: string) => boolean;
    __mreactPrefetch: (url: string) => Promise<boolean>;
    __mreactGetNavigationState: () => {
      from: string | null;
      pending: boolean;
      to: string | null;
      type: "push" | "replace" | "pop" | "refresh" | null;
    };
    __mreactRestoreHistoryState: (state: unknown) => boolean;
  };
}> {
  const appDir = await mkdtemp(join(tmpdir(), `mreact-app-${suffix}-runtime-`));
  const file = join(appDir, "page.mreact.tsx");
  const code = `export default function Page() {
  return <main>Home</main>;
}`;
  await writeFile(file, code);
  document.body.innerHTML =
    bodyHtml ??
    [
      '<div data-mreact-route-id="index"><main>Home</main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");
  const bundle = await buildClientRouteBundle({
    code,
    filename: file,
    routePath: "/",
  });

  return {
    routeModule: await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#${suffix}`
    ),
  };
}
