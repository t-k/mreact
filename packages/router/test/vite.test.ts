import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Connect } from "vite";
import { afterEach, describe, expect, test } from "vitest";
import {
  createAppRouterViteMiddleware,
  mreactRouter,
  mreactRouterConfigFromPlugins,
} from "../src/vite.js";
import { startDevServer } from "../src/dev-server.js";

const servers: Server[] = [];
const devServers: Array<{ close(): Promise<void> }> = [];

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

  test("matches Vite v8 middleware contract and peer range", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-contract-"));
    const middleware: Connect.NextHandleFunction =
      createAppRouterViteMiddleware({ appDir });
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { peerDependencies?: Record<string, string> };

    expect(middleware).toHaveLength(3);
    expect(packageJson.peerDependencies?.vite).toBe(">=8 <9");
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
    const server = await listenWithMiddleware(
      createAppRouterViteMiddleware({ appDir }),
    );

    const page = await fetch(`${server.url}/dashboard`);
    const html = await page.text();
    const asset = await fetch(
      `${server.url}/_mreact/client/routes/dashboard.js`,
    );
    const script = await asset.text();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("count: 0");
    expect(html).toContain('/_mreact/client/routes/dashboard.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("__mreactResumeRoute");
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
