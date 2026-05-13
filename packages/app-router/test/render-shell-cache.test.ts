// Issue 086: pre-encoded layout shell cache.
//
// A layout component that takes zero arguments cannot depend on the
// request-specific props (params / request / data), so its rendered
// {prefix, suffix} is constant for a given (appDir, shellFile,
// serverModuleCacheVersion) tuple. These tests pin the cache
// behaviour:
//   - Pure layouts produce byte-identical output across requests
//     (the cache returns the same instance).
//   - Impure layouts (function.length > 0) re-render per request so
//     props-driven changes are honoured.
//   - The cache is keyed by serverModuleCacheVersion; a build that
//     bumps the version invalidates the cached shell.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderBuiltAppRequest } from "../src/serve.js";

describe("layout shell prefix cache (issue 086)", () => {
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

  test("pure layout produces byte-identical HTML across two requests", async () => {
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><slot /></body></html>; }",
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

  test("impure layout reflects props on every request", async () => {
    // Layout consumes its props argument (a non-zero arity function),
    // so the cache must NOT short-circuit. Each request must compute
    // a fresh prefix/suffix from the live props. We exercise this
    // through the page's params, which the layout reads.
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      // Reads props.params.id — would break if cached across requests.
      `export default function Layout(props) {
  return <html data-impure-layout-id={props.params.id ?? "root"}><body><slot /></body></html>;
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

  test("a rebuild that bumps serverModuleCacheVersion invalidates the cached prefix", async () => {
    // First build with one body content.
    await writeFile(
      join(appDir, "layout.tsx"),
      'export default function Layout() { return <html data-v="1"><body><slot /></body></html>; }',
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

    // Second build with different body. This changes the manifest
    // hash, which is the serverModuleCacheVersion, so the cache key
    // changes and the rebuild's output reaches the consumer.
    await writeFile(
      join(appDir, "layout.tsx"),
      'export default function Layout() { return <html data-v="2"><body><slot /></body></html>; }',
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
