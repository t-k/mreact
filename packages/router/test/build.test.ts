import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { hasFastPathBody } from "../src/http.js";
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
    expect(serverManifest.serverModules?.["page.mreact.tsx"]?.string?.code).not.toContain(
      "<main>Hello",
    );
    expect(serverManifest.serverModules?.["page.mreact.tsx"]?.string?.sourceHash).toMatch(
      /^[a-f0-9]{16}$/,
    );
    expect(clientManifest.routes[0]?.client).toBe(false);
    expect(viteManifest).toEqual({});

    await expect(access(join(outDir, "server", "app", "page.mreact.tsx"))).rejects.toThrow();
  });

  test("applies global response hook to built app responses", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-response-hook-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Built</main>; }",
    );

    await buildApp({ appDir, outDir });
    const response = await renderBuiltAppRequest({
      outDir,
      onResponse(response) {
        response.headers.set("strict-transport-security", "max-age=31536000");
      },
      request: new Request("http://local.test/"),
    });

    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });

  test("writes and enforces the built server action manifest", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-actions-manifest-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `"use server";
export function save() { return { ok: "save" }; }
export function echo(value) { return { value }; }
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { save } from "./actions";
export default function Page() {
  return <main><form action={save}><button type="submit">Save</button></form></main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifestPath = join(outDir, "server", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      serverActionManifest?: Array<{ moduleId: string; exportName: string }>;
    };

    expect(manifest.serverActionManifest).toEqual([
      { moduleId: "actions.ts", exportName: "echo" },
      { moduleId: "actions.ts", exportName: "save" },
    ]);

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          ...manifest,
          serverActionManifest: [{ moduleId: "actions.ts", exportName: "save" }],
        },
        null,
        2,
      ),
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: ["Blocked"],
          exportName: "echo",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-build-action-manifest",
          "x-mreact-action-nonce": "nonce-build-action-manifest",
          "x-mreact-csrf": "csrf-build-action-manifest",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unknown server action.",
    });
  });

  test("persists configured asset base URLs in the server manifest", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-asset-base-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Asset base</main>; }",
    );

    await buildApp({
      appDir,
      assetBaseUrl: "https://cdn.example.com/_mreact/client/",
      outDir,
      publicAssetBaseUrl: "https://static.example.com/",
    });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as {
      assetBaseUrl?: string;
      publicAssetBaseUrl?: string;
    };

    expect(serverManifest.assetBaseUrl).toBe("https://cdn.example.com/_mreact/client/");
    expect(serverManifest.publicAssetBaseUrl).toBe("https://static.example.com/");
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

  test("builds routes from a routesDir while allowing imports from configured source directories", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-routes-dir-"));
    const routesDir = join(rootDir, "src", "app");
    const libDir = join(rootDir, "src", "lib");
    const publicDir = join(rootDir, "public");
    const outDir = join(rootDir, ".mreact");
    await mkdir(routesDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await mkdir(publicDir, { recursive: true });
    await writeFile(join(libDir, "title.ts"), `export const title = "Routes dir import";`);
    await writeFile(join(publicDir, "styles.css"), "main { color: blue; }");
    await writeFile(
      join(routesDir, "page.mreact.tsx"),
      `import { title } from "../lib/title";

export default function Page() {
  return <main>{title}</main>;
}`,
    );

    await buildApp({
      allowedSourceDirs: [join(rootDir, "src")],
      outDir,
      projectRoot: rootDir,
      publicDir,
      routesDir,
    });
    await rm(join(rootDir, "src"), { force: true, recursive: true });
    await rm(publicDir, { force: true, recursive: true });

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const asset = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/styles.css"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Routes dir import</main>");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("main { color: blue; }");
  });

  test("runs built middleware from a configured routesDir", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-routes-dir-middleware-"));
    const routesDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "middleware.ts"),
      `export const config = {
  matcher: "/login",
};

export function middleware() {
  return new Response(null, {
    headers: { location: "/" },
    status: 303,
  });
}
`,
    );
    await mkdir(join(routesDir, "login"), { recursive: true });
    await writeFile(
      join(routesDir, "login", "page.tsx"),
      `export default function Page() {
  return <main>Login page</main>;
}
`,
    );

    await buildApp({
      allowedSourceDirs: [join(rootDir, "src")],
      outDir,
      projectRoot: rootDir,
      routesDir,
    });
    await rm(join(rootDir, "src"), { force: true, recursive: true });

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/login"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
  });

  test("rejects project paths that resolve outside the project root", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-escaped-paths-"));
    const outsideDir = await mkdtemp(join(tmpdir(), "mreact-app-build-outside-public-"));
    const routesDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      "export default function Page() { return <main>Hello</main>; }",
    );
    await writeFile(join(outsideDir, "secret.txt"), "do not publish");

    await expect(
      buildApp({
        allowedSourceDirs: [join(rootDir, "src")],
        outDir,
        projectRoot: rootDir,
        publicDir: outsideDir,
        routesDir,
      }),
    ).rejects.toThrow(/publicDir.*projectRoot/);

    await expect(access(join(outDir, "client", "public", "secret.txt"))).rejects.toThrow();
  });

  test("uses router native batch escape helper in built server artifacts", async () => {
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

    expect(artifactCode).toContain("@reckona/mreact-router/native-escape");
    expect(artifactCode).toContain("[first, second]");
    expect(await response.text()).toContain("<main>&lt;Ada&gt;&amp; Grace</main>");
  });

  test("writes hashed client route assets and injects production preload tags", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-client-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

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
    expect(html).toContain(`<script type="application/json" id="mreact-route-prefetch-manifest">`);
    expect(html).toContain(`"path":"/"`);
    expect(html).toContain(`"script":"/_mreact/client/${script}"`);
    expect(html).not.toContain('/_mreact/client/routes/index.js"');

    const assetResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request(`http://local.test/_mreact/client/${script}`),
    });

    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(assetResponse.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });

  test("injects configured asset base URL for built client route assets", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-client-cdn-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button onClick={() => count.set((value) => value + 1)}>Count {count}</button>;
}`,
    );

    await buildApp({
      appDir,
      assetBaseUrl: "https://cdn.example.com/mreact-client",
      outDir,
    });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ script?: string }> };
    const script = clientManifest.routes[0]?.script;
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain(
      `<link rel="modulepreload" href="https://cdn.example.com/mreact-client/${script}">`,
    );
    expect(html).toContain(
      `<script type="module" src="https://cdn.example.com/mreact-client/${script}"></script>`,
    );
    expect(html).not.toContain(`href="/_mreact/client/${script}"`);
  });

  test("copies public assets into the production client output and serves them at root paths", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-public-assets-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "public"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main><link rel="stylesheet" href="/styles.css" />Hello</main>;
}`,
    );
    await writeFile(join(appDir, "public", "styles.css"), "main { color: red; }");

    await buildApp({ appDir, outDir });

    await expect(readFile(join(outDir, "client", "public", "styles.css"), "utf8")).resolves.toBe(
      "main { color: red; }",
    );

    const assetResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/styles.css"),
    });

    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(assetResponse.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await assetResponse.text()).toBe("main { color: red; }");
  });

  test("keeps comment-only client markers out of the production client manifest", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-comment-client-marker-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `// This route documents a refresh window but does not touch browser globals.
const copy = "document localStorage cell(0) onClick= are only text";

export default function Page() {
  return <main>{copy}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };

    expect(clientManifest.routes[0]).toMatchObject({ client: false });
    expect(clientManifest.routes[0]?.script).toBeUndefined();
  });

  test("emits navigation runtime for server-only routes that opt into prefetch", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-navigation-runtime-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export const navigationRuntime = true;

export default function Page() {
  return <main><Link href="/about" prefetch="viewport">About</Link></main>;
}`,
    );
    await writeFile(
      join(appDir, "about", "page.tsx"),
      `export default function Page() { return <main>About</main>; }`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      routes: Array<{
        client: boolean;
        navigation?: boolean;
        navigationScript?: string;
        path: string;
        script?: string;
      }>;
    };
    const home = clientManifest.routes.find((route) => route.path === "/");
    const html = await (
      await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/"),
      })
    ).text();

    expect(home).toMatchObject({
      client: false,
      navigation: true,
    });
    expect(home?.script).toBeUndefined();
    expect(home?.navigationScript).toMatch(/^assets\/navigation\.[a-f0-9]{8}\.js$/);
    await expect(access(join(outDir, "client", home?.navigationScript ?? ""))).resolves.toBeUndefined();
    expect(html).toContain(`<script type="module" src="/_mreact/client/${home?.navigationScript}"></script>`);
    expect(html).not.toContain("mreact-props-index");
  });

  test("keeps loader-only server imports server-only during production build", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-loader-server-imports-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "server-config.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const config = cell("server");
export function loadConfig() {
  return config.get();
}
export const isProd = false;
`,
    );
    await writeFile(
      join(appDir, "session.ts"),
      `import { isProd, loadConfig } from "./server-config";

export function readSession() {
  return { env: loadConfig(), preview: !isProd };
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { readSession } from "./session";

export function loader() {
  return readSession();
}

export default function Page() {
  return <main>Admin</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };

    expect(clientManifest.routes[0]).toMatchObject({ client: false });
    expect(clientManifest.routes[0]?.script).toBeUndefined();
  });

  test("passes inferred client boundary imports to production server artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-inferred-boundary-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./Counter";

export default function Page() {
  return <Counter />;
}`,
    );

    await buildApp({ appDir, outDir });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as {
      serverModules?: Record<
        string,
        {
          string?: {
            code?: string;
            metadata?: { clientReferenceManifest?: Array<{ moduleId: string; name: string }> };
          };
        }
      >;
    };
    const artifactCode = serverManifest.serverModules?.["page.tsx"]?.string?.code ?? "";
    const metadata = serverManifest.serverModules?.["page.tsx"]?.string?.metadata;

    expect(artifactCode).toContain('import { Counter } from "./Counter";');
    expect(artifactCode).toContain("data-mreact-client-boundary=");
    expect(artifactCode).not.toContain("Counter(");
    expect(metadata?.clientReferenceManifest).toEqual([
      {
        name: "Counter",
        moduleId: "./Counter",
        exportName: "Counter",
      },
    ]);
  });

  test("strips server-only route exports before compiling production client bundles", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-client-server-exports-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const metadata = {
  title: "Server-only metadata",
};

export async function loader() {
  return { title: "Loaded on the server" };
}

export default function Page(props) {
  const count = cell(0);
  return (
    <button onClick={() => count.set((value) => value + 1)}>
      {props.data.title}: {count}
    </button>
  );
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = clientManifest.routes[0]?.script;

    expect(clientManifest.routes[0]?.client).toBe(true);
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    await expect(readFile(join(outDir, "client", script ?? ""), "utf8")).resolves.not.toContain(
      "Server-only metadata",
    );
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(await response.text()).toContain("Loaded on the server");
  });

  test("adds route path and file context to production client bundle errors", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-client-error-context-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const routeDir = join(appDir, "broken");
    const routeFile = join(routeDir, "page.tsx");
    await mkdir(routeDir, { recursive: true });
    await writeFile(
      routeFile,
      `import { startServer } from "@reckona/mreact-router";

export default function Page() {
  return <button onClick={() => startServer}>Broken</button>;
}`,
    );

    await expect(buildApp({ appDir, outDir })).rejects.toThrow(
      new RegExp(`Failed to build client bundle for /broken \\(${escapeRegExp(routeFile)}\\)`),
    );
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
      /page\.tsx:\d+:\d+ \[MR_UNSUPPORTED_SPREAD_ATTRIBUTE\]/s,
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

  test("reuses built loader modules across warm requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-loader-cache-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `let calls = 0;

export function loader() {
  calls += 1;
  return { calls };
}

export default function Page(props) {
  return <main>{props.data.calls}</main>;
}`,
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

    expect(await first.text()).toContain("<main>1</main>");
    expect(await second.text()).toContain("<main>2</main>");
  });

  test("reuses built middleware modules across warm requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-middleware-cache-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `let calls = 0;

export function middleware() {
  calls += 1;
  return new Response(String(calls), {
    headers: { "x-middleware-calls": String(calls) },
  });
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Middleware</main>; }",
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

    expect(first.headers.get("x-middleware-calls")).toBe("1");
    expect(second.headers.get("x-middleware-calls")).toBe("2");
  });

  test("reuses built route handler modules across warm requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-route-handler-cache-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "counter"), { recursive: true });
    await writeFile(
      join(appDir, "api", "counter", "route.ts"),
      `let calls = 0;

export function GET() {
  calls += 1;
  return new Response(String(calls));
}`,
    );

    await buildApp({ appDir, outDir });
    const first = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/api/counter"),
    });
    const second = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/api/counter"),
    });

    expect(await first.text()).toBe("1");
    expect(await second.text()).toBe("2");
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
      expect(await (await fetch(`${server.url}/`)).text()).toContain("<main>First runtime</main>");

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

      expect(await (await fetch(`${server.url}/`)).text()).toContain("<main>First runtime</main>");
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
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
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
    expect(manifest.prerenderedRoutes?.["/"]?.html).toContain("<main>Prerendered route</main>");

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    // Prerender HIT path must tag the response so sendResponse can take the
    // raw-body fast path (issue 056). The body must not be consumed by this
    // probe — read it last so the WeakMap lookup runs against a fresh
    // Response.
    expect(hasFastPathBody(response)).toBe(true);
    expect(await response.text()).toContain("<main>Prerendered route</main>");
  });

  test("prerender regeneration response is tagged for the fast path", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-prerender-regen-fastpath-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `"use server";

import { revalidatePath } from "@reckona/mreact-router";

export function invalidateHome() {
  revalidatePath("/");
  return "ok";
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const prerender = true;

export function loader() {
  return { value: "fastpath" };
}

export default function Page(props) {
  return <main>{props.data.value}</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    // Prime the in-memory prerender cache.
    await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    // Invalidate the cache so the next request takes the regenerate path.
    await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "invalidateHome",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-fastpath",
          "x-mreact-action-nonce": "nonce-fastpath",
          "x-mreact-csrf": "csrf-fastpath",
        },
        method: "POST",
      }),
    });
    const regenerated = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(regenerated.status).toBe(200);
    expect(hasFastPathBody(regenerated)).toBe(true);
    expect(await regenerated.text()).toContain("<main>fastpath</main>");
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

    expect(manifest.prerenderedRoutes?.["/users/ada"]?.html).toContain("<main>User ada</main>");
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

import { revalidatePath } from "@reckona/mreact-router";

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

import { revalidatePath } from "@reckona/mreact-router";

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
  const entries = new Map<
    string,
    { headers: Record<string, string>; html: string; status: number }
  >();
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
