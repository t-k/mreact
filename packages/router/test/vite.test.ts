import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import mdx from "@mdx-js/rollup";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { resolveConfig, type Connect } from "vite";
import { afterEach, describe, expect, test } from "vitest";
import {
  createAppRouterViteMiddleware,
  mreactRouter,
  mreactRouterConfigFromPlugins,
  renderAppRouterClientAsset,
} from "../src/vite.js";
import { startDevServer } from "../src/dev-server.js";
import { loadMreactRouterViteConfigDetails } from "../src/vite-config.js";

const servers: Server[] = [];
const devServers: Array<{ close(): Promise<void> }> = [];
const require = createRequire(import.meta.url);

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await Promise.all(devServers.splice(0).map((server) => server.close()));
});

describe("router Vite middleware", () => {
  test("exposes explicit project paths from the mreactRouter Vite plugin", () => {
    const projectRoot = join(process.cwd(), "fixture-project");
    const config = mreactRouterConfigFromPlugins([
      mreactRouter({
        allowedSourceDirs: ["src"],
        projectRoot,
        publicDir: "public",
        routesDir: "src/app",
      }),
    ]);

    expect(config?.projectRoot).toBe(projectRoot);
    expect(config?.routesDir).toBe(join(projectRoot, "src", "app"));
    expect(config?.publicDir).toBe(join(projectRoot, "public"));
    expect(config?.allowedSourceDirs).toEqual([join(projectRoot, "src")]);
  });

  test("rejects Vite project paths that escape the project root", () => {
    const projectRoot = join(process.cwd(), "fixture-project");

    expect(() =>
      mreactRouter({
        allowedSourceDirs: ["../shared"],
        projectRoot,
        publicDir: "public",
        routesDir: "src/app",
      }),
    ).toThrow(/allowedSourceDirs.*projectRoot/);

    expect(() =>
      mreactRouter({
        allowedSourceDirs: ["src"],
        projectRoot,
        publicDir: "../public",
        routesDir: "src/app",
      }),
    ).toThrow(/publicDir.*projectRoot/);
  });

  test("excludes every mreact client runtime package from dev dependency optimization", async () => {
    const plugin = mreactRouter({
      allowedSourceDirs: ["src"],
      projectRoot: join(process.cwd(), "fixture-project"),
      routesDir: "src/app",
    });
    const configHook = typeof plugin.config === "function" ? plugin.config : plugin.config?.handler;
    expect(configHook).toBeDefined();

    const partialConfig = await configHook?.call(
      {} as never,
      {},
      {
        command: "serve",
        mode: "development",
      },
    );

    // Prebundling any package that links against reactive-core duplicates the
    // reactive runtime in dev and silently breaks cross-package cell tracking,
    // so the whole client-importable mreact family must stay excluded.
    expect(partialConfig?.optimizeDeps?.exclude).toEqual([
      "react",
      "react-dom",
      "react-dom/client",
      "react-dom/server",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
      "@reckona/mreact",
      "@reckona/mreact-auth",
      "@reckona/mreact-compat",
      "@reckona/mreact-devtools",
      "@reckona/mreact-dom",
      "@reckona/mreact-forms",
      "@reckona/mreact-next",
      "@reckona/mreact-query",
      "@reckona/mreact-reactive-core",
      "@reckona/mreact-reactive-dom",
      "@reckona/mreact-router",
      "@reckona/mreact-scheduler",
      "@reckona/mreact-shared",
      "@reckona/mreact-store",
      "@reckona/mreact-test-utils",
      "@reckona/mreact-virtual",
    ]);
  });

  test("keeps the mreact runtime excludes after Vite resolves and merges the dev config", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-optimize-deps-"));
    const resolved = await resolveConfig(
      {
        configFile: false,
        logLevel: "silent",
        optimizeDeps: { exclude: ["app-local-package"] },
        plugins: [
          mreactRouter({
            allowedSourceDirs: ["src"],
            projectRoot,
            routesDir: "src/app",
          }),
        ],
        root: projectRoot,
      },
      "serve",
    );

    // User-level excludes must compose with the plugin list instead of
    // replacing it, mirroring how apps append their own excludes today.
    expect(resolved.optimizeDeps.exclude).toEqual(
      expect.arrayContaining([
        "app-local-package",
        "@reckona/mreact",
        "@reckona/mreact-devtools",
        "@reckona/mreact-query",
        "@reckona/mreact-reactive-core",
        "@reckona/mreact-virtual",
      ]),
    );
  });

  test("resolves runtime reactive-dom internals to native reactive core in dev", async () => {
    const projectRoot = process.cwd();
    const plugin = mreactRouter({
      allowedSourceDirs: ["packages/router/test"],
      projectRoot,
      publicDir: "packages/router/test",
      routesDir: "packages/router/test",
    });
    const resolveId =
      typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId?.handler;
    expect(resolveId).toBeDefined();

    const runtimeImporter = join(projectRoot, "packages", "reactive-dom", "src", "bind-list.ts");
    const pnpmRuntimeImporter = join(
      projectRoot,
      "node_modules",
      ".pnpm",
      "@reckona+mreact-router@0.0.71_vite@8.0.10",
      "node_modules",
      "@reckona",
      "mreact-reactive-dom",
      "dist",
      "bind-list.js",
    );
    const appImporter = join(projectRoot, "packages", "router", "test", "page.tsx");

    await expect(
      resolveId?.call({} as never, "@reckona/mreact-reactive-core", runtimeImporter, {}),
    ).resolves.toContain(join("packages", "reactive-core", "src", "index.ts"));
    await expect(
      resolveId?.call({} as never, "@reckona/mreact-reactive-core", pnpmRuntimeImporter, {}),
    ).resolves.toContain(join("packages", "reactive-core", "src", "index.ts"));
    await expect(
      resolveId?.call({} as never, "@reckona/mreact-reactive-core", appImporter, {}),
    ).resolves.toBe("\0mreact-router-reactive-core");
  });

  test("serves a reactive devtools stub compatible with reactive-core in dev", async () => {
    const projectRoot = process.cwd();
    const plugin = mreactRouter({
      allowedSourceDirs: ["packages/router/test"],
      projectRoot,
      publicDir: "packages/router/test",
      routesDir: "packages/router/test",
    });
    const load = typeof plugin.load === "function" ? plugin.load : plugin.load?.handler;
    expect(load).toBeDefined();

    const source = await load?.call({} as never, "\0mreact-router-reactive-devtools", {});

    expect(source).toContain("export function currentReactiveDevtools()");
    expect(source).toContain("export function emitReactiveEffectRunDevtoolsEvent()");
    expect(source).toContain("export function invalidateReactiveDevtoolsCache()");
    expect(source).toContain("export function prepareReactiveEffectRunDevtoolsEvent()");
    expect(source).toContain("return undefined");
  });

  test("invalidates only Vite hot update modules for mreact client dev modules", () => {
    const projectRoot = process.cwd();
    const plugin = mreactRouter({
      allowedSourceDirs: ["packages/router/test"],
      projectRoot,
      publicDir: "packages/router/test",
      routesDir: "packages/router/test",
    });
    const handleHotUpdate =
      typeof plugin.handleHotUpdate === "function"
        ? plugin.handleHotUpdate
        : plugin.handleHotUpdate?.handler;
    expect(handleHotUpdate).toBeDefined();

    const changedModule = {
      id: `${join(projectRoot, "packages/router/test/page.tsx")}?mreact-router-client-route=/page`,
      url: "/@id/page",
    };
    const unrelatedModule = {
      id: `${join(projectRoot, "packages/router/test/other.tsx")}?mreact-router-client-route=/other`,
      url: "/@id/other",
    };
    const invalidated: unknown[] = [];
    const messages: unknown[] = [];

    const result = handleHotUpdate?.call(
      {} as never,
      {
        file: join(projectRoot, "packages/router/test/page.tsx"),
        modules: [changedModule],
        server: {
          moduleGraph: {
            idToModuleMap: new Map([
              [changedModule.id, changedModule],
              [unrelatedModule.id, unrelatedModule],
            ]),
            invalidateModule(moduleNode: unknown) {
              invalidated.push(moduleNode);
            },
          },
          ws: {
            send(message: unknown) {
              messages.push(message);
            },
          },
        },
      } as never,
    );

    expect(result).toEqual([]);
    expect(invalidated).toEqual([changedModule]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "update",
      updates: [
        {
          acceptedPath: changedModule.url,
          path: changedModule.url,
          type: "js-update",
        },
      ],
    });
  });

  test("resolves the mreact root runtime to ESM in dev SSR", async () => {
    const projectRoot = process.cwd();
    const plugin = mreactRouter({
      allowedSourceDirs: ["packages/router/test"],
      projectRoot,
      publicDir: "packages/router/test",
      routesDir: "packages/router/test",
    });
    const resolveId =
      typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId?.handler;
    expect(resolveId).toBeDefined();

    const appImporter = join(projectRoot, "packages", "router", "test", "page.tsx");

    await expect(
      resolveId?.call({} as never, "@reckona/mreact", appImporter, {}),
    ).resolves.toContain(join("packages", "react", "src", "index.ts"));
  });

  test("matches Vite v8 middleware contract and peer range", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-contract-"));
    const middleware: Connect.NextHandleFunction = createAppRouterViteMiddleware({ appDir });
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { peerDependencies?: Record<string, string> };

    expect(middleware).toHaveLength(3);
    expect(packageJson.peerDependencies?.vite).toBe(">=8.0.16 <9");
  });

  test("shares the dev app route scan across styles, navigation, and render", async () => {
    const source = await readFile(new URL("../src/vite.ts", import.meta.url), "utf8");

    expect(source).toContain("const routes = await scanAppRoutes({ appDir: project.routesDir });");
    expect(source).toContain("devRouteStyles(project, routes, readRouteSource)");
    expect(source).toContain("devSpecialRouteStyles(project, readRouteSource)");
    expect(source).toContain("devNavigationScripts(\n        project.routesDir,\n        routes,");
    expect(source).toContain("routes,");
    expect(source).toContain("routeMatcher,");
  });

  test("serves page HTML and client assets through HTTP", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-"));
    await mkdir(join(appDir, "dashboard"), { recursive: true });
    await writeFile(
      join(appDir, "dashboard", "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await listenWithMiddleware(createAppRouterViteMiddleware({ appDir }));

    const page = await fetch(`${server.url}/dashboard`);
    const html = await page.text();
    const asset = await fetch(`${server.url}/_mreact/client/routes/dashboard.js`);
    const script = await asset.text();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("count: 0");
    expect(html).toContain("/_mreact/client/routes/dashboard.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("__mreactResumeRoute");
  });

  test("serves frontmatter MDX routes through the dev server", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-mdx-dev-"));
    const appDir = join(projectRoot, "src", "app");
    const routeDir = join(appDir, "$...slug");
    await mkdir(routeDir, { recursive: true });
    await mkdir(join(projectRoot, "src", "content", "evaluate"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "content", "evaluate", "why.mdx"),
      `---
title: Why MDX
---

# Why MDX
`,
    );
    await writeFile(
      join(routeDir, "page.tsx"),
      `import { notFound, type LoaderContext } from "@reckona/mreact-router";

const modules = import.meta.glob("../../content/**/*.mdx", { eager: true });

const pages = {};

for (const [path, mod] of Object.entries(modules)) {
  const slug = path.replace("../../content/", "").replace(".mdx", "");
  pages[slug] = mod.default;
}

export function loader(ctx: LoaderContext<{ slug: readonly string[] }>): { slug: string } {
  const slug = (ctx.params.slug ?? []).join("/");
  if (pages[slug] === undefined) notFound();
  return { slug };
}

export default function Page(props: { data: { slug: string } }) {
  const Content = pages[props.data.slug];
  return <main><Content /></main>;
}
`,
    );
    const devServer = await startDevServer({
      port: 0,
      projectRoot,
      routesDir: appDir,
      viteConfig: {
        plugins: [
          mdx({
            jsxImportSource: "@reckona/mreact",
            jsxRuntime: "automatic",
            remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
          }),
        ],
      },
    });
    devServers.push(devServer);

    const response = await fetch(`${devServer.url}/evaluate/why`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Why MDX</h1>");
    expect(html).not.toContain("[PARSE_ERROR]");
    expect(html).not.toContain("Cannot assign to this expression");
  });

  test("dev SSR resolves the mreact root runtime through the router plugin", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-root-runtime-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { memo } from "@reckona/mreact";

const Timeline = memo(function Timeline(props: { readonly title: string }) {
  return <section data-testid="timeline-root-runtime">{props.title}</section>;
});

export default function Page() {
  return <main><Timeline title="Timeline" /></main>;
}
`,
    );
    const devServer = await startDevServer({
      port: 0,
      projectRoot,
      routesDir: appDir,
    });
    devServers.push(devServer);

    const response = await fetch(devServer.url);
    const html = await response.text();

    expect(response.status, html).toBe(200);
    expect(html).toContain('data-testid="timeline-root-runtime"');
    expect(html).toContain("Timeline");
    expect(html).not.toContain("exports is not defined");
  });

  test("dev SSR keeps inferred boundary fallback HTML with root runtime imports", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-root-boundary-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "TimelineCard.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type TimelineCardProps = {
  readonly onOpenMedia?: ((id: string) => void) | undefined;
};

export function TimelineCard(props: TimelineCardProps) {
  const title = cell("Dev SSR fallback").get();
  return (
    <article data-testid="timeline-card">
      <button
        type="button"
        onClick={props.onOpenMedia === undefined ? undefined : () => props.onOpenMedia?.("media-1")}
      >
        {title}
      </button>
    </article>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { memo } from "@reckona/mreact";
import { TimelineCard } from "./components/TimelineCard";

const Shell = memo(function Shell(props: { readonly children: unknown }) {
  return <main>{props.children}</main>;
});

export default function Page() {
  return <Shell><TimelineCard /></Shell>;
}
`,
    );
    const devServer = await startDevServer({
      port: 0,
      projectRoot,
      routesDir: appDir,
    });
    devServers.push(devServer);

    const response = await fetch(devServer.url);
    const html = await response.text();

    expect(response.status, html).toBe(200);
    expect(html).toContain('data-mreact-client-boundary="TimelineCard"');
    expect(html).toContain('data-testid="timeline-card"');
    expect(html).toContain("Dev SSR fallback");
    expect(html).not.toContain("exports is not defined");
  });

  test("serves client assets for interactive routes with function loader exports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-loader-client-"));
    await mkdir(join(appDir, "settings", "appearance"), { recursive: true });
    await writeFile(
      join(appDir, "settings", "appearance", "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

const selected = cell("system");

export function loader(context: { readonly request: Request }) {
  return {};
}

function ThemeToggle() {
  return <button type="button" onClick={() => selected.set("dark")}>{selected.get()}</button>;
}

export default function Page() {
  return <main>{ThemeToggle()}</main>;
}`,
    );
    const server = await listenWithMiddleware(createAppRouterViteMiddleware({ appDir }));

    const asset = await fetch(`${server.url}/_mreact/client/routes/settings_appearance.js`);
    const script = await asset.text();

    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("__mreactResumeRoute");
    expect(script).not.toContain("function loader");
    expect(script).not.toContain("readonly request");
  });

  test("returns a 500 diagnostic response when client asset builds fail", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-client-build-error-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { basename } from "node:path";
import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{basename("count")}: {count.get()}</button>;
}`,
    );

    const response = await renderAppRouterClientAsset(appDir, "/_mreact/client/routes/index.js", {
      dev: true,
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(body).toContain("Failed to build mreact client route asset");
    expect(body).toContain("page.mreact.tsx");
    expect(body).toContain("Browser build cannot import Node builtin");
  });

  test("sends render errors to the Vite error overlay websocket", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-render-error-overlay-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  throw new Error("fixture render exploded");
}`,
    );
    const sent: unknown[] = [];
    const middleware = createAppRouterViteMiddleware({
      appDir,
      viteDevServer: {
        ssrFixStacktrace(error: Error) {
          error.stack = "fixed stack";
        },
        ws: {
          send(payload: unknown) {
            sent.push(payload);
          },
        },
      },
    } as never);
    const server = await listenWithMiddleware((request, response, next) => {
      middleware(request, response, (error?: unknown) => {
        if (error === undefined) {
          next();
          return;
        }
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : String(error));
      });
    });

    const response = await fetch(`${server.url}/`);
    await response.text();

    expect(response.status).toBe(500);
    expect(sent).toContainEqual({
      type: "error",
      err: expect.objectContaining({
        message: expect.stringContaining("fixture render exploded"),
        stack: "fixed stack",
      }),
    });
  });

  test("links layout CSS imports to Vite CSS proxy URLs in dev HTML", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-css-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(projectRoot, "src", "global.css"), ".title { color: rgb(1 2 3); }");
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main className="title">Styled</main>;
}`,
    );
    const server = await listenWithMiddleware(
      createAppRouterViteMiddleware({
        projectRoot,
        routesDir: appDir,
      }),
    );

    const page = await fetch(`${server.url}/`);
    const html = await page.text();

    expect(page.status).toBe(200);
    expect(html).toContain('<link rel="stylesheet" href="/_mreact/dev-css/src/global.css">');
    expect(html).not.toContain("/_mreact/client/src/global.css");
  });

  test("links layout CSS imports for dev special not-found routes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-not-found-css-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(projectRoot, "src", "global.css"), ".missing { color: rgb(1 2 3); }");
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "not-found.tsx"),
      `export default function NotFound() {
  return <main className="missing">Missing</main>;
}`,
    );
    const server = await listenWithMiddleware(
      createAppRouterViteMiddleware({
        projectRoot,
        routesDir: appDir,
      }),
    );

    const page = await fetch(`${server.url}/missing`);
    const html = await page.text();

    expect(page.status).toBe(404);
    expect(html).toContain('<main class="missing">Missing</main>');
    expect(html).toContain('<link rel="stylesheet" href="/_mreact/dev-css/src/global.css">');
  });

  test("serves linked layout CSS through the Vite dev server", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-css-server-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(projectRoot, "src", "global.css"), ".title { color: rgb(7 8 9); }");
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main className="title">Styled</main>;
}`,
    );
    const server = await startDevServer({
      port: 0,
      projectRoot,
      routesDir: appDir,
    });
    devServers.push(server);

    const page = await fetch(`${server.url}/`);
    const html = await page.text();
    const cssHref = html.match(/<link rel="stylesheet" href="([^"]+)">/u)?.[1];
    const css = await fetch(`${server.url}${cssHref}`);
    const cssText = await css.text();

    expect(page.status).toBe(200);
    expect(cssHref).toBe("/_mreact/dev-css/src/global.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(cssText).toContain(".title");
  });

  test("serves linked layout CSS through configured Vite CSS plugins", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-css-plugin-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(projectRoot, "src", "global.css"), "/* fixture:route-css */");
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      `import { mreactRouter } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "packages", "router", "src", "vite.ts")).href)};

