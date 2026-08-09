import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderBuiltAppRequest } from "../src/serve.js";

describe("layout shell rendering", () => {
  let rootDir: string;
  let appDir: string;
  let outDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "mreact-shell-cache-"));
    appDir = join(rootDir, "app");
    outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { force: true, recursive: true });
  });

  test("zero-argument layout produces complete HTML across requests", async () => {
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
    );
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>page</main>; }",
    );
    await buildApp({ appDir, outDir });

    const first = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const second = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    const firstHtml = await first.text();
    const secondHtml = await second.text();
    expect(firstHtml).toBe(secondHtml);
    expect(firstHtml).toContain("<main>page</main>");
    expect(firstHtml).toContain('data-mreact-layout-boundary="root"');
  });

  test("layout reflects props on every request", async () => {
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout(props) {
  return <html data-impure-layout-id={props.params.id ?? "root"}><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      "export default function Page(props) { return <main>user {props.params.id}</main>; }",
    );
    await buildApp({ appDir, outDir });

    const ada = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/users/ada"),
    });
    const grace = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/users/grace"),
    });

    const adaHtml = await ada.text();
    const graceHtml = await grace.text();
    expect(adaHtml).toContain('data-impure-layout-id="ada"');
    expect(graceHtml).toContain('data-impure-layout-id="grace"');
    expect(adaHtml).not.toBe(graceHtml);
  });

  test("a rebuild uses the updated layout output", async () => {
    await writeFile(
      join(appDir, "layout.tsx"),
      'export default function Layout() { return <html data-v="1"><body><Slot /></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>x</main>; }",
    );
    await buildApp({ appDir, outDir });
    const beforeBump = await (
      await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/"),
      })
    ).text();
    expect(beforeBump).toContain('data-v="1"');

    await writeFile(
      join(appDir, "layout.tsx"),
      'export default function Layout() { return <html data-v="2"><body><Slot /></body></html>; }',
    );
    await buildApp({ appDir, outDir });
    const afterBump = await (
      await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/"),
      })
    ).text();
    expect(afterBump).toContain('data-v="2"');
    expect(afterBump).not.toContain('data-v="1"');
  });
});
