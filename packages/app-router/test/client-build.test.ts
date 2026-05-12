import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @vitest-environment happy-dom

import { buildApp } from "../src/build.js";
import { buildClientRouteBundle } from "../src/client.js";
import { renderAppRequest } from "../src/render.js";

describe("mreact app client build and hydration markers", () => {
  test("builds bundled client route modules for interactive pages", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@modular-react/reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = manifest.routes[0]?.script;

    expect(manifest.routes[0]?.client).toBe(true);
    expect(script).toBe("routes/index.js");
    expect(await readFile(join(outDir, "client", script ?? ""), "utf8")).toContain(
      "replaceChildren",
    );
  });

  test("renders hydration markers and client script for interactive pages", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-hydrate-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@modular-react/reactive-core";

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
    const code = `import { cell } from "@modular-react/reactive-core";

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
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}`);

    const marker = document.querySelector("[data-mreact-route-id='index']");
    const button = document.querySelector("button");
    expect(marker?.getAttribute("data-mreact-hydrated")).toBe("true");
    expect(button?.textContent).toBe("count: 0");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.textContent).toBe("count: 1");
  });
});