const fixtureCssPlugin = () => ({
  name: "fixture-css-transform",
  config() {
    return {
      css: {
        postcss: {
          plugins: [
            {
              postcssPlugin: "fixture-css-transform",
              Once(root) {
                if (!root.toString().includes("fixture:route-css")) {
                  return;
                }
                root.removeAll();
                root.append({
                  selector: ".bg-slate-50",
                  nodes: [{ prop: "background-color", value: "oklch(0.984 0.003 247.858)" }],
                });
              },
            },
          ],
        },
      },
    };
  },
});

export default {
  plugins: [
    fixtureCssPlugin(),
    mreactRouter({
      allowedSourceDirs: ["src"],
      projectRoot: __dirname,
      routesDir: "src/app",
    }),
  ],
};
`,
    );
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main className="bg-slate-50">Styled</main>;
}`,
    );
    const server = await startDevServer({
      port: 0,
      projectRoot,
    });
    devServers.push(server);

    const page = await fetch(`${server.url}/`);
    const html = await page.text();
    const cssHref = html.match(/<link rel="stylesheet" href="([^"]+)">/u)?.[1];
    const css = await fetch(`${server.url}${cssHref}`);
    const cssText = await css.text();

    expect(page.status).toBe(200);
    expect(cssHref).toBe("/_mreact/dev-css/src/global.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(cssText).toContain(".bg-slate-50");
    expect(cssText).not.toContain("fixture:route-css");
  });

  test("dev Tailwind CSS scans route sources without an explicit source directive", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-tailwind-dev-"));
    const appDir = join(projectRoot, "src", "app");
    const stylesDir = join(projectRoot, "src", "styles");
    const backgroundClass = ["bg", "[#123456]"].join("-");
    const darkBackgroundClass = ["dark", "bg-[#654321]"].join(":");
    const responsiveClass = ["lg", "grid"].join(":");
    await mkdir(appDir, { recursive: true });
    await mkdir(stylesDir, { recursive: true });
    await writeFile(
      join(stylesDir, "global.css"),
      `@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
`,
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      `import tailwindcss from ${JSON.stringify(pathToFileURL(require.resolve("@tailwindcss/vite")).href)};
import { mreactRouter } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "packages", "router", "src", "vite.ts")).href)};

export default {
  plugins: [
    tailwindcss(),
    mreactRouter({
      allowedSourceDirs: ["src"],
      projectRoot: __dirname,
      routesDir: "src/app",
    }),
  ],
};
`,
    );
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../styles/global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main className="${backgroundClass} ${darkBackgroundClass} ${responsiveClass}">Styled</main>;
}`,
    );
    const server = await startDevServer({
      port: 0,
      projectRoot,
    });
    devServers.push(server);

    const page = await fetch(`${server.url}/`);
    const html = await page.text();
    const cssHref = html.match(/<link rel="stylesheet" href="([^"]+)">/u)?.[1];
    const css = await fetch(`${server.url}${cssHref}`);
    const cssText = await css.text();

    expect(page.status).toBe(200);
    expect(cssHref).toBe("/_mreact/dev-css/src/styles/global.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(cssText).toContain(`.${escapeCssClass(backgroundClass)}`);
    expect(cssText).toContain(`.${escapeCssClass(darkBackgroundClass)}`);
    expect(cssText).toContain(`.${escapeCssClass(responsiveClass)}`);
  });

  test("injects source-root directives before dev CSS plugins transform Tailwind entries", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-tailwind-source-hint-"));
    const appDir = join(projectRoot, "src", "app");
    const stylesDir = join(projectRoot, "src", "styles");
    await mkdir(appDir, { recursive: true });
    await mkdir(stylesDir, { recursive: true });
    await writeFile(
      join(stylesDir, "global.css"),
      `@import "tailwindcss";
