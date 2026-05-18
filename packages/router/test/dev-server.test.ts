import { createServer, get, request as nodeRequest } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { startDevServer, type StartDevServerOptions } from "../src/dev-server.js";
import { loadMreactRouterViteConfig } from "../src/vite-config.js";

const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("startDevServer", () => {
  test("serves bundled client route modules", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("__mreactResumeRoute");
  });

  test("streams page chunks without buffering the whole response", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-stream-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  const name = new Promise((resolve) => setTimeout(() => resolve("Ada"), 80));
  return <main><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const startedAt = Date.now();
    const firstChunk = await firstResponseChunk(server.url);

    expect(Date.now() - startedAt).toBeLessThan(70);
    expect(firstChunk).toContain("<!DOCTYPE html>");
    expect(firstChunk).not.toContain("<strong>Ada</strong>");
  });

  test("passes request headers and body to route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-request-"));
    await mkdir(join(appDir, "api", "echo"), { recursive: true });
    await writeFile(
      join(appDir, "api", "echo", "route.ts"),
      `export async function POST(request: Request) {
  return Response.json({
    body: await request.text(),
    header: request.headers.get("x-mreact-test"),
    method: request.method,
  });
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await postJson(`${server.url}/api/echo`, "hello body");

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      body: "hello body",
      header: "present",
      method: "POST",
    });
  });

  test("allows declared server dependencies during dev requests", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-deps-"));
    const routesDir = join(projectRoot, "src", "app");
    await mkdir(routesDir, { recursive: true });
    await writeDevPackageFixture(projectRoot);
    await writeFile(
      join(routesDir, "page.tsx"),
      `import { version } from "fixture-lib";

export function loader() {
  return { version };
}

export default function Page(props) {
  return <main>{props.data.version}</main>;
}`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["src"],
      publicDir: "public",
      routesDir: "src/app",
    });
    const server = await startTrackedDevServer({ projectRoot, port: 0 });

    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>fixture-dev-ok</main>");
  });

  test("does not expose the legacy SSE reload endpoint", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-watch-"));
    const pageFile = join(appDir, "page.mreact.tsx");
    await writeFile(pageFile, "export default function Page() { return <main>before</main>; }");
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/dev`);

    expect(response.status).toBe(404);
  });

  test("injects Vite HMR into client route bundles", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-reload-client-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(script).toContain("/@vite/client");
    expect(script).toContain("import.meta.hot");
    expect(script).toContain("__mreactHydrateRoute");
  });

  test("marks HMR route updates as state preserving", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-state-hmr-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(script).toContain("__mreactRouteStates");
    expect(script).toContain("__mreactPreserveRouteState");
    expect(script).toContain("import.meta.hot.data.__mreactRouteStates");
  });

  test("drops preserved HMR route state when the compiled cell signature changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-state-hmr-signature-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(script).toContain("__mreactRouteStateSignature");
    expect(script).toContain("__mreactDropMismatchedRouteState");
    expect(script).toContain("mreact: dropping stale route state");
  });

  test("loads mreactRouter project options from vite.config.ts", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-config-"));
    const routesDir = join(projectRoot, "routes");
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export default function Page() { return <main>Loaded from vite config</main>; }`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["routes"],
      publicDir: "public",
      routesDir: "routes",
    });
    await expect(
      loadMreactRouterViteConfig({ command: "serve", cwd: projectRoot }),
    ).resolves.toMatchObject({
      routesDir,
    });

    const server = await startTrackedDevServer({
      projectRoot,
      port: 0,
    });
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Loaded from vite config</main>");
  });

  test("uses vite server.port when no explicit dev port is provided", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-vite-port-"));
    const routesDir = join(projectRoot, "routes");
    const port = await unusedTcpPort();
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export default function Page() { return <main>Configured port</main>; }`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["routes"],
      publicDir: "public",
      routesDir: "routes",
      serverPort: port,
    });

    const server = await startTrackedDevServer({
      projectRoot,
    });

    expect(server.url).toBe(`http://127.0.0.1:${port}`);
    expect((await fetch(server.url)).status).toBe(200);
  });

  test("explicit route options override vite.config.ts project options", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-override-"));
    await mkdir(join(projectRoot, "src", "app"), { recursive: true });
    await mkdir(join(projectRoot, "app"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "app", "page.tsx"),
      `export default function Page() { return <main>Config route</main>; }`,
    );
    await writeFile(
      join(projectRoot, "app", "page.tsx"),
      `export default function Page() { return <main>Explicit route</main>; }`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["src"],
      publicDir: "public",
      routesDir: "src/app",
    });

    const server = await startTrackedDevServer({
      allowedSourceDirs: ["app"],
      projectRoot,
      publicDir: "public",
      routesDir: "app",
      port: 0,
    });
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Explicit route</main>");
  });
});

async function startTrackedDevServer(options: StartDevServerOptions) {
  const server = await startDevServer(options);
  servers.push(server);
  return server;
}

function unusedTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : undefined;

      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        if (port === undefined) {
          reject(new Error("failed to allocate a TCP port"));
          return;
        }

        resolve(port);
      });
    });
  });
}

function firstResponseChunk(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      response.setEncoding("utf8");
      response.once("data", (chunk) => {
        request.destroy();
        resolve(String(chunk));
      });
      response.once("error", reject);
    });

    request.once("error", reject);
  });
}

function postJson(
  url: string,
  body: string,
): Promise<{ body: string; status: number | undefined }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = nodeRequest(
      {
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "text/plain",
          "x-mreact-test": "present",
        },
        hostname: parsed.hostname,
        method: "POST",
        path: `${parsed.pathname}${parsed.search}`,
        port: parsed.port,
      },
      (response) => {
        response.setEncoding("utf8");
        let text = "";

        response.on("data", (chunk) => {
          text += String(chunk);
        });
        response.on("end", () => {
          resolve({ body: text, status: response.statusCode });
        });
        response.on("error", reject);
      },
    );

    request.on("error", reject);
    request.end(body);
  });
}

async function writeViteConfig(
  projectRoot: string,
  options: {
    allowedSourceDirs: readonly string[];
    publicDir: string;
    routesDir: string;
    serverPort?: number | undefined;
  },
): Promise<void> {
  const viteModule = pathToFileURL(
    join(process.cwd(), "packages", "router", "src", "vite.ts"),
  ).href;
  await writeFile(
    join(projectRoot, "vite.config.ts"),
    `import { mreactRouter } from ${JSON.stringify(viteModule)};

export default {
  ${options.serverPort === undefined ? "" : `server: { port: ${options.serverPort} },`}
  plugins: [
    mreactRouter({
      allowedSourceDirs: ${JSON.stringify(options.allowedSourceDirs)},
      projectRoot: __dirname,
      publicDir: ${JSON.stringify(options.publicDir)},
      routesDir: ${JSON.stringify(options.routesDir)},
    }),
  ],
};
`,
  );
}

async function writeDevPackageFixture(projectRoot: string): Promise<void> {
  const packageDir = join(projectRoot, "node_modules", "fixture-lib");

  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { "fixture-lib": "1.0.0" }, type: "module" }),
  );
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(join(packageDir, "index.js"), 'export const version = "fixture-dev-ok";');
}
