import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderAppRequest } from "../src/render.js";

describe("mreact app request rendering", () => {
  test("renders a .mreact.tsx page route to HTML", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-render-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main><h1>Hello app router</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain(
      "<main><h1>Hello app router</h1></main>",
    );
  });

  test("passes dynamic route params to page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-params-"));
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      "export default function Page(props) { return <main><h1>User {props.params.id}</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/users/ada"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>User ada</h1></main>");
  });

  test("passes loader data to page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function loader() {
  return { title: "Loaded" };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>Loaded</h1></main>");
  });

  test("executes imported async loader modules before rendering", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-import-"));
    await writeFile(
      join(appDir, "data.ts"),
      `export function titleFor(id: string) {
  return { nested: { title: \`User \${id}\` } };
}`,
    );
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      `import { titleFor } from "../../data";

export async function loader({ params }) {
  const data = titleFor(params.id);
  return { title: data.nested.title };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/users/ada"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>User ada</h1></main>");
  });

  test("wraps pages with root and nested layouts", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header>Root</header><slot /></body></html>; }',
    );
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "layout.mreact.tsx"),
      'export default function DocsLayout() { return <section><h1>Docs</h1><slot /></section>; }',
    );
    await writeFile(
      join(appDir, "docs", "page.mreact.tsx"),
      "export default function Page() { return <article>Nested page</article>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      "<!DOCTYPE html><html><body><header>Root</header><section><h1>Docs</h1><article>Nested page</article></section></body></html>",
    );
  });

  test("dispatches route.ts handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-"));
    await mkdir(join(appDir, "api", "time"), { recursive: true });
    await writeFile(
      join(appDir, "api", "time", "route.ts"),
      "export function GET() { return Response.json({ ok: true }); }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/time"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("renders stream routes with the server stream compiler target", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain(
      '<main><template data-mreact-oob-placeholder="mreact-0"><em>loading</em></template></main>',
    );
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("wraps stream routes with layouts and hydration markers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header>Root</header><slot /></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@modular-react/reactive-core";
export const stream = true;

export default function Page() {
  const count = cell(0);
  const name = Promise.resolve("Ada");
  return <main><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button><await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain(
      '<!DOCTYPE html><div data-mreact-route-id="index"><html><body><header>Root</header><main>',
    );
    expect(html).toContain('id="mreact-props-index"');
    expect(html).toContain('src="/_mreact/client/routes/index.js"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("</main></body></html></div>");
  });
});