`,
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      `import { mreactRouter } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "packages", "router", "src", "vite.ts")).href)};

const fixtureTailwindLikePlugin = () => ({
  name: "fixture-tailwind-like-source-scan",
  enforce: "pre",
  transform(code, id) {
    if (!id.includes("global.css")) {
      return;
    }
    return code.includes("@source ")
      ? ".fixture-tailwind-utility { color: rgb(12 34 56); }"
      : ".fixture-tailwind-missing-source { color: rgb(65 43 21); }";
  },
});

export default {
  plugins: [
    fixtureTailwindLikePlugin(),
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "src/app",
    }),
  ],
};
`,
    );
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../styles/global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main className="fixture-tailwind-utility">Styled</main>;
}`,
    );
    const server = await startDevServer({
      port: 0,
      projectRoot,
    });
    devServers.push(server);

    const page = await fetch(`${server.url}/`);
    const html = await page.text();
    const cssHref = html.match(/<link rel="stylesheet" href="([^"]+)">/u)?.[1];
    const css = await fetch(`${server.url}${cssHref}`);
    const cssText = await css.text();

    expect(page.status).toBe(200);
    expect(cssHref).toBe("/_mreact/dev-css/src/styles/global.css");
    expect(css.status).toBe(200);
    expect(cssText).toContain(".fixture-tailwind-utility");
    expect(cssText).not.toContain(".fixture-tailwind-missing-source");
  });

  test("preserves loaded Vite CSS plugins when dev starts from router project options", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-vite-css-loaded-config-"));
    const appDir = join(projectRoot, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(projectRoot, "src", "global.css"), "/* fixture:route-css */");
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      `import { mreactRouter } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "packages", "router", "src", "vite.ts")).href)};

const fixtureCssPlugin = () => ({
  name: "fixture-css-transform",
  config() {
    return {
      css: {
        postcss: {
          plugins: [
            {
              postcssPlugin: "fixture-css-transform",
              Once(root) {
                if (!root.toString().includes("fixture:route-css")) {
                  return;
                }
                root.removeAll();
                root.append({
                  selector: ".bg-slate-50",
                  nodes: [{ prop: "background-color", value: "oklch(0.984 0.003 247.858)" }],
                });
              },
            },
          ],
        },
      },
    };
  },
});

export default {
  plugins: [
    fixtureCssPlugin(),
    mreactRouter({
      allowedSourceDirs: ["src"],
      projectRoot: __dirname,
      routesDir: "src/app",
    }),
  ],
};
`,
    );
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "../global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export default function Page() {
  return <main className="bg-slate-50">Styled</main>;
}`,
    );
    const loaded = await loadMreactRouterViteConfigDetails({
      command: "serve",
      cwd: projectRoot,
    });
    const server = await startDevServer({
      ...loaded.project,
      port: 0,
      viteConfig: loaded.viteConfig,
    });
    devServers.push(server);

    const page = await fetch(`${server.url}/`);
    const html = await page.text();
    const cssHref = html.match(/<link rel="stylesheet" href="([^"]+)">/u)?.[1];
    const css = await fetch(`${server.url}${cssHref}`);
    const cssText = await css.text();

    expect(page.status).toBe(200);
    expect(cssHref).toBe("/_mreact/dev-css/src/global.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(cssText).toContain(".bg-slate-50");
    expect(cssText).not.toContain("fixture:route-css");
  });
});

async function listenWithMiddleware(
  middleware: Connect.NextHandleFunction,
): Promise<{ url: string }> {
  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end("Not Found");
    });
  });

  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (typeof address !== "object" || address === null) {
    throw new Error("Expected HTTP server address.");
  }

  return { url: `http://127.0.0.1:${address.port}` };
}

function escapeCssClass(className: string): string {
  return className
    .replaceAll(":", "\\:")
    .replaceAll("#", "\\#")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
}
