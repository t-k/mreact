import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
// @vitest-environment happy-dom

import { buildApp } from "../src/build.js";
import {
  buildClientRouteBundle,
  buildClientRouteEntrySource,
  buildClientRouteOutput,
  collectClientRouteReferences,
} from "../src/client.js";
import { renderAppRequest } from "../src/render.js";
import { stripRouteClientOnlyExports } from "../src/route-source.js";
import { renderAppRouterClientAsset } from "../src/vite.js";

describe("mreact app client build and hydration markers", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("lang");
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    delete (globalThis as { __mreactNavigationState?: unknown }).__mreactNavigationState;
    delete (globalThis as { __accountMenuHydrated?: unknown }).__accountMenuHydrated;
    delete (globalThis as { __devUploadRequests?: unknown }).__devUploadRequests;
    delete (globalThis as { __profileLocaleSyncHydrated?: unknown }).__profileLocaleSyncHydrated;
    delete (globalThis as { __uploadRequests?: unknown }).__uploadRequests;
    delete (globalThis as { __uploadHiddenRequests?: unknown }).__uploadHiddenRequests;
    delete (globalThis as { matchMedia?: unknown }).matchMedia;
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
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#app-shell-null-boundary`);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect((globalThis as { __uploadRequests?: number }).__uploadRequests).toBe(1);
    expect(document.querySelector("nav a[href='/upload']")?.textContent).toBe("Upload");
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
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#app-shell-hidden-boundary`);

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

    const uploadItem = document
      .querySelector("nav a[href='/upload']")
      ?.closest("li");
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
      join(componentsDir, "SwUpdateBanner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const hasUpdate = cell(false);

export function SwUpdateBanner() {
  if (!hasUpdate.get()) return null;
  return <div role="status">Update</div>;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import type { JSX } from "@reckona/mreact/jsx-runtime";
import { AccountMenu } from "./AccountMenu";
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

    expect(html).toContain('src="/_mreact/client/routes/settings.js"');
    setDocumentBodyFromHtml(html);
    expect(routeAsset.status).toBe(200);
    expect(document.querySelector("header button")).toBeNull();
    expect(document.querySelector("nav a[href='/upload']")).toBeNull();

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
    expect(document.querySelector("header button")?.getAttribute("aria-label")).toBe(
      "Account menu",
    );
    expect(document.querySelectorAll("nav a[href='/upload']")).toHaveLength(2);
    expect(
      Array.from(document.querySelectorAll("nav a[href='/upload']")).every(
        (link) => !link.closest("li")?.classList.contains("hidden"),
      ),
    ).toBe(true);
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

  test("passes object row properties to route-local components inside client route maps", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-local-component-map-props-"));
    const file = join(appDir, "page.mreact.tsx");
    const code = `"use client";

import { cell } from "@reckona/mreact-reactive-core";

interface MediaMonthGroup {
  readonly yearMonth: string;
  readonly ids: readonly string[];
}

const groupsCell = cell<readonly MediaMonthGroup[]>([]);
let loaded = false;

function loadGroups() {
  if (loaded) return;
  loaded = true;
  Promise.resolve().then(() => groupsCell.set([
    { yearMonth: "2025-06", ids: ["media-1"] },
    { yearMonth: "2025-03", ids: ["media-2"] },
  ]));
}

function formatYearMonth(key: string): string {
  const [year, monthValue] = key.split("-");
  return year + "年" + Number(monthValue) + "月";
}

function MonthHeader(props: { readonly yearMonth: string }) {
  return (
    <div class="month-header">
      <button type="button">
        {formatYearMonth(props.yearMonth)}
        <span>▼</span>
      </button>
    </div>
  );
}

export default function CalendarPage() {
  loadGroups();
  const mediaMonthGroups = groupsCell.get().filter((group) => group.ids.length > 0);

  return (
    <main>
      {mediaMonthGroups.map((group) => (
        <div class="contents" key={group.yearMonth}>
          <MonthHeader yearMonth={group.yearMonth} />
          {group.ids.map((mediaId) => (
            <div key={mediaId}>{mediaId}</div>
          ))}
        </div>
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

    expect(references.client).toBe(true);
    expect(references.clientReferenceManifest).toEqual([]);

    document.body.innerHTML = [
      '<div data-mreact-route-id="calendar"><main></main></div>',
      '<script type="application/json" id="mreact-props-calendar">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientReferenceImports: references.clientReferenceImports,
      clientReferenceManifest: references.clientReferenceManifest,
      filename: file,
      routePath: "/calendar",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#local-component-map-props`
    );
    await Promise.resolve();
    await Promise.resolve();

    expect([...document.querySelectorAll(".month-header button")].map((node) => node.textContent))
      .toEqual(["2025年6月▼", "2025年3月▼"]);
    expect([...document.querySelectorAll(".contents > div:last-child")].map((node) => node.textContent))
      .toEqual(["media-1", "media-2"]);
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
    globalThis.scrollTo = (x: number, y: number) => {
      scrollCalls.push([x, y]);
    };

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
    globalThis.scrollTo = (x: number, y: number) => {
      scrollCalls.push([x, y]);
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
});

function setDocumentBodyFromHtml(html: string): void {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  document.body.innerHTML = body.replaceAll(/<script\b[^>]*type=["']module["'][^>]*><\/script>/gi, "");
}

function installRoutePrefetchManifest(routes: Array<{ path: string; script: string }>): void {
  document.head.insertAdjacentHTML(
    "beforeend",
    `<script type="application/json" id="mreact-route-prefetch-manifest">${JSON.stringify(routes)}</script>`,
  );
}

async function importRouteRuntime(suffix: string): Promise<{
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
  document.body.innerHTML = [
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
