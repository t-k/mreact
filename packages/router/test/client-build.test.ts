import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @vitest-environment happy-dom

import { buildApp } from "../src/build.js";
import { buildClientRouteBundle, buildClientRouteOutput } from "../src/client.js";
import { renderAppRequest } from "../src/render.js";

describe("mreact app client build and hydration markers", () => {
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
    expect(withNav.code.length - withoutNav.code.length).toBeGreaterThanOrEqual(
      600,
    );
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
    ) as { routes: Array<{ client: boolean; devScript?: string; script?: string; sourceMap?: string }> };
    const script = manifest.routes[0]?.script;
    const sourceMap = manifest.routes[0]?.sourceMap;

    expect(manifest.routes[0]?.client).toBe(true);
    expect(manifest.routes[0]?.devScript).toBe("routes/index.js");
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(sourceMap).toBe(`${script}.map`);
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

    const bundle = await buildClientRouteBundle({
      code,
      filename: file,
      routePath: "/",
    });
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}`);

    const resumedMain = document.querySelector("main");
    const resumedHeading = document.querySelector("h1");
    const resumedButton = document.querySelector("button");

    expect(resumedMain).toBe(serverMain);
    expect(resumedHeading).toBe(serverHeading);
    expect(resumedButton).toBe(serverButton);

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
    const routeModule = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#hot-state`
    ) as {
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
    const secondModule = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(secondBundle)}#hot-fresh-b`
    ) as { __mreactHydrateRoute: () => void };
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
    const secondModule = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(secondBundle)}#hot-signature-b`
    ) as { __mreactHydrateRoute: () => void };
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
    const routeModule = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#navigation`
    ) as {
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

  test("prefetches navigation HTML and uses it for a later navigation", async () => {
    const { routeModule } = await importRouteRuntime("prefetch");
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

    await routeModule.__mreactPrefetch("/about");
    await routeModule.__mreactNavigate("/about");

    expect(fetchCalls).toBe(1);
    expect(document.querySelector("[data-mreact-route-id='about']")?.textContent).toBe(
      "About",
    );
  });

  test("invalidates prefetched navigation entries from revalidation headers", async () => {
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

    await routeModule.__mreactPrefetch("/stale");
    await routeModule.__mreactNavigate("/refresh");
    await routeModule.__mreactPrefetch("/stale");

    const origin = location.origin;
    expect(fetchCalls).toEqual([
      `${origin}/stale`,
      `${origin}/refresh`,
      `${origin}/stale`,
    ]);
  });

  test("marks navigation pending and clears it after HTML is applied", async () => {
    const { routeModule } = await importRouteRuntime("pending");
    let resolveResponse: ((response: Response) => void) | undefined;
    globalThis.fetch = () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });

    const navigation = routeModule.__mreactNavigate("/slow");

    expect(document.documentElement.getAttribute("data-mreact-navigation-pending")).toBe(
      "true",
    );

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

    expect(document.documentElement.hasAttribute("data-mreact-navigation-pending")).toBe(
      false,
    );
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
    expect(document.documentElement.hasAttribute("data-mreact-navigation-pending")).toBe(
      false,
    );
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

    expect(document.querySelector("[data-mreact-route-id='index']")?.textContent).toBe(
      "Home",
    );
    expect(scrollCalls.at(-1)).toEqual([3, 42]);
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
    expect(document.querySelector("[data-mreact-template-boundary='root']")).not.toBe(
      template,
    );
    expect(document.querySelector("[data-mreact-route-id='about']")?.textContent).toBe(
      "About",
    );
  });
});

async function importRouteRuntime(suffix: string): Promise<{
  routeModule: {
    __mreactNavigate: (url: string) => Promise<boolean>;
    __mreactNavigateToHtml: (html: string, url: string) => boolean;
    __mreactPrefetch: (url: string) => Promise<boolean>;
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
