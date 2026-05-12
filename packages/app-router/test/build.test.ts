import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderBuiltAppRequest } from "../src/serve.js";

describe("mreact app build", () => {
  test("writes server and client manifests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Hello</main>; }",
    );

    const result = await buildApp({ appDir, outDir });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { files?: Record<string, string>; routes: Array<{ file: string; path: string }> };
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean }> };
    const viteManifest = JSON.parse(
      await readFile(join(outDir, "client", ".vite", "manifest.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(result.routes).toHaveLength(1);
    expect(serverManifest.routes[0]?.path).toBe("/");
    expect(serverManifest.routes[0]?.file).toBe("page.mreact.tsx");
    expect(serverManifest.files?.["page.mreact.tsx"]).toContain("<main>Hello</main>");
    expect(clientManifest.routes[0]?.client).toBe(false);
    expect(viteManifest).toEqual({});

    await expect(access(join(outDir, "server", "app", "page.mreact.tsx"))).rejects.toThrow();
  });

  test("renders built server output without the source app directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-render-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "data.ts"),
      `export function title() {
  return "Built loader";
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { title } from "./data";

export function loader() {
  return { title: title() };
}

export default function Page(props) {
  return <main>{props.data.title}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    await rm(appDir, { force: true, recursive: true });
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Built loader</main>");
  });

  test("writes hashed client route assets and injects production preload tags", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-client-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@modular-react/reactive-core";

export default function Page() {
  const count = cell(0);
  return <button onClick={() => count.set((value) => value + 1)}>Count {count}</button>;
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ bytes?: number; script?: string; sourceMap?: string }> };
    const viteManifest = JSON.parse(
      await readFile(join(outDir, "client", ".vite", "manifest.json"), "utf8"),
    ) as Record<string, { file?: string; src?: string }>;
    const script = clientManifest.routes[0]?.script;
    const sourceMap = clientManifest.routes[0]?.sourceMap;

    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(viteManifest["routes/index.js"]?.file).toBe(script);
    expect(viteManifest["routes/index.js"]?.src).toBe("routes/index.js");
    expect(sourceMap).toBe(`${script}.map`);
    expect(clientManifest.routes[0]?.bytes).toBeGreaterThan(0);
    await expect(access(join(outDir, "client", script ?? ""))).resolves.toBeUndefined();
    await expect(access(join(outDir, "client", sourceMap ?? ""))).resolves.toBeUndefined();
    await expect(readFile(join(outDir, "client", script ?? ""), "utf8")).resolves.toContain(
      `//# sourceMappingURL=${script?.split("/").pop()}.map`,
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain(`<link rel="modulepreload" href="/_mreact/client/${script}">`);
    expect(html).toContain(`<script type="module" src="/_mreact/client/${script}"></script>`);
    expect(html).not.toContain('/_mreact/client/routes/index.js"');

    const assetResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request(`http://local.test/_mreact/client/${script}`),
    });

    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(assetResponse.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });

  test("fails production builds with route diagnostics before writing manifests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-diagnostics-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page(props) {
  return <main {...props}>Broken</main>;
}`,
    );

    await expect(buildApp({ appDir, outDir })).rejects.toThrow(
      /page\.tsx.*MR_UNSUPPORTED_SPREAD_ATTRIBUTE/s,
    );
    await expect(access(join(outDir, "server", "manifest.json"))).rejects.toThrow();
    await expect(access(join(outDir, "client", "manifest.json"))).rejects.toThrow();
  });

  test("rejects built server manifests with files outside the app artifact", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-invalid-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(outDir, "server"), { recursive: true });
    await mkdir(join(outDir, "client"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(outDir, "server", "manifest.json"),
      JSON.stringify({
        version: 1,
        routes: [],
        files: {
          "../escape.mreact.tsx": "export default function Page() { return <main>bad</main>; }",
        },
      }),
    );
    await writeFile(join(outDir, "client", "manifest.json"), JSON.stringify({ routes: [] }));

    await expect(
      renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/"),
      }),
    ).rejects.toThrow("Invalid built app manifest file path");
    await expect(access(join(outDir, "server", "runtime", "escape.mreact.tsx"))).rejects.toThrow();
  });

  test("reuses materialized built server runtime while manifests are unchanged", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-cache-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Cached</main>; }",
    );

    await buildApp({ appDir, outDir });
    expect(
      await (
        await renderBuiltAppRequest({
          outDir,
          request: new Request("http://local.test/"),
        })
      ).text(),
    ).toContain("<main>Cached</main>");
    const runtimeFile = join(outDir, "server", "runtime", "app", "page.mreact.tsx");
    const firstMtime = (await stat(runtimeFile)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(
      await (
        await renderBuiltAppRequest({
          outDir,
          request: new Request("http://local.test/"),
        })
      ).text(),
    ).toContain("<main>Cached</main>");

    expect((await stat(runtimeFile)).mtimeMs).toBe(firstMtime);
  });

  test("invalidates materialized built runtime when the server manifest changes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-cache-invalidate-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "old"), { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>First</main>; }",
    );
    await writeFile(
      join(appDir, "old", "page.mreact.tsx"),
      "export default function Old() { return <main>Old</main>; }",
    );

    await buildApp({ appDir, outDir });
    expect(
      await (
        await renderBuiltAppRequest({
          outDir,
          request: new Request("http://local.test/old"),
        })
      ).text(),
    ).toContain("<main>Old</main>");
    await rm(join(appDir, "old"), { force: true, recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Second</main>; }",
    );
    await buildApp({ appDir, outDir });

    const secondResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const staleResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/old"),
    });

    expect(await secondResponse.text()).toContain("<main>Second</main>");
    expect(staleResponse.status).toBe(404);
  });
});
