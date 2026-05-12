import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderBuiltAppRequest, startServer } from "../src/serve.js";

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
    ) as {
      files?: Record<string, string>;
      routes: Array<{ file: string; path: string }>;
      serverModules?: Record<string, { string?: { code?: string; sourceHash?: string } }>;
    };
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
    expect(serverManifest.serverModules?.["page.mreact.tsx"]?.string?.code).toContain(
      '_out += "<main";',
    );
    expect(serverManifest.serverModules?.["page.mreact.tsx"]?.string?.code).not.toContain("<main>Hello");
    expect(serverManifest.serverModules?.["page.mreact.tsx"]?.string?.sourceHash).toMatch(
      /^[a-f0-9]{16}$/,
    );
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

  test("uses app-router native batch escape helper in built server artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-native-escape-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  const first = "<Ada>";
  const second = "& Grace";
  return <main>{first}{second}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { serverModules?: Record<string, { string?: { code?: string } }> };
    const artifactCode = serverManifest.serverModules?.["page.tsx"]?.string?.code ?? "";
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(artifactCode).toContain("@modular-react/app-router/internal/native-escape");
    expect(artifactCode).toContain("[first, second]");
    expect(await response.text()).toContain(
      "<main>&lt;Ada&gt;&amp; Grace</main>",
    );
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

  test("uses built manifest routes instead of rescanning runtime files per request", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-route-manifest-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Home</main>; }",
    );

    await buildApp({ appDir, outDir });
    expect(
      await (
        await renderBuiltAppRequest({
          outDir,
          request: new Request("http://local.test/"),
        })
      ).text(),
    ).toContain("<main>Home</main>");

    const injectedRouteDir = join(outDir, "server", "runtime", "app", "injected");
    await mkdir(injectedRouteDir, { recursive: true });
    await writeFile(
      join(injectedRouteDir, "page.mreact.tsx"),
      "export default function Injected() { return <main>Injected</main>; }",
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/injected"),
    });

    expect(response.status).toBe(404);
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

  test("invalidates cached SSR modules when imported built files change", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-module-cache-invalidate-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "data.ts"),
      `export function title() {
  return "First dependency";
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { title } from "./data";

export default function Page() {
  return <main>{title()}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    expect(
      await (
        await renderBuiltAppRequest({
          outDir,
          request: new Request("http://local.test/"),
        })
      ).text(),
    ).toContain("<main>First dependency</main>");

    await writeFile(
      join(appDir, "data.ts"),
      `export function title() {
  return "Second dependency";
}`,
    );
    await buildApp({ appDir, outDir });
    expect(
      await (
        await renderBuiltAppRequest({
          outDir,
          request: new Request("http://local.test/"),
        })
      ).text(),
    ).toContain("<main>Second dependency</main>");
  });

  test("started server pins built runtime instead of rereading manifests per request", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-start-server-pinned-runtime-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>First runtime</main>; }",
    );
    await buildApp({ appDir, outDir });
    const server = await startServer({ outDir, port: 0 });

    try {
      expect(await (await fetch(`${server.url}/`)).text()).toContain(
        "<main>First runtime</main>",
      );

      const serverManifestFile = join(outDir, "server", "manifest.json");
      const serverManifest = JSON.parse(await readFile(serverManifestFile, "utf8")) as {
        files: Record<string, string>;
        routes: unknown[];
        version: 1;
      };
      await writeFile(
        serverManifestFile,
        JSON.stringify({ ...serverManifest, routes: [] }, null, 2),
      );
      await writeFile(
        join(outDir, "server", "runtime", "app", "page.mreact.tsx"),
        "export default function Page() { return <main>Mutated runtime file</main>; }",
      );

      expect(await (await fetch(`${server.url}/`)).text()).toContain(
        "<main>First runtime</main>",
      );
    } finally {
      await server.close();
    }
  });

  test("started server renders from server module artifacts when runtime source changes before first request", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-start-server-artifact-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Artifact runtime</main>; }",
    );
    await buildApp({ appDir, outDir });
    const server = await startServer({ outDir, port: 0 });

    try {
      await writeFile(
        join(outDir, "server", "runtime", "app", "page.mreact.tsx"),
        "export default function Page() { return <main>Mutated source</main>; }",
      );

      expect(await (await fetch(`${server.url}/`)).text()).toContain(
        "<main>Artifact runtime</main>",
      );
    } finally {
      await server.close();
    }
  });

  test("serves prerendered static routes from the build artifact", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-prerendered-route-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><slot /></body></html>; }",
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const prerender = true;
export default function Page() { return <main>Prerendered route</main>; }`,
    );

    await buildApp({ appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string; status?: number }> };
    expect(manifest.prerenderedRoutes?.["/"]?.html).toContain(
      "<main>Prerendered route</main>",
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Prerendered route</main>");
  });

  test("prerenders dynamic routes from generateStaticParams at build time", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-prerender-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      `export const prerender = true;

export function generateStaticParams() {
  return [{ id: "ada" }, { id: "grace hopper" }];
}

export default function Page(props) {
  return <main>User {props.params.id}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string }> };

    expect(manifest.prerenderedRoutes?.["/users/ada"]?.html).toContain(
      "<main>User ada</main>",
    );
    expect(manifest.prerenderedRoutes?.["/users/grace%20hopper"]?.html).toContain(
      "<main>User grace hopper</main>",
    );
  });

  test("invalidates and lazily regenerates prerendered routes after server actions", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-prerender-revalidate-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `"use server";

import { revalidatePath } from "@modular-react/app-router";

export function invalidateHome() {
  revalidatePath("/");
  return "ok";
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const prerender = true;

export function loader() {
  const state = globalThis as { __mreactBuiltPrerenderCalls?: number };
  state.__mreactBuiltPrerenderCalls = (state.__mreactBuiltPrerenderCalls ?? 0) + 1;
  return { calls: state.__mreactBuiltPrerenderCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const first = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const action = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "invalidateHome",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-built-prerender",
          "x-mreact-action-nonce": "nonce-built-prerender",
          "x-mreact-csrf": "csrf-built-prerender",
        },
        method: "POST",
      }),
    });
    const regenerated = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const cachedAgain = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(action.status).toBe(200);
    expect(action.headers.get("x-mreact-revalidate")).toBe("/");
    expect(await regenerated.text()).toContain("<main>calls: 2</main>");
    expect(await cachedAgain.text()).toContain("<main>calls: 2</main>");
  });

  test("uses an external prerender store and single-flight regeneration", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-prerender-store-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const store = createRecordingPrerenderStore();
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `"use server";

import { revalidatePath } from "@modular-react/app-router";

export function invalidateHome() {
  revalidatePath("/");
  return "ok";
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const prerender = true;

export async function loader() {
  const state = globalThis as { __mreactSingleFlightCalls?: number };
  state.__mreactSingleFlightCalls = (state.__mreactSingleFlightCalls ?? 0) + 1;
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { calls: state.__mreactSingleFlightCalls };
}

export default function Page(props) {
  return <main>single: {props.data.calls}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const first = await renderBuiltAppRequest({
      outDir,
      prerenderStore: store,
      request: new Request("http://local.test/"),
    });
    const action = await renderBuiltAppRequest({
      outDir,
      prerenderStore: store,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "invalidateHome",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-prerender-store",
          "x-mreact-action-nonce": "nonce-prerender-store",
          "x-mreact-csrf": "csrf-prerender-store",
        },
        method: "POST",
      }),
    });
    const [regeneratedA, regeneratedB] = await Promise.all([
      renderBuiltAppRequest({
        outDir,
        prerenderStore: store,
        request: new Request("http://local.test/"),
      }),
      renderBuiltAppRequest({
        outDir,
        prerenderStore: store,
        request: new Request("http://local.test/"),
      }),
    ]);

    expect(await first.text()).toContain("<main>single: 1</main>");
    expect(action.status).toBe(200);
    expect(await regeneratedA.text()).toContain("<main>single: 2</main>");
    expect(await regeneratedB.text()).toContain("<main>single: 2</main>");
    expect(store.calls).toContain("delete:/");
    expect(store.calls.filter((call) => call === "lock:/")).toHaveLength(1);
    expect(store.calls.filter((call) => call === "set:/")).toHaveLength(2);
  });
});

function createRecordingPrerenderStore() {
  const entries = new Map<string, { headers: Record<string, string>; html: string; status: number }>();
  const calls: string[] = [];

  return {
    calls,
    delete(path: string) {
      calls.push(`delete:${path}`);
      entries.delete(path);
    },
    get(path: string) {
      calls.push(`get:${path}`);
      return entries.get(path);
    },
    set(path: string, entry: { headers: Record<string, string>; html: string; status: number }) {
      calls.push(`set:${path}`);
      entries.set(path, entry);
    },
    async withLock<T>(path: string, task: () => Promise<T>): Promise<T> {
      calls.push(`lock:${path}`);
      return await task();
    },
  };
}
