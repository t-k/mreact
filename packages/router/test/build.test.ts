import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import mdx from "@mdx-js/rollup";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { describe, expect, test, vi } from "vitest";
import {
  __bundleRouteRequestModuleBatchForTests,
  __buildCloudflareRouteLoaderModuleBatchForTests,
  __mapWithBuildConcurrencyForTests,
  __writeServerModuleArtifactFilesForTests,
  buildApp,
  packageAwsLambdaArtifact,
  packageCloudflarePagesArtifact,
} from "../src/build.js";
import { exportStaticApp } from "../src/adapters/static.js";
import { hasFastPathBody } from "../src/http.js";
import { renderAppRequest } from "../src/render.js";
import { preloadBuiltAppRuntime, renderBuiltAppRequest, startServer } from "../src/serve.js";
import {
  __readServerActionInferenceTypeScriptLoadedForTests,
  __resetServerActionInferenceTypeScriptForTests,
} from "../src/server-action-inference.js";

function createExecutionContext(): ExecutionContext {
  return {
    passThroughOnException() {},
    waitUntil() {},
  };
}

function localNameForMinifiedExport(source: string, exportName: string): string | undefined {
  const exportClause = /export\{([^}]+)\};?\s*$/.exec(source)?.[1];
  if (exportClause === undefined) {
    return undefined;
  }

  return new RegExp(String.raw`(?:^|,)\s*([\w$]+)\s+as\s+${exportName}\s*(?:,|$)`).exec(exportClause)?.[1];
}

function minifiedExportClause(source: string): string | undefined {
  return /export\{([^}]+)\};?\s*$/.exec(source)?.[1];
}

interface ExecutionContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        if (address === null || typeof address === "string") {
          reject(new Error("Failed to allocate a TCP port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function stopChildProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function waitForHttpServer(url: string, processOutput: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for ${url}.\n${processOutput()}\n${String(lastError)}`);
}

async function waitForProcessOutput(
  processOutput: () => string,
  pattern: string,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (processOutput().includes(pattern)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for ${label}.\n${processOutput()}`);
}

async function withWranglerPagesDev<T>(
  pagesOutDir: string,
  run: (origin: string) => Promise<T>,
  options: { compatibilityDate?: string; readiness?: "http" | "output" } = {},
): Promise<T> {
  const port = await findFreePort();
  const output: string[] = [];
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "pages",
      "dev",
      pagesOutDir,
      "--compatibility-date",
      options.compatibilityDate ?? "2026-05-22",
      "--compatibility-flags",
      "nodejs_compat",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        CI: "1",
        NO_COLOR: "1",
        WRANGLER_SEND_METRICS: "false",
      },
    },
  );
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  try {
    const origin = `http://127.0.0.1:${port}`;
    if (options.readiness === "output") {
      await waitForProcessOutput(() => output.join(""), "Ready on", "Wrangler readiness output");
    } else {
      await waitForHttpServer(origin, () => output.join(""));
    }
    return await run(origin);
  } finally {
    await stopChildProcess(child);
  }
}

async function readBuiltServerModuleArtifact<T>(
  outDir: string,
  file: string,
): Promise<T | undefined> {
  const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
    serverModuleFiles?: Record<string, string>;
    serverModuleRenderFiles?: Record<string, string>;
    serverModuleRequestFiles?: Record<string, string>;
    serverModules?: Record<string, unknown>;
  };
  const artifactPath = manifest.serverModuleFiles?.[file];

  if (artifactPath !== undefined) {
    return await hydrateTestServerModuleArtifact<T>(
      outDir,
      JSON.parse(await readFile(join(outDir, "server", artifactPath), "utf8")),
    );
  }

  const requestArtifactPath = manifest.serverModuleRequestFiles?.[file];
  const renderArtifactPath = manifest.serverModuleRenderFiles?.[file];
  if (requestArtifactPath !== undefined || renderArtifactPath !== undefined) {
    const requestArtifact =
      requestArtifactPath === undefined
        ? {}
        : JSON.parse(await readFile(join(outDir, "server", requestArtifactPath), "utf8"));
    const renderArtifact =
      renderArtifactPath === undefined
        ? {}
        : JSON.parse(await readFile(join(outDir, "server", renderArtifactPath), "utf8"));

    return await hydrateTestServerModuleArtifact<T>(outDir, {
      ...requestArtifact,
      ...renderArtifact,
    });
  }

  return manifest.serverModules?.[file] as T | undefined;
}

async function hydrateTestServerModuleArtifact<T>(
  outDir: string,
  artifact: Record<string, unknown>,
): Promise<T> {
  for (const key of ["loader", "request", "routeMetadata", "stream", "string"]) {
    const output = artifact[key] as
      | { code?: string; moduleFile?: string }
      | undefined;
    if (
      output?.moduleFile !== undefined &&
      (output.code === undefined || output.code.length === 0)
    ) {
      output.code = await readFile(join(outDir, "server", output.moduleFile), "utf8");
    }
  }

  return artifact as T;
}

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
    };
    const pageArtifact = await readBuiltServerModuleArtifact<{
      string?: { code?: string; sourceHash?: string };
    }>(outDir, "page.mreact.tsx");
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
    expect(pageArtifact?.string?.code).toContain('_out += "<main";');
    expect(pageArtifact?.string?.code).not.toContain("<main>Hello");
    expect(pageArtifact?.string?.sourceHash).toMatch(/^[a-f0-9]{16}$/);
    expect(clientManifest.routes[0]?.client).toBe(false);
    expect(viteManifest).toEqual({});

    await expect(access(join(outDir, "server", "app", "page.mreact.tsx"))).rejects.toThrow();
  });

  test("reports opt-in build phase timings without writing them into artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-timings-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const timings: Array<{ ms: number; phase: string }> = [];
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Timed build</main>;
}`,
    );

    await buildApp({
      appDir,
      outDir,
      onBuildPhaseTiming(event: { ms: number; phase: string }) {
        timings.push(event);
      },
    });

    expect(timings.map((timing) => timing.phase)).toEqual(
      expect.arrayContaining([
        "scan",
        "collectFiles",
        "analyzeSources",
        "validate",
        "serverActionManifest",
        "serverModules",
        "importPolicy",
        "clientBundles",
        "prerender",
        "writeManifests",
      ]),
    );
    for (const timing of timings) {
      expect(Number.isFinite(timing.ms)).toBe(true);
      expect(timing.ms).toBeGreaterThanOrEqual(0);
    }
    expect(await readFile(join(outDir, "server", "manifest.json"), "utf8")).not.toContain(
      "buildPhase",
    );
  });

  test("build concurrency helper overlaps independent tasks while preserving input order", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await __mapWithBuildConcurrencyForTests(
      [30, 10, 20],
      async (delayMs, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        active -= 1;

        return `${index}:${delayMs}`;
      },
      2,
    );

    expect(maxActive).toBe(2);
    expect(results).toEqual(["0:30", "1:10", "2:20"]);
  });

  test("server module artifact writer externalizes modules with stable manifest entries", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-server-artifact-writer-"));
    const serverDir = join(rootDir, "server");

    const artifacts = await __writeServerModuleArtifactFilesForTests(serverDir, {
      "page.tsx": {
        analysis: {
          authIncludesClaims: false,
          clientBoundaryImports: [],
          clientRoute: false,
          hasLoader: true,
          routeCode: "export default function Page() {}",
          routePath: "/",
          sourceHash: "source-page",
          streamRoute: false,
          usesRuntimeCacheControl: false,
        },
        loader: {
          code: "export function loader() { return new Response('ok'); }",
          sourceHash: "loader-source",
        },
        string: {
          bundleCode: "export default function render() { return '<main>ok</main>'; }",
          code: "export default function render() {}",
          sourceHash: "render-source",
        },
      },
      "layout.tsx": {
        string: {
          bundleCode: "export default function layout() { return '<body></body>'; }",
          code: "export default function layout() {}",
          sourceHash: "layout-source",
        },
      },
    });

    expect(Object.keys(artifacts.requestFiles)).toEqual(["page.tsx"]);
    expect(Object.keys(artifacts.renderFiles)).toEqual(["page.tsx"]);
    expect(Object.keys(artifacts.files)).toEqual(["layout.tsx"]);
    await expect(access(join(serverDir, artifacts.requestFiles["page.tsx"] ?? ""))).resolves.toBeUndefined();
    await expect(access(join(serverDir, artifacts.renderFiles["page.tsx"] ?? ""))).resolves.toBeUndefined();
    await expect(access(join(serverDir, artifacts.files["layout.tsx"] ?? ""))).resolves.toBeUndefined();
  });

  test("batches Cloudflare loader wrapper modules into one Vite build", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-loader-batch-"));
    const appDir = join(rootDir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(appDir, "alpha.ts"), `export function loader() { return { route: "alpha" }; }`);
    await writeFile(join(appDir, "beta.ts"), `export function loader() { return { route: "beta" }; }`);

    const resolvedBuilds: string[] = [];
    const outputs = await __buildCloudflareRouteLoaderModuleBatchForTests({
      projectRoot: rootDir,
      routes: [
        { filename: join(appDir, "alpha.ts"), routeId: "alpha" },
        { filename: join(appDir, "beta.ts"), routeId: "beta" },
      ],
      vitePlugins: [
        {
          name: "mreact-test-count-cloudflare-loader-builds",
          configResolved() {
            resolvedBuilds.push("resolved");
          },
        },
      ],
    });

    expect(resolvedBuilds).toEqual(["resolved"]);
    expect(Object.keys(outputs)).toEqual(["alpha", "beta"]);
    expect(outputs.alpha).toContain("loader");
    expect(outputs.beta).toContain("loader");
  });

  test("batches compatible server request artifact modules into one Vite build", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-server-request-batch-"));
    const appDir = join(rootDir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(appDir, "alpha.ts"), `export function loader() { return { route: "alpha" }; }`);
    await writeFile(join(appDir, "beta.ts"), `export function loader() { return { route: "beta" }; }`);

    const resolvedBuilds: string[] = [];
    const outputs = await __bundleRouteRequestModuleBatchForTests({
      appDir,
      entries: [
        { code: `export { loader } from ${JSON.stringify(join(appDir, "alpha.ts"))};`, filename: join(appDir, "alpha.ts"), key: "alpha", label: "Loader" },
        { code: `export { loader } from ${JSON.stringify(join(appDir, "beta.ts"))};`, filename: join(appDir, "beta.ts"), key: "beta", label: "Loader" },
      ],
      vitePlugins: [
        {
          name: "mreact-test-count-server-request-builds",
          configResolved() {
            resolvedBuilds.push("resolved");
          },
        },
      ],
    });

    expect(resolvedBuilds).toEqual(["resolved"]);
    expect(Object.keys(outputs)).toEqual(["alpha", "beta"]);
    expect(outputs.alpha).toContain("loader");
    expect(outputs.beta).toContain("loader");
  });

  test("forwards Vite plugins with the project root in route sub-builds", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-vite-plugin-root-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    const roots: string[] = [];
    await mkdir(join(appDir, "users"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "users", "page.tsx"),
      `export function loader() {
  return { title: "Users" };
}

export default function Page(props) {
  return <main>{props.data.title}</main>;
}`,
    );

    await buildApp({
      projectRoot: rootDir,
      routesDir: appDir,
      outDir,
      viteConfig: {
        plugins: [
          {
            name: "mreact-test-record-sub-build-root",
            configResolved(config) {
              roots.push(config.root);
            },
          },
        ],
      },
    });

    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((root) => root === rootDir)).toBe(true);
  });

  test("writes a generated runtime import policy summary", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-import-policy-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "login"), { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({
        dependencies: {
          cookie: "1.0.0",
          jose: "1.0.0",
          pg: "1.0.0",
        },
      }),
    );
    await writeFakePackage(rootDir, "cookie", "export const parse = () => ({});\n");
    await writeFakePackage(rootDir, "jose", "export const jwtVerify = () => ({});\n");
    await writeFakePackage(rootDir, "pg", "export const Pool = class {};\n");
    await writeFile(
      join(appDir, "middleware.ts"),
      `import { jwtVerify } from "jose";

export function middleware() {
  void jwtVerify;
}
`,
    );
    await writeFile(
      join(appDir, "db.ts"),
      `import { Pool } from "pg";
export function getTitle() {
  void Pool;
  return "generated policy";
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { getTitle } from "./db";

export function loader() {
  return { title: getTitle() };
}

export default function Page(props) {
  return <main>{props.data.title}</main>;
}
`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `import { parse } from "cookie";

export function loader() {
  void parse;
  return {};
}

export default function Login() {
  return <main>login</main>;
}
`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["node"],
    });
    const policy = JSON.parse(await readFile(join(outDir, "server", "import-policy.json"), "utf8")) as {
      byRoute?: Record<string, string[]>;
      runtimePackages?: string[];
    };

    expect(policy.runtimePackages).toEqual(["cookie", "jose", "pg"]);
    expect(policy.byRoute?.["/"]).toEqual(["pg"]);
    expect(policy.byRoute?.["/login"]).toEqual(["cookie"]);
    expect(policy.byRoute?.["middleware"]).toEqual(["jose"]);

    const serverModuleCodeDir = join(outDir, "server", "server-modules", "code");
    const moduleFiles = await readdir(serverModuleCodeDir);
    const moduleCode = (
      await Promise.all(moduleFiles.map((file) => readFile(join(serverModuleCodeDir, file), "utf8")))
    ).join("\n");
    expect(moduleCode).toMatch(/(?:from|import) "pg"/u);
    expect(moduleCode).not.toContain("file://");
    expect(moduleCode).not.toContain("node_modules/pg");
  });

  test("tracks optional runtime packages declared by transitive server dependencies", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-import-policy-optional-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "db-client": "1.0.0",
        },
      }),
    );
    await writeFakePackageWithJson(rootDir, "native-driver", {
      exports: "./index.js",
      name: "native-driver",
      type: "module",
    }, "export const native = true;\n");
    await writeFakePackageWithJson(rootDir, "db-core", {
      exports: "./index.js",
      name: "db-core",
      optionalDependencies: {
        "native-driver": "1.0.0",
      },
      type: "module",
    }, "export const core = true;\n");
    await writeFakePackageWithJson(rootDir, "db-client", {
      dependencies: {
        "db-core": "1.0.0",
      },
      exports: "./index.js",
      name: "db-client",
      type: "module",
    }, "export const connect = () => undefined;\n");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { connect } from "db-client";

export function loader() {
  connect();
  return {};
}

export default function Page() {
  return <main>optional native</main>;
}
`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["node"],
    });
    const policy = JSON.parse(await readFile(join(outDir, "server", "import-policy.json"), "utf8")) as {
      byRoute?: Record<string, string[]>;
      runtimePackages?: string[];
    };

    expect(policy.runtimePackages).toEqual(["db-client", "native-driver"]);
    expect(policy.byRoute?.["/"]).toEqual(["db-client", "native-driver"]);
  });

  test("ignores invalid and missing transitive optional runtime packages", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-import-policy-optional-invalid-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "db-client": "1.0.0",
        },
      }),
    );
    await writeFakePackageWithJson(rootDir, "db-client", {
      exports: "./index.js",
      name: "db-client",
      optionalDependencies: {
        "../../tmp/payload": "1.0.0",
        "missing-native-driver": "1.0.0",
      },
      type: "module",
    }, "export const connect = () => undefined;\n");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { connect } from "db-client";

export function loader() {
  connect();
  return {};
}

export default function Page() {
  return <main>optional native</main>;
}
`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["node"],
    });
    const policy = JSON.parse(await readFile(join(outDir, "server", "import-policy.json"), "utf8")) as {
      byRoute?: Record<string, string[]>;
      runtimePackages?: string[];
    };

    expect(policy.runtimePackages).toEqual(["db-client"]);
    expect(policy.byRoute?.["/"]).toEqual(["db-client"]);
  });

  test("accepts valid TypeScript async generic arrows while collecting import policies", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-ts-generic-arrow-"));
    const appDir = join(rootDir, "src");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "api.ts"),
      `export const get = async <T>(path: string): Promise<T> => {
  throw new Error(path);
};
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { get } from "./api";

export async function loader() {
  void get;
  return {};
}

export default function Page() {
  return <main>ok</main>;
}
`,
    );

    await expect(
      buildApp({
        allowedSourceDirs: ["src"],
        outDir,
        projectRoot: rootDir,
        routesDir: "src",
        targets: ["cloudflare"],
      }),
    ).resolves.toMatchObject({ routes: [{ path: "/" }] });
  });

  test("builds Cloudflare metadata exports that import Node builtins", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-cloudflare-metadata-node-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { randomBytes } from "node:crypto";

export function generateMetadata() {
  return {
    title: randomBytes(4).toString("hex"),
  };
}

export default function Page() {
  return <main>metadata</main>;
}
`,
    );

    await expect(
      buildApp({
        allowedSourceDirs: ["app"],
        outDir,
        projectRoot: rootDir,
        routesDir: "app",
        targets: ["cloudflare"],
      }),
    ).resolves.toMatchObject({ routes: [{ path: "/" }] });
    await expect(access(join(outDir, "cloudflare", "route-modules.mjs"))).resolves.toBeUndefined();
  });

  test("emits first-class AWS Lambda and Cloudflare runtime entry artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-runtime-artifacts-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const lambdaOutDir = join(rootDir, ".lambda");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>artifact</main>; }",
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["aws-lambda", "cloudflare"],
    });
    const lambdaHandler = await readFile(join(outDir, "aws-lambda", "mreact-handler.mjs"), "utf8");
    const cloudflareWorker = await readFile(join(outDir, "cloudflare", "worker.mjs"), "utf8");
    const pagesOutDir = join(rootDir, ".pages");
    const packaged = await packageAwsLambdaArtifact({
      fromDir: outDir,
      outDir: lambdaOutDir,
      skipRuntimeDependencyCheck: true,
    });
    const pagesPackaged = await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const packageManifest = JSON.parse(
      await readFile(join(lambdaOutDir, "mreact-lambda-artifact.json"), "utf8"),
    ) as { totalBytes?: number };

    expect(lambdaHandler).toContain("createPreloadedAwsLambdaRequestHandler");
    expect(lambdaHandler).toContain('importPolicy: "generated"');
    expect(lambdaHandler).toContain('outDir: resolve(here, "..")');
    expect(lambdaHandler).toContain('preload: { mode: "all" }');
    expect(cloudflareWorker).toContain("createCloudflareBuiltRequestHandler");
    expect(cloudflareWorker).toContain("createCloudflareStaticAssetLoader");
    expect(packaged.totalBytes).toBeGreaterThan(0);
    expect(packageManifest.totalBytes).toBe(packaged.totalBytes);
    expect(pagesPackaged.totalBytes).toBeGreaterThan(0);
    expect(pagesPackaged.worker).toBe("_worker.js");
    await expect(access(join(lambdaOutDir, ".mreact", "server", "manifest.json"))).resolves.toBeUndefined();
    await expect(access(join(lambdaOutDir, "mreact-handler.mjs"))).resolves.toBeUndefined();
    await expect(readFile(join(lambdaOutDir, "mreact-handler.mjs"), "utf8")).resolves.toContain(
      'outDir: resolve(here, ".mreact")',
    );
    await expect(access(join(lambdaOutDir, "package.json"))).resolves.toBeUndefined();
    await expect(access(join(pagesOutDir, "_worker.js"))).resolves.toBeUndefined();
    await expect(access(join(pagesOutDir, "_mreact", "client", "manifest.json"))).resolves.toBeUndefined();
    await expect(access(join(pagesOutDir, "mreact-cloudflare-pages-artifact.json"))).resolves.toBeUndefined();
    const pagesWorker = await readFile(join(pagesOutDir, "_worker.js"), "utf8");
    expect(pagesWorker).toContain("export");
    expect(pagesWorker).toContain("default");
    expect(pagesWorker).not.toContain("document.");
    await expect(readFile(join(pagesOutDir, "_worker.js"), "utf8")).resolves.not.toContain(
      "@reckona/mreact-router/adapters/cloudflare",
    );
  });

  test("excludes colocated test files from Cloudflare worker manifests and Pages packaging", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-test-source-exclusion-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>Cloudflare production</main>; }",
    );
    await writeFile(
      join(appDir, "page.test.ts"),
      `import { describe, expect, it } from "vitest";

describe("route unit test", () => {
  it("does not belong in production", () => {
    expect("Cloudflare production").toContain("production");
  });
});
`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });
    const worker = await readFile(join(outDir, "cloudflare", "worker.mjs"), "utf8");
    const pagesPackaged = await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });

    expect(worker).not.toContain("page.test.ts");
    expect(worker).not.toContain("vitest");
    expect(worker).not.toContain("expect(");
    expect(pagesPackaged.worker).toBe("_worker.js");
    await expect(access(join(pagesOutDir, "_worker.js"))).resolves.toBeUndefined();
  });

  test("packages Cloudflare Pages workers whose runtime dependencies import util", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-node-util-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { "fixture-protobuf-runtime": "1.0.0" } }),
    );
    await writeFakePackage(
      rootDir,
      "fixture-protobuf-runtime",
      `import { inspect, TextEncoder as UtilTextEncoder } from "util";

export function formatProtoValue(value) {
  return inspect({ value, encoded: new UtilTextEncoder().encode("proto").byteLength });
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { formatProtoValue } from "fixture-protobuf-runtime";

export default function Page() {
  return <main>{formatProtoValue("cloudflare")}</main>;
}`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });
    const pagesPackaged = await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });

    expect(pagesPackaged.worker).toBe("_worker.js");
    await expect(access(join(pagesOutDir, "_worker.js"))).resolves.toBeUndefined();
    await expect(readFile(join(pagesOutDir, "_worker.js"), "utf8")).resolves.toContain("node:util");
  });

  test("packaged Cloudflare Pages worker renders multiple routes that share a component graph", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-shared-routes-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "signup"), { recursive: true });
    await mkdir(join(rootDir, "lib"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(rootDir, "lib", "auth-layout.tsx"),
      `export function AuthLayout(props: { title: string }) {
  return <section><h1>{props.title}</h1><button>Continue with Google</button></section>;
}`,
    );
    await writeFile(
      join(rootDir, "lib", "auth-page.tsx"),
      `import { AuthLayout } from "./auth-layout";

export default function Page() {
  return <AuthLayout title="Shared auth" />;
}`,
    );
    const pageSource = `export { default } from "../../lib/auth-page";`;
    await writeFile(join(appDir, "login", "page.tsx"), pageSource);
    await writeFile(join(appDir, "signup", "page.tsx"), pageSource);

    await buildApp({
      allowedSourceDirs: ["app", "lib"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    const login = await worker.default.fetch(
      new Request("https://app.example/login"),
      {},
      createExecutionContext(),
    );
    const signup = await worker.default.fetch(
      new Request("https://app.example/signup"),
      {},
      createExecutionContext(),
    );

    expect(login.status).toBe(200);
    expect(await login.text()).toContain("Shared auth");
    expect(signup.status).toBe(200);
    expect(await signup.text()).toContain("Shared auth");
  });

  test("packaged Cloudflare Pages worker emits the route-level client hydration contract", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-client-route-contract-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "login"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

export function loader() {
  return { intent: "login" };
}

export default function Login(props: { data: { intent: string } }) {
  const clicks = cell(0);
  return <main><h1>{props.data.intent}</h1><button type="button" onClick={() => clicks.set((value) => value + 1)}>clicks: {clicks}</button></main>;
}`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ path: string; script?: string }> };
    const loginScript = clientManifest.routes.find((route) => route.path === "/login")?.script;
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    const response = await worker.default.fetch(
      new Request("https://app.example/login"),
      {},
      createExecutionContext(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(loginScript).toMatch(/^assets\/routes\/login\.[a-f0-9]{8}\.js$/);
    expect(html).toContain('data-mreact-route-id="login"');
    expect(html).toContain('<script type="application/json" id="mreact-props-login">');
    expect(html).toContain(`"url":"https://app.example/login"`);
    expect(html).toContain(`"intent":"login"`);
    expect(html).toContain(`<link rel="modulepreload" href="/_mreact/client/${loginScript}">`);
    expect(html).toContain(`<script type="module" src="/_mreact/client/${loginScript}"></script>`);
  });

  test("packaged Cloudflare Pages worker applies Vite define values used by server modules", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-vite-define-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "api", "config"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "page.tsx"),
      `declare const __MREACT_TEST_DEFINE__: string;

export function loader() {
  return {
    apiBase: import.meta.env.SSR_API_BASE_URL,
    plain: __MREACT_TEST_DEFINE__,
  };
}

export default function Page(props: { data: { apiBase: string; plain: string } }) {
  return <main>{props.data.apiBase}::{props.data.plain}</main>;
}`,
    );
    await writeFile(
      join(appDir, "api", "config", "route.ts"),
      `declare const __MREACT_TEST_ROUTE_DEFINE__: string;

export function GET() {
  return Response.json({ value: __MREACT_TEST_ROUTE_DEFINE__ });
}`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
      viteConfig: {
        define: {
          "import.meta.env.SSR_API_BASE_URL": JSON.stringify("https://api.example.invalid"),
          __MREACT_TEST_DEFINE__: JSON.stringify("plain-define-value"),
          __MREACT_TEST_ROUTE_DEFINE__: JSON.stringify("route-define-value"),
        },
      },
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const workerSource = await readFile(join(pagesOutDir, "_worker.js"), "utf8");
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    const page = await worker.default.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );
    const route = await worker.default.fetch(
      new Request("https://app.example/api/config"),
      {},
      createExecutionContext(),
    );

    expect(workerSource).toContain("https://api.example.invalid");
    expect(workerSource).toContain("plain-define-value");
    expect(workerSource).toContain("route-define-value");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("https://api.example.invalid::plain-define-value");
    expect(route.status).toBe(200);
    await expect(route.json()).resolves.toEqual({ value: "route-define-value" });
  });

  test("writes generated client assets for Cloudflare Pages asset allowlists", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-recursive-imports-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "brand"), { recursive: true });
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "signup"), { recursive: true });
    await mkdir(join(appDir, "shared"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "shared", "BrandLogo.tsx"),
      `export function BrandLogo() {
  return <strong>BrandMark</strong>;
}`,
    );
    await writeFile(
      join(appDir, "shared", "AuthLayout.tsx"),
      `import { BrandLogo } from "./BrandLogo";

export function AuthLayout(props: { children: unknown }) {
  return <section><BrandLogo />{props.children}</section>;
}`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { AuthLayout } from "../shared/AuthLayout";

export default function Login() {
  const count = cell(0);
  return <AuthLayout><button type="button" onClick={() => count.set((value) => value + 1)}>Login {count}</button></AuthLayout>;
}`,
    );
    await writeFile(
      join(appDir, "signup", "page.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { AuthLayout } from "../shared/AuthLayout";

export default function Signup() {
  const count = cell(0);
  return <AuthLayout><button type="button" onClick={() => count.set((value) => value + 1)}>Signup {count}</button></AuthLayout>;
}`,
    );
    await writeFile(
      join(appDir, "brand", "page.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { BrandLogo } from "../shared/BrandLogo";

export default function Brand() {
  const count = cell(0);
  return <main><BrandLogo /><button type="button" onClick={() => count.set((value) => value + 1)}>Brand {count}</button></main>;
}`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { assets?: string[] };
    const chunkAssets = (await readdir(join(outDir, "client", "assets", "chunks")))
      .filter((file) => file.endsWith(".js"))
      .map((file) => `assets/chunks/${file}`)
      .sort();

    expect(chunkAssets.length).toBeGreaterThan(0);
    expect(clientManifest.assets).toEqual(expect.arrayContaining(chunkAssets));
  });

  test("packaged Cloudflare Pages worker renders sibling routes that share a nested layout but differ in page component and loader", async () => {
    // Regression for docs/issues/open/2026-06-01-194: two routes that share the
    // same nested layout (AuthLayout) while exporting *different* page `default`s.
    // The reporter suspected the page-component registry keyed on the shared
    // App/slots identity and dropped one route; this locks in that both render.
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-shared-nested-layout-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "auth", "login"), { recursive: true });
    await mkdir(join(appDir, "auth", "signup"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "auth", "layout.tsx"),
      `export default function AuthLayout() {
  return <section class="auth"><h1>Account</h1><Slot /><button>Continue with Google</button></section>;
}`,
    );
    await writeFile(
      join(appDir, "auth", "login", "page.tsx"),
      `export function loader() { return { kind: "login" }; }
export default function LoginPage(props: { data: { kind: string } }) {
  return <form data-kind={props.data.kind}><input name="email" /><button>Log in</button></form>;
}`,
    );
    await writeFile(
      join(appDir, "auth", "signup", "page.tsx"),
      `export default function SignupPage() {
  return <form><input name="email" /><input name="password" /><button>Sign up</button></form>;
}`,
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    const login = await worker.default.fetch(
      new Request("https://app.example/auth/login"),
      {},
      createExecutionContext(),
    );
    const signup = await worker.default.fetch(
      new Request("https://app.example/auth/signup"),
      {},
      createExecutionContext(),
    );
    const loginText = await login.text();
    const signupText = await signup.text();

    expect(login.status).toBe(200);
    expect(loginText).toContain("Log in");
    expect(loginText).toContain('data-kind="login"');
    expect(signup.status).toBe(200);
    expect(signupText).toContain("Sign up");
    // Both routes share the AuthLayout shell, so each must still render it.
    expect(loginText).toContain("Continue with Google");
    expect(signupText).toContain("Continue with Google");
  });

  test("packaged Cloudflare Pages worker renders sibling routes that directly call a shared auth shell", async () => {
    // Regression for docs/issues/open/2026-06-01-195: the app's auth pages call a
    // shared AuthShell function directly. The packaged worker must resolve the
    // page component by route path even when bundling gives both route modules
    // the same App/slots identities from the shared shell graph.
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-direct-auth-shell-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "_shared"), { recursive: true });
    await mkdir(join(appDir, "alpha"), { recursive: true });
    await mkdir(join(appDir, "beta"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "_shared", "AuthShell.tsx"),
      `export function AuthShell(props: { children?: unknown }) {
  return <div class="auth-shell">{props.children}</div>;
}`,
    );
    await writeFile(
      join(appDir, "alpha", "page.tsx"),
      `import { AuthShell } from "../_shared/AuthShell";
export default function AlphaPage() {
  return AuthShell({ children: "alpha" });
}`,
    );
    await writeFile(
      join(appDir, "beta", "page.tsx"),
      `import { AuthShell } from "../_shared/AuthShell";
export default function BetaPage() {
  return AuthShell({ children: "beta" });
}`,
    );

    await buildApp({
      allowedSourceDirs: ["src"],
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    const alpha = await worker.default.fetch(
      new Request("https://app.example/alpha"),
      {},
      createExecutionContext(),
    );
    const beta = await worker.default.fetch(
      new Request("https://app.example/beta"),
      {},
      createExecutionContext(),
    );
    const alphaText = await alpha.text();
    const betaText = await beta.text();

    expect(alpha.status).toBe(200);
    expect(alphaText).toContain("alpha");
    expect(alphaText).toContain("auth-shell");
    expect(beta.status).toBe(200);
    expect(betaText).toContain("beta");
    expect(betaText).toContain("auth-shell");
  });

  test("packaged Cloudflare Pages worker renders direct shared auth shell routes with a client island", async () => {
    // Regression for docs/issues/open/2026-06-01-196: rendering a client
    // island from the shared shell makes generated Cloudflare route modules
    // re-export default/App/slots as accessors. The packaged worker must still
    // resolve each route's own default page component by source path.
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-pages-client-island-auth-shell-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "_shared"), { recursive: true });
    await mkdir(join(appDir, "alpha"), { recursive: true });
    await mkdir(join(appDir, "beta"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "_shared", "Banner.tsx"),
      `"use client";
export function Banner() {
  return <div data-banner="x">banner</div>;
}`,
    );
    await writeFile(
      join(appDir, "_shared", "AuthShell.tsx"),
      `import { Banner } from "./Banner";

export function AuthShell(props: { children?: unknown }) {
  return <div class="auth-shell">{props.children}<Banner /></div>;
}`,
    );
    await writeFile(
      join(appDir, "alpha", "page.tsx"),
      `import { AuthShell } from "../_shared/AuthShell";
export default function AlphaPage() {
  return AuthShell({ children: "alpha" });
}`,
    );
    await writeFile(
      join(appDir, "beta", "page.tsx"),
      `import { AuthShell } from "../_shared/AuthShell";
export default function BetaPage() {
  return AuthShell({ children: "beta" });
}`,
    );

    await buildApp({
      allowedSourceDirs: ["src"],
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    const alpha = await worker.default.fetch(
      new Request("https://app.example/alpha"),
      {},
      createExecutionContext(),
    );
    const beta = await worker.default.fetch(
      new Request("https://app.example/beta"),
      {},
      createExecutionContext(),
    );
    const alphaText = await alpha.text();
    const betaText = await beta.text();

    expect(alpha.status).toBe(200);
    expect(alphaText).toContain("alpha");
    expect(alphaText).toContain("auth-shell");
    expect(alphaText).toContain('data-mreact-client-boundary="Banner"');
    expect(beta.status).toBe(200);
    expect(betaText).toContain("beta");
    expect(betaText).toContain("auth-shell");
    expect(betaText).toContain('data-mreact-client-boundary="Banner"');
  });

  test("Cloudflare page route facades wrap extracted shared component exports per route", async () => {
    // Regression for docs/issues/open/2026-06-01-197: when many routes import
    // the same extracted shared shell chunk, a bare re-export facade can expose
    // identical default/App/slots identities for multiple routes. Each route
    // facade must create a route-local page component wrapper.
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-extracted-shell-facade-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "_shared"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "_shared", "Island.tsx"),
      `"use client";
export function Island() {
  return <span data-island="x">island</span>;
}`,
    );
    const markers = Array.from({ length: 80 }, (_, index) => `const marker${index} = "marker-${index}";`).join("\n");
    const markerSpans = Array.from(
      { length: 80 },
      (_, index) => `<span data-marker${index}={marker${index}}></span>`,
    ).join("");
    await writeFile(
      join(appDir, "_shared", "BigShell.tsx"),
      `import { Island } from "./Island";
${markers}
export function BigShell(props: { children?: unknown }) {
  return <div class="big-shell">{props.children}${markerSpans}<Island /></div>;
}`,
    );
    const routeNames = [
      "zalpha",
      "zbeta",
      "zgamma",
      "zdelta",
      "zepsilon",
      "zzeta",
      "zeta",
      "ztheta",
      "ziota",
    ];

    for (const routeName of routeNames) {
      await mkdir(join(appDir, routeName), { recursive: true });
      await writeFile(
        join(appDir, routeName, "page.tsx"),
        `import { BigShell } from "../_shared/BigShell";
export default function Page() {
  return BigShell({ children: ${JSON.stringify(routeName)} });
}`,
      );
    }

    await buildApp({
      allowedSourceDirs: ["src"],
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
    });

    const routeSources = await Promise.all(
      routeNames.map(async (routeName) => [
        routeName,
        await readFile(join(outDir, "cloudflare", "routes", `${routeName}.mjs`), "utf8"),
      ] as const),
    );
    const routeFiles = await readdir(join(outDir, "cloudflare", "routes"));
    const stringRouteSources = await Promise.all(
      routeNames.map(async (routeName) => {
        const stringRouteFile = routeFiles.find((file) => file.startsWith(`${routeName}.string.`));
        expect(stringRouteFile, routeName).toBeDefined();
        return [
          routeName,
          await readFile(join(outDir, "cloudflare", "routes", stringRouteFile as string), "utf8"),
        ] as const;
      }),
    );
    const chunkFiles = await readdir(join(outDir, "cloudflare", "routes", "chunks"));

    expect(chunkFiles.some((file) => file.includes("layout.") || file.includes("BigShell."))).toBe(true);
    for (const [routeName, source] of routeSources) {
      expect(source, routeName).not.toContain("export { default, App, slots }");
      expect(source, routeName).not.toContain("default as componentDefault");
      expect(source, routeName).not.toContain("App as componentApp");
      expect(source, routeName).not.toContain("export const App =");
      expect(source, routeName).toContain("import * as componentModule");
      expect(source, routeName).toContain("function resolveCloudflareRouteComponent");
      expect(source, routeName).toContain("function CloudflareRouteComponent");
      expect(source.indexOf("function resolveCloudflareRouteComponent"), routeName).toBeLessThan(
        source.indexOf("const componentDefault = readComponentModuleExport"),
      );
    }
    for (const [routeName, source] of stringRouteSources) {
      const appLocalName = localNameForMinifiedExport(source, "App");
      const defaultLocalName = localNameForMinifiedExport(source, "default");

      expect(appLocalName, routeName).toBeUndefined();
      expect(defaultLocalName, routeName).toBeDefined();
      expect(minifiedExportClause(source), routeName).not.toMatch(
        /\b([\w$]+)\s+as\s+App\s*,\s*\1\s+as\s+default\b|\b([\w$]+)\s+as\s+default\s*,\s*\2\s+as\s+App\b/,
      );
    }

    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });
    const workerSource = await readFile(join(pagesOutDir, "_worker.js"), "utf8");
    const worker = await import(pathToFileURL(join(pagesOutDir, "_worker.js")).href) as {
      default: {
        fetch: (request: Request, env: unknown, context: ExecutionContext) => Promise<Response>;
      };
    };

    expect(workerSource).toContain("CloudflareRouteComponent");
    for (const routeName of routeNames) {
      const response = await worker.default.fetch(
        new Request(`https://app.example/${routeName}`),
        {},
        createExecutionContext(),
      );
      const text = await response.text();

      expect(response.status, routeName).toBe(200);
      expect(text, routeName).toContain(routeName);
      expect(text, routeName).toContain("big-shell");
    }
  });

  test("packaged Cloudflare Pages worker serves extracted auth shell routes under workerd", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-workerd-auth-shell-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "_shared"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "_shared", "Island.tsx"),
      `"use client";
export function Island() {
  return <span data-island="auth">island</span>;
}`,
    );
    const markers = Array.from({ length: 80 }, (_, index) => `const marker${index} = "marker-${index}";`).join("\n");
    const markerSpans = Array.from(
      { length: 80 },
      (_, index) => `<span data-marker${index}={marker${index}}></span>`,
    ).join("");
    await writeFile(
      join(appDir, "_shared", "AuthLayout.tsx"),
      `import { Island } from "./Island";
${markers}
export function AuthLayout(props: { children?: unknown }) {
  return <section class="auth-layout">{props.children}${markerSpans}<Island /></section>;
}`,
    );
    const routeNames = [
      "login",
      "signup",
      "reset-password",
      "verify-email",
      "mfa-challenge",
      "settings",
      "profile",
      "billing",
      "security",
    ];

    for (const routeName of routeNames) {
      await mkdir(join(appDir, routeName), { recursive: true });
      await writeFile(
        join(appDir, routeName, "page.tsx"),
        `import { AuthLayout } from "../_shared/AuthLayout";
export default function Page() {
  return AuthLayout({ children: ${JSON.stringify(routeName)} });
}`,
      );
    }

    await buildApp({
      allowedSourceDirs: ["src"],
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });

    await withWranglerPagesDev(pagesOutDir, async (origin) => {
      for (const routeName of routeNames) {
        const response = await fetch(`${origin}/${routeName}`);
        const text = await response.text();

        expect(response.status, `${routeName}: ${text}`).toBe(200);
        expect(text, routeName).toContain(routeName);
        expect(text, routeName).toContain("auth-layout");
      }
    });
  }, 40_000);

  test("packaged Cloudflare Pages worker redirects root page on first route request with extracted shared shell under workerd", async () => {
    // Regression for docs/issues/2026-06-01-203: after the auth sibling
    // route accessors were fixed, the packaged worker still exposed the root
    // page component as accessors that resolved to undefined before its loader
    // could redirect.
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-workerd-root-accessors-"));
    const appDir = join(rootDir, "src", "app");
    const libDir = join(rootDir, "src", "lib");
    const outDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(appDir, "_shared"), { recursive: true });
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "signup"), { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(libDir, "legacy-label.cjs"),
      `module.exports = function legacyLabel() {
  return "legacy";
};`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "_shared", "Island.tsx"),
      `"use client";
export function Island() {
  return <span data-island="root">island</span>;
}`,
    );
    const markers = Array.from({ length: 120 }, (_, index) => `const marker${index} = "marker-${index}";`).join("\n");
    const markerSpans = Array.from(
      { length: 120 },
      (_, index) => `<span data-marker${index}={marker${index}}></span>`,
    ).join("");
    await writeFile(
      join(appDir, "_shared", "ProtectedShell.tsx"),
      `import { Island } from "./Island";
${markers}
export function ProtectedShell(props: { children?: unknown }) {
  return <main class="protected-shell">{props.children}${markerSpans}<Island /></main>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import legacyLabel from "../lib/legacy-label.cjs";
import { ProtectedShell } from "./_shared/ProtectedShell";

export function loader() {
  throw new Response(null, { status: 303, headers: { location: "/login" } });
}

export default function RootPage() {
  return ProtectedShell({ children: "root dashboard " + legacyLabel() });
}`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `import { ProtectedShell } from "../_shared/ProtectedShell";
export default function LoginPage() {
  return ProtectedShell({ children: "login" });
}`,
    );
    await writeFile(
      join(appDir, "signup", "page.tsx"),
      `import { ProtectedShell } from "../_shared/ProtectedShell";
export default function SignupPage() {
  return ProtectedShell({ children: "signup" });
}`,
    );

    await buildApp({
      allowedSourceDirs: ["src"],
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
    });
    await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesOutDir });

    await withWranglerPagesDev(pagesOutDir, async (origin) => {
      const root = await fetch(`${origin}/`, { redirect: "manual" });
      const login = await fetch(`${origin}/login`);
      const signup = await fetch(`${origin}/signup`);

      expect(root.status, await root.text()).toBe(303);
      expect(root.headers.get("location")).toBe("/login");
      expect(login.status, await login.text()).toBe(200);
      expect(signup.status, await signup.text()).toBe(200);
    }, { compatibilityDate: "2024-11-01", readiness: "output" });
  }, 40_000);

  test("packaged Cloudflare Pages worker shims createRequire import meta URL under workerd", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-workerd-create-require-"));
    const fromDir = join(rootDir, ".mreact");
    const pagesOutDir = join(rootDir, ".pages");
    await mkdir(join(fromDir, "client"), { recursive: true });
    await mkdir(join(fromDir, "cloudflare"), { recursive: true });
    await writeFile(join(fromDir, "client", "manifest.json"), JSON.stringify({ publicAssets: [] }));
    await writeFile(join(fromDir, "cloudflare", "route-modules.mjs"), "export const routeModules = {};\n");
    await writeFile(
      join(fromDir, "cloudflare", "worker.mjs"),
      `import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default {
  fetch() {
    return new Response(typeof require);
  },
};
`,
    );

    await packageCloudflarePagesArtifact({ fromDir, outDir: pagesOutDir });

    await withWranglerPagesDev(pagesOutDir, async (origin) => {
      const response = await fetch(`${origin}/`);
      const text = await response.text();

      expect(response.status, text).toBe(200);
      expect(text).toBe("function");
    }, { compatibilityDate: "2024-11-01", readiness: "output" });
  }, 40_000);

  test("deduplicates Cloudflare page dynamic import dependencies shared by multiple routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-shared-dynamic-import-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "signup"), { recursive: true });
    await mkdir(join(rootDir, "lib"), { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: {} }),
    );
    await writeFile(
      join(rootDir, "lib", "browser-service.ts"),
      `export async function loadBrowserSdk() {
  return await import("./shared-sdk");
}`,
    );
    await writeFile(
      join(rootDir, "lib", "shared-sdk.ts"),
      `export const marker = "MREACT_SHARED_BROWSER_SDK_MARKER";`,
    );
    const pageSource = `import { loadBrowserSdk } from "../../lib/browser-service";

export default function Page() {
  return <main>{String(loadBrowserSdk).includes("shared-sdk") ? "Load SDK" : "Load SDK"}</main>;
}`;
    await writeFile(join(appDir, "login", "page.tsx"), pageSource);
    await writeFile(join(appDir, "signup", "page.tsx"), pageSource);

    await buildApp({
      allowedSourceDirs: ["app", "lib"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });

    const routeFiles = await readdir(join(outDir, "cloudflare", "routes"), { recursive: true });
    const routeSources = await Promise.all(
      routeFiles
        .filter((file): file is string => typeof file === "string" && file.endsWith(".mjs"))
        .map(async (file) => await readFile(join(outDir, "cloudflare", "routes", file), "utf8")),
    );
    const markerOccurrences = routeSources.reduce(
      (count, source) => count + source.split("MREACT_SHARED_BROWSER_SDK_MARKER").length - 1,
      0,
    );

    expect(markerOccurrences).toBe(1);
  });

  test("deduplicates Cloudflare shell route dynamic import dependencies reached through shared static modules", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-shared-static-wrapper-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "signup"), { recursive: true });
    await mkdir(join(rootDir, "lib"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(rootDir, "lib", "browser-service.ts"),
      `export async function loadBrowserSdk() {
  return await import("./shared-sdk");
}`,
    );
    await writeFile(
      join(rootDir, "lib", "shared-sdk.ts"),
      `export const marker = "MREACT_SHARED_STATIC_WRAPPER_SDK_MARKER";`,
    );
    const pageSource = `import { loadBrowserSdk } from "../../lib/browser-service";

export default function Page() {
  return <main>{String(loadBrowserSdk).includes("shared-sdk") ? "Load SDK" : "Load SDK"}</main>;
}`;
    await writeFile(join(appDir, "login", "page.tsx"), pageSource);
    await writeFile(join(appDir, "signup", "page.tsx"), pageSource);

    await buildApp({
      allowedSourceDirs: ["app", "lib"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["cloudflare"],
    });

    const routeFiles = await readdir(join(outDir, "cloudflare", "routes"), { recursive: true });
    const routeSources = await Promise.all(
      routeFiles
        .filter((file): file is string => typeof file === "string" && file.endsWith(".mjs"))
        .map(async (file) => await readFile(join(outDir, "cloudflare", "routes", file), "utf8")),
    );
    const markerOccurrences = routeSources.reduce(
      (count, source) =>
        count + source.split("MREACT_SHARED_STATIC_WRAPPER_SDK_MARKER").length - 1,
      0,
    );

    expect(markerOccurrences).toBe(1);
  });

  test("rejects AWS Lambda packages without runtime node_modules unless explicitly skipped", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-lambda-runtime-deps-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const lambdaOutDir = join(rootDir, ".lambda");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { "@reckona/mreact-router": "0.0.91" } }),
    );
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>lambda</main>; }",
    );

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["aws-lambda"],
    });

    await expect(packageAwsLambdaArtifact({ fromDir: outDir, outDir: lambdaOutDir })).rejects.toThrow(
      /AWS Lambda artifact is missing production runtime dependencies/,
    );
    await expect(
      packageAwsLambdaArtifact({
        fromDir: outDir,
        outDir: lambdaOutDir,
        skipRuntimeDependencyCheck: true,
      }),
    ).resolves.toMatchObject({ runtime: "aws-lambda" });
  });

  test("packages a bundled AWS Lambda custom handler with app-local server imports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-lambda-custom-handler-"));
    const outDir = join(rootDir, ".mreact");
    const packageDir = join(rootDir, ".lambda");
    await mkdir(join(outDir, "server"), { recursive: true });
    await mkdir(join(outDir, "client"), { recursive: true });
    await mkdir(join(rootDir, "lambda"), { recursive: true });
    await mkdir(join(rootDir, "src", "server"), { recursive: true });
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ dependencies: {} }));
    await writeFile(join(outDir, "server", "manifest.json"), JSON.stringify({ routes: [] }));
    await writeFile(
      join(outDir, "server", "import-policy.json"),
      JSON.stringify({ byRoute: {}, runtimePackages: [], version: 1 }),
    );
    await writeFile(join(outDir, "client", "manifest.json"), JSON.stringify({ routes: [] }));
    await writeFile(
      join(rootDir, "src", "server", "policy.ts"),
      `export const policyMarker = "__custom_authorize_policy__";`,
    );
    await writeFile(
      join(rootDir, "src", "server", "authorize.ts"),
      `import { policyMarker } from "./policy";

export function authorize() {
  return policyMarker;
}`,
    );
    const handlerEntry = join(rootDir, "lambda", "mreact-handler.ts");
    await writeFile(
      handlerEntry,
      `import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";
import { authorize } from "../src/server/authorize";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: ".mreact",
  serverActions: { authorize },
});
`,
    );

    const manifest = await packageAwsLambdaArtifact({
      fromDir: outDir,
      handlerEntry,
      outDir: packageDir,
      skipRuntimeDependencyCheck: true,
    });
    const bundled = await readFile(join(packageDir, "mreact-handler.mjs"), "utf8");

    expect(manifest.files.some((file) => file.path === "mreact-handler.mjs")).toBe(true);
    expect(bundled).toContain("__custom_authorize_policy__");
    expect(bundled).toContain("@reckona/mreact-router/adapters/aws-lambda");
    expect(bundled).not.toContain("../src/server/authorize");
  });

  test("writes public asset paths into the client manifest for Cloudflare asset loaders", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-public-assets-"));
    const appDir = join(rootDir, "app");
    const publicDir = join(rootDir, "public");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(publicDir, "icons"), { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Hello</main>; }",
    );
    await writeFile(join(publicDir, "styles.css"), "body { color: black; }");
    await writeFile(join(publicDir, "robots.txt"), "User-agent: *");
    await writeFile(join(publicDir, "icons", "logo.svg"), "<svg></svg>");

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      publicDir: "public",
      routesDir: "app",
    });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { publicAssets?: string[] };

    expect(clientManifest.publicAssets).toEqual([
      "/icons/logo.svg",
      "/robots.txt",
      "/styles.css",
    ]);
    await expect(readFile(join(outDir, "client", "styles.css"), "utf8")).resolves.toContain(
      "color: black",
    );
  });

  test("copies root file convention assets into built public assets", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-file-conventions-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>File convention build</main>; }",
    );
    await writeFile(join(appDir, "robots.txt"), "User-agent: *\n");
    await writeFile(join(appDir, "manifest.webmanifest"), '{"name":"built"}');
    await writeFile(join(appDir, "icon.png"), new Uint8Array([137, 80, 78, 71]));

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { publicAssets?: string[] };
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { files?: Record<string, string> };

    expect(clientManifest.publicAssets).toEqual([
      "/icon",
      "/manifest.webmanifest",
      "/robots.txt",
    ]);
    await expect(readFile(join(outDir, "client", "robots.txt"), "utf8")).resolves.toBe(
      "User-agent: *\n",
    );
    await expect(readFile(join(outDir, "client", "icon"))).resolves.toHaveProperty(
      "byteLength",
      4,
    );
    expect(Object.keys(serverManifest.files ?? {})).not.toContain("app/icon.png");
  });

  test("prerendered loaders honor project import policy", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-prerender-import-policy-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "lib"), { recursive: true });
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { "fixture-content": "1.0.0" } }),
    );
    await writeFakePackage(rootDir, "fixture-content", "export const title = 'Policy OK';\n");
    await writeFile(
      join(rootDir, "src", "lib", "content.ts"),
      `import { title } from "fixture-content";
export function loadTitle() {
  return title;
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { loadTitle } from "../lib/content";

export const prerender = true;

export function loader() {
  return { title: loadTitle() };
}

export default function Page(props) {
  return <main>{props.data.title}</main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
    });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as {
      prerenderedRoutes?: Record<string, { html: string; status: number }>;
    };

    expect(serverManifest.prerenderedRoutes?.["/"]?.status).toBe(200);
    expect(serverManifest.prerenderedRoutes?.["/"]?.html).toContain("<main>Policy OK</main>");
  });

  test("build forwards user Vite plugins to route bundles", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "post.fixture"), "title: Plugin OK");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { title } from "../content/post.fixture";

export default function Page() {
  return <main>{title}</main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-content-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export const title = ${JSON.stringify(value.trim())};`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const serverManifest = await readFile(join(outDir, "server", "manifest.json"), "utf8");

    expect(serverManifest).toContain("src/app/page.tsx");
  });

  test("build forwards user Vite plugins to middleware request artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-middleware-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "message.fixture"), "message: Middleware OK");
    await writeFile(
      join(appDir, "middleware.ts"),
      `import { message } from "../content/message.fixture";

export function middleware() {
  return new Response(message);
}
`,
    );
    await writeFile(join(appDir, "page.tsx"), "export default function Page() { return <main />; }");

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-middleware-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export const message = ${JSON.stringify(value.trim())};`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const serverManifest = await readFile(join(outDir, "server", "manifest.json"), "utf8");

    expect(serverManifest).toContain("src/app/middleware.ts");
  });

  test("build forwards user Vite plugins to server route request artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-server-route-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api"), { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "message.fixture"), "message: Server Route OK");
    await writeFile(join(appDir, "page.tsx"), "export default function Page() { return <main />; }");
    await writeFile(
      join(appDir, "api", "route.ts"),
      `import { message } from "../../content/message.fixture";

export function GET() {
  return new Response(message);
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-server-route-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export const message = ${JSON.stringify(value.trim())};`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const serverManifest = await readFile(join(outDir, "server", "manifest.json"), "utf8");

    expect(serverManifest).toContain("src/app/api/route.ts");
  });

  test("build forwards user Vite plugins to prebundled server component artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-server-component-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "post.fixture"), "title: Plugin OK");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Post } from "../content/post.fixture";

export default function Page() {
  return <main><Post /></main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-component-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export function Post() { return ${JSON.stringify(value.trim())}; }`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(await response.text()).toContain("<main>Plugin OK</main>");
  });

  test("build infers client routes from plugin-transformed non-JS page imports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-mdx-plugin-analysis-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "posts"), { recursive: true });
    await writeFile(join(rootDir, "src", "posts", "counter.mdx"), "---\ntitle: Counter\n---\n\n# Counter");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "../posts/counter.mdx";

export default function Page() {
  return <main><Counter /></main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-mdx-component-plugin",
            transform(_code, id) {
              if (!id.endsWith(".mdx")) {
                return;
              }
              return {
                code: `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return "count: " + count.get();
}`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const routeManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      routes: Array<{ path: string; client: boolean; script?: string }>;
    };
    const route = routeManifest.routes.find((candidate) => candidate.path === "/");

    expect(route?.client).toBe(true);
    expect(route?.script).toMatch(/^assets\/routes\/.+\.js$/);
  });

  test("prerenders MDX-style components compiled with the automatic JSX runtime", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-mdx-prerender-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "hello.mdx"), "# Hello MDX");
    await writeFile(
      join(appDir, "page.tsx"),
      `import Doc from "../content/hello.mdx";

export const prerender = true;

export default function Page() {
  return <main><Doc /></main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node", "cloudflare"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-mdx-automatic-runtime-plugin",
            transform(_code, id) {
              if (!id.endsWith(".mdx")) {
                return;
              }

              return {
                code: `import { jsx as _jsx } from "@reckona/mreact/jsx-runtime";

export default function MDXContent() {
  return _jsx("h1", { children: "Hello MDX" });
}`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string; status?: number }> };
    expect(manifest.prerenderedRoutes?.["/"]?.status).toBe(200);
    expect(manifest.prerenderedRoutes?.["/"]?.html).toContain("<h1>Hello MDX</h1>");
  });

  test("prerenders MDX routes that import frontmatter named exports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-mdx-frontmatter-prerender-"));
    const appDir = join(rootDir, "src", "app", "$...slug");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content", "evaluate"), { recursive: true });
    await mkdir(join(rootDir, "src", "content", "build"), { recursive: true });
    await writeFile(
      join(rootDir, "src", "content", "evaluate", "why.mdx"),
      "---\ntitle: Frontmatter MDX\ndescription: Named export metadata\n---\n\n# Hello Frontmatter",
    );
    await writeFile(
      join(rootDir, "src", "content", "build", "getting-started.mdx"),
      "---\ntitle: Getting Started\ndescription: Build metadata\n---\n\n# Build Frontmatter",
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { notFound, type LoaderContext, type RouteMetadata } from "@reckona/mreact-router";
import Why, { frontmatter as whyFm } from "../../content/evaluate/why.mdx";
import GettingStarted, { frontmatter as gettingStartedFm } from "../../content/build/getting-started.mdx";

export const prerender = true;

interface Frontmatter {
  title?: string;
  description?: string;
}

const meta: Record<string, Frontmatter> = {
  "evaluate/why": whyFm,
  "build/getting-started": gettingStartedFm,
};

export async function generateStaticParams(): Promise<Array<{ slug: string[] }>> {
  return Object.keys(meta).map((slug) => ({ slug: slug.split("/") }));
}

interface PageData {
  slug: string;
  title: string;
  description?: string;
}

export async function loader(ctx: LoaderContext<{ slug: readonly string[] }>): Promise<PageData> {
  const slug = (ctx.params.slug ?? []).join("/");
  const fm = meta[slug];
  if (fm === undefined) notFound();
  return {
    slug,
    title: fm.title ?? slug,
    ...(fm.description ? { description: fm.description } : {}),
  };
}

export async function generateMetadata({ data }: { data: PageData }): Promise<RouteMetadata> {
  return {
    title: data.title,
    ...(data.description ? { description: data.description } : {}),
  };
}

export default function Page(props: { data: PageData }) {
  const slug = props.data.slug;
  return (
    <main>
      <h1>{props.data.title}</h1>
      <p>{props.data.description}</p>
      {slug === "evaluate/why" && <Why />}
      {slug === "build/getting-started" && <GettingStarted />}
    </main>
  );
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node", "cloudflare"],
      viteConfig: {
        plugins: [
          mdx({
            jsxImportSource: "@reckona/mreact",
            jsxRuntime: "automatic",
            rehypePlugins: [rehypeSlug],
            remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
          }),
        ],
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string; status?: number }> };
    expect(manifest.prerenderedRoutes?.["/evaluate/why"]?.status).toBe(200);
    expect(manifest.prerenderedRoutes?.["/evaluate/why"]?.html).toContain(
      "<h1>Frontmatter MDX</h1>",
    );
    expect(manifest.prerenderedRoutes?.["/evaluate/why"]?.html).toContain(
      '<h1 id="hello-frontmatter">',
    );
    expect(manifest.prerenderedRoutes?.["/build/getting-started"]?.status).toBe(200);

    const exportDir = join(rootDir, "dist");
    await expect(exportStaticApp({ exportDir, outDir })).resolves.toEqual({
      routes: ["/build/getting-started", "/evaluate/why"],
    });
    await expect(readFile(join(exportDir, "evaluate", "why", "index.html"), "utf8")).resolves
      .toContain('<h1 id="hello-frontmatter">');
  });

  test("prerenders MDX imports with frontmatter and TSX code fences", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-mdx-glob-code-fence-"));
    const appDir = join(rootDir, "src", "app", "$...slug");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content", "evaluate"), { recursive: true });
    await writeFile(
      join(rootDir, "src", "content", "evaluate", "why.mdx"),
      `---
title: Why MDX
---

# Why MDX

\`\`\`tsx
export const metadata = { title: "Why" };

export default function Example() {
  return <main>{metadata.title}</main>;
}
\`\`\`
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { notFound, type LoaderContext } from "@reckona/mreact-router";
import Why from "../../content/evaluate/why.mdx";

const pages = {
  "evaluate/why": Why,
};

export const prerender = true;

export function generateStaticParams(): Array<{ slug: string[] }> {
  return Object.keys(pages).map((slug) => ({ slug: slug.split("/") }));
}

export function loader(ctx: LoaderContext<{ slug: readonly string[] }>): { slug: string } {
  const slug = (ctx.params.slug ?? []).join("/");
  if (!(slug in pages)) notFound();
  return { slug };
}

export default function Page(props: { data: { slug: string } }) {
  const Content = pages[props.data.slug as keyof typeof pages];
  return <main><Content /></main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node", "cloudflare"],
      viteConfig: {
        plugins: [
          mdx({
            jsxImportSource: "@reckona/mreact",
            jsxRuntime: "automatic",
            rehypePlugins: [rehypeSlug],
            remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
          }),
        ],
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string; status?: number }> };
    const route = manifest.prerenderedRoutes?.["/evaluate/why"];

    expect(route?.status).toBe(200);
    expect(route?.html).toContain('<h1 id="why-mdx">Why MDX</h1>');
    expect(route?.html).toContain("export const metadata");
  });

  test("static export copies public assets to root paths", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-static-export-public-assets-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const exportDir = join(rootDir, "dist");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "public", "icons"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export const prerender = true;

export default function Page() {
  return <main><link rel="stylesheet" href="/styles.css" />Static public</main>;
}`,
    );
    await writeFile(join(rootDir, "public", "styles.css"), "main { color: green; }");
    await writeFile(join(rootDir, "public", "icons", "logo.svg"), "<svg></svg>");

    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      publicDir: "public",
      routesDir: "app",
    });

    await expect(exportStaticApp({ exportDir, outDir })).resolves.toEqual({ routes: ["/"] });
    await expect(readFile(join(exportDir, "styles.css"), "utf8")).resolves.toBe(
      "main { color: green; }",
    );
    await expect(readFile(join(exportDir, "icons", "logo.svg"), "utf8")).resolves.toBe(
      "<svg></svg>",
    );
    await expect(access(join(exportDir, "_mreact", "client", "manifest.json"))).resolves
      .toBeUndefined();
  });

  test("prerendered loaders honor user Vite plugins during render", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-prerender-loader-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "message.fixture"), "message: Prerender Plugin OK");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { message } from "../content/message.fixture";

export const prerender = true;

export function loader() {
  return message;
}

export default function Page(props) {
  return <main>{props.data}</main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-loader-data-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export const message = ${JSON.stringify(value.trim())};`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string }> };

    expect(serverManifest.prerenderedRoutes?.["/"]?.html).toContain(
      "<main>Prerender Plugin OK</main>",
    );
  });

  test("prerendered page components honor user Vite plugins during render", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-prerender-page-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "post.fixture"), "title: Page Plugin OK");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { PostTitle } from "../content/post.fixture";

export const prerender = true;

export default function Page() {
  return <main><PostTitle /></main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["cloudflare"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-prerender-page-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export function PostTitle() { return ${JSON.stringify(value.trim())}; }`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string }> };

    expect(serverManifest.prerenderedRoutes?.["/"]?.html).toContain(
      "<main>Page Plugin OK</main>",
    );
  });

  test("generateStaticParams imports honor user Vite plugins during prerender", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-build-gsp-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "$slug"), { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(join(rootDir, "src", "content", "slugs.fixture"), "slug: plugin-slug");
    await writeFile(
      join(appDir, "$slug", "page.tsx"),
      `import { slug } from "../../content/slugs.fixture";

export const prerender = true;

export function generateStaticParams() {
  return [{ slug }];
}

export default function Page(props) {
  return <main>{props.params.slug}</main>;
}
`,
    );

    await buildApp({
      outDir,
      projectRoot: rootDir,
      routesDir: "src/app",
      targets: ["node"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-generate-static-params-plugin",
            transform(code, id) {
              if (!id.endsWith(".fixture")) {
                return;
              }
              const [, value = ""] = code.split(":");
              return {
                code: `export const slug = ${JSON.stringify(value.trim())};`,
                map: null,
              };
            },
          },
        ],
      },
    });

    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { prerenderedRoutes?: Record<string, { html?: string }> };

    expect(serverManifest.prerenderedRoutes?.["/plugin-slug"]?.html).toContain(
      "<main>plugin-slug</main>",
    );
  });

  test("render-time loader bundler honors user Vite plugins", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-render-loader-vite-plugins-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await writeFile(
      join(rootDir, "src", "content", "entry.fixture"),
      "message: Render Plugin OK",
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export async function loader() {
  const { message } = await import("../content/entry.fixture");
  return message;
}

export default function Page(props) {
  return <main>{props.data}</main>;
}
`,
    );

    const response = await renderAppRequest({
      appDir,
      importPolicy: {
        allowedSourceDirs: ["src"],
        projectRoot: rootDir,
      },
      request: new Request("http://local.test/"),
      vitePlugins: [
        {
          name: "fixture-render-data-plugin",
          transform(code, id) {
            if (!id.endsWith(".fixture")) {
              return;
            }
            const values = Object.fromEntries(
              code.split("\n").map((line) => {
                const [key = "", value = ""] = line.split(":");
                return [key.trim(), value.trim()];
              }),
            );
            return {
              code: `export const message = ${JSON.stringify(values.message)};`,
              map: null,
            };
          },
        },
      ],
    });

    const html = await response.text();

    expect(response.status, html).toBe(200);
    expect(html).toContain("<main>Render Plugin OK</main>");
  });

  test("infers streaming output for route modules that render Await directly or through app-local components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-infer-stream-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "feed"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { FeedPage } from "./feed";
export default function Page() {
  return <main><FeedPage /></main>;
}`,
    );
    await writeFile(
      join(appDir, "feed", "index.tsx"),
      `export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}
export { Page as FeedPage };
`,
    );

    await buildApp({ appDir, outDir });
    const artifact = await readBuiltServerModuleArtifact<{
      analysis?: { streamRoute?: boolean };
      stream?: { code?: string };
      string?: { code?: string };
    }>(outDir, "page.tsx");

    expect(artifact?.analysis?.streamRoute).toBe(true);
    expect(artifact?.stream?.code).toContain("renderOutOfOrderBoundary");
    expect(artifact?.string?.code).toBeDefined();
  });

  test("preloads built stream routes when string artifacts are omitted for Await Link renderers", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-stream-await-link-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router";

export const stream = true;

export default function Page() {
  const item = Promise.resolve({ id: 123, title: "Ada" });

  return (
    <main>
      <Await value={item} placeholder={<span>Loading</span>}>
        {(value) => <Link href={\`/item/\${value.id}\`}>{value.title}</Link>}
      </Await>
    </main>
  );
}`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const artifact = await readBuiltServerModuleArtifact<{
      stream?: { code?: string };
      string?: { code?: string };
    }>(outDir, "page.tsx");

    expect(artifact?.stream?.code).toContain("renderOutOfOrderBoundary");
    expect(artifact?.string).toBeUndefined();
    await expect(preloadBuiltAppRuntime({ outDir })).resolves.toBeUndefined();

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(await response.text()).toContain('<a href="/item/123">Ada</a>');
  });

  test("skips Cloudflare route modules for node-only builds", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-node-target-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const options = { appDir, outDir, targets: ["node"] as const };
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      `import { createHash } from "node:crypto";

export default function Page() {
  return <main>{createHash("sha256").update("ada").digest("hex")}</main>;
}`,
    );

    await expect(buildApp(options)).resolves.toEqual({
      routes: [
        expect.objectContaining({
          path: "/users/:id",
        }),
      ],
    });
    await expect(access(join(outDir, "cloudflare", "route-modules.mjs"))).rejects.toThrow();
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
      `import { echo, save } from "./actions";

const prose = "<form action={echo}>not real jsx</form>";

export default function Page() {
  // <form action={echo}>not real jsx</form>
  void prose;
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

  test("writes inferred form actions to the built server action manifest", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-inferred-actions-manifest-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `export function save() { return { ok: "save" }; }
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
      { moduleId: "actions.ts", exportName: "save", inferred: true },
    ]);

    const pageResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();
    const csrf = extractInputValue(html, "__mreact_csrf");
    const nonce = extractInputValue(html, "__mreact_action_nonce");
    const token = extractInputValue(html, "__mreact_action_token");
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_token: token,
          __mreact_action_nonce: nonce,
          __mreact_csrf: csrf,
          __mreact_export_name: "save",
          __mreact_module_id: "actions.ts",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, value: { ok: "save" } });

    const blocked = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: new URLSearchParams({
          __mreact_action_nonce: "nonce-build-inferred-blocked",
          __mreact_csrf: "csrf-build-inferred-blocked",
          __mreact_export_name: "echo",
          __mreact_module_id: "actions.ts",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "mreact.csrf=csrf-build-inferred-blocked",
        },
        method: "POST",
      }),
    });

    expect(blocked.status).toBe(404);
    await expect(blocked.json()).resolves.toEqual({
      ok: false,
      error: "Unknown server action.",
    });
  });

  test("writes typed registry form actions to the built server action manifest", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-registry-actions-manifest-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save(_formData: FormData) { return { ok: "save" }; }
export async function echo(value) { return { value }; }
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { save } from "./actions";

const actions = { save } satisfies Record<string, (formData: FormData) => Promise<unknown>>;

export default function Page() {
  return <main><form action={actions.save}><button type="submit">Save</button></form></main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifestPath = join(outDir, "server", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      routeServerActionReferences?: Record<
        string,
        Array<{
          end: number;
          expression: string;
          expressionEnd: number;
          expressionStart: number;
          moduleId: string;
          exportName: string;
          inferred?: boolean;
          sourceHash: string;
          start: number;
        }>
      >;
      serverActionManifest?: Array<{ moduleId: string; exportName: string; inferred?: boolean }>;
    };

    expect(manifest.serverActionManifest).toEqual([
      { moduleId: "actions.ts", exportName: "save", inferred: true },
    ]);
    expect(manifest.routeServerActionReferences).toEqual({
      "page.tsx": [
        expect.objectContaining({
          expression: "actions.save",
          moduleId: "actions.ts",
          exportName: "save",
          inferred: true,
          end: expect.any(Number),
          expressionEnd: expect.any(Number),
          expressionStart: expect.any(Number),
          sourceHash: expect.any(String),
          start: expect.any(Number),
        }),
      ],
    });

    __resetServerActionInferenceTypeScriptForTests();
    const pageResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();

    expect(html).toContain('action="/_mreact/actions"');
    expect(html).toContain('name="__mreact_module_id" value="actions.ts"');
    expect(html).toContain('name="__mreact_export_name" value="save"');
    expect(__readServerActionInferenceTypeScriptLoadedForTests()).toBe(false);

    const blocked = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "save",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=csrf-build-registry-json-blocked",
          "x-mreact-action-nonce": "nonce-build-registry-json-blocked",
          "x-mreact-csrf": "csrf-build-registry-json-blocked",
        },
        method: "POST",
      }),
    });

    expect(blocked.status).toBe(404);
    await expect(blocked.json()).resolves.toEqual({
      ok: false,
      error: "Unknown server action.",
    });
  });

  test("writes namespace form actions to the built server action manifest", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-namespace-actions-manifest-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save(_formData: FormData) { return { ok: "save" }; }
export async function echo(value) { return { value }; }
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import * as actions from "./actions";

export default function Page() {
  return <main><form action={actions.save}><button type="submit">Save</button></form></main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const manifestPath = join(outDir, "server", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      routeServerActionReferences?: Record<
        string,
        Array<{
          expression: string;
          moduleId: string;
          exportName: string;
          inferred?: boolean;
        }>
      >;
      serverActionManifest?: Array<{ moduleId: string; exportName: string; inferred?: boolean }>;
    };

    expect(manifest.serverActionManifest).toEqual([
      { moduleId: "actions.ts", exportName: "save", inferred: true },
    ]);
    expect(manifest.routeServerActionReferences).toEqual({
      "page.tsx": [
        expect.objectContaining({
          expression: "actions.save",
          moduleId: "actions.ts",
          exportName: "save",
          inferred: true,
        }),
      ],
    });
  });

  test("built form action lowering keeps same-name aliases scoped by occurrence", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-action-scope-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save() { return { ok: "save" }; }
export async function adminDelete() { return { ok: "admin-delete" }; }
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { adminDelete, save } from "./actions";

function HiddenAdminForm() {
  const action = adminDelete;
  return <form action={action}><button type="submit">Delete</button></form>;
}

export default function Page() {
  const action = save;
  return <main><form action={action}><button type="submit">Save</button></form></main>;
}`,
    );

    await buildApp({ appDir, outDir });
    __resetServerActionInferenceTypeScriptForTests();
    const pageResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await pageResponse.text();

    expect(html).toContain('name="__mreact_export_name" value="save"');
    expect(html).not.toContain('name="__mreact_export_name" value="adminDelete"');
    expect(__readServerActionInferenceTypeScriptLoadedForTests()).toBe(false);
  });

  test("warns when a built form action uses dynamic selection", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-dynamic-actions-warn-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save() {}
export async function deleteAll() {}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { deleteAll, save } from "./actions";

const action = Math.random() > 0.5 ? save : deleteAll;

export default function Page() {
  return <main><form action={action}><button type="submit">Save</button></form></main>;
}`,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await buildApp({ appDir, outDir });
      expect(warn).toHaveBeenCalledWith(
        "MR_SERVER_ACTION_INFERENCE_DYNAMIC_FORM_ACTION: mreact could not infer a single server action from this form action expression. Pass the action function directly or use an explicit escape hatch.",
      );
    } finally {
      warn.mockRestore();
    }

    const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
      routeServerActionReferences?: Record<string, unknown[]>;
    };

    expect(manifest.routeServerActionReferences).toEqual({ "page.tsx": [] });

    __resetServerActionInferenceTypeScriptForTests();
    await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    expect(__readServerActionInferenceTypeScriptLoadedForTests()).toBe(false);
  });

  test("rejects built JSON calls to inferred actions from dead JSX", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-inferred-json-dead-jsx-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `export function save() { return { ok: "save" }; }
export function adminDelete() {
  (globalThis as { __mreactBuiltAdminDeleteCalls?: number }).__mreactBuiltAdminDeleteCalls =
    ((globalThis as { __mreactBuiltAdminDeleteCalls?: number }).__mreactBuiltAdminDeleteCalls ?? 0) + 1;
  return { ok: "deleted" };
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { adminDelete, save } from "./actions";

function UnusedAdminPanel() {
  return <form action={adminDelete}><button type="submit">Delete</button></form>;
}

export default function Page() {
  void UnusedAdminPanel;
  return <main><form action={save}><button type="submit">Save</button></form></main>;
}`,
    );
    delete (globalThis as { __mreactBuiltAdminDeleteCalls?: number }).__mreactBuiltAdminDeleteCalls;

    await buildApp({ appDir, outDir });
    const manifestPath = join(outDir, "server", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      serverActionManifest?: Array<{ moduleId: string; exportName: string; inferred?: boolean }>;
    };

    expect(manifest.serverActionManifest).toEqual([
      { moduleId: "actions.ts", exportName: "adminDelete", inferred: true },
      { moduleId: "actions.ts", exportName: "save", inferred: true },
    ]);

    const pageResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const csrf = cookie.split("=")[1] ?? "";
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/_mreact/actions", {
        body: JSON.stringify({
          args: [],
          exportName: "adminDelete",
          moduleId: "actions.ts",
        }),
        headers: {
          "content-type": "application/json",
          cookie,
          "x-mreact-action-nonce": "nonce-built-inferred-json-dead-jsx",
          "x-mreact-csrf": csrf,
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unknown server action.",
    });
    expect((globalThis as { __mreactBuiltAdminDeleteCalls?: number }).__mreactBuiltAdminDeleteCalls).toBeUndefined();
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

  test("skips importing built middleware modules when a static matcher excludes the request", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-middleware-static-skip-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "healthz"), { recursive: true });
    await mkdir(join(appDir, "admin"), { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `const state = globalThis;
state.__mreactStaticMatcherMiddlewareImports = (state.__mreactStaticMatcherMiddlewareImports ?? 0) + 1;

export const config = { matcher: "/admin/:path*" };

export function middleware() {
  return new Response(null, { headers: { location: "/login" }, status: 303 });
}`,
    );
    await writeFile(
      join(appDir, "healthz", "page.tsx"),
      "export default function Healthz() { return <main>ok</main>; }",
    );
    await writeFile(
      join(appDir, "admin", "page.tsx"),
      "export default function Admin() { return <main>admin</main>; }",
    );
    const state = globalThis as { __mreactStaticMatcherMiddlewareImports?: number | undefined };
    state.__mreactStaticMatcherMiddlewareImports = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });

    const healthz = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/healthz"),
    });

    expect(healthz.status).toBe(200);
    expect(await healthz.text()).toContain("<main>ok</main>");
    expect(state.__mreactStaticMatcherMiddlewareImports).toBe(0);

    const admin = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/admin"),
    });

    expect(admin.status).toBe(303);
    expect(admin.headers.get("location")).toBe("/login");
    expect(state.__mreactStaticMatcherMiddlewareImports).toBe(1);
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
    const pageArtifact = await readBuiltServerModuleArtifact<{
      string?: { code?: string };
    }>(outDir, "page.tsx");
    const artifactCode = pageArtifact?.string?.code ?? "";
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(artifactCode).toContain("@reckona/mreact-router/native-escape");
    expect(artifactCode).toContain("[first, second]");
    expect(await response.text()).toContain("<main>&lt;Ada&gt;&amp; Grace</main>");
  });

  test("does not emit production client source maps by default", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-no-sourcemap-"));
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
    ) as { routes: Array<{ script?: string; sourceMap?: string }> };
    const script = clientManifest.routes[0]?.script;

    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(clientManifest.routes[0]?.sourceMap).toBeUndefined();
    await expect(access(join(outDir, "client", `${script}.map`))).rejects.toThrow();
    await expect(access(join(outDir, "source-maps", "client", `${script}.map`))).rejects.toThrow();
    await expect(readFile(join(outDir, "client", script ?? ""), "utf8")).resolves.not.toContain(
      "sourceMappingURL=",
    );
  });

  test("can emit hidden production client source maps for upload tooling", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-hidden-sourcemap-"));
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

    await buildApp({ appDir, outDir, clientSourceMaps: "hidden" });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ script?: string; sourceMap?: string }> };
    const script = clientManifest.routes[0]?.script;

    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    expect(clientManifest.routes[0]?.sourceMap).toBeUndefined();
    await expect(access(join(outDir, "client", `${script}.map`))).rejects.toThrow();
    await expect(access(join(outDir, "source-maps", "client", `${script}.map`))).resolves.toBeUndefined();
    await expect(readFile(join(outDir, "client", script ?? ""), "utf8")).resolves.not.toContain(
      "sourceMappingURL=",
    );
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

    await buildApp({ appDir, outDir, clientSourceMaps: "linked" });
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

  test("shares imported app modules between production client route chunks", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-shared-chunk-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "mfa-challenge"), { recursive: true });
    await mkdir(join(appDir, "lib"), { recursive: true });
    await writeFile(
      join(appDir, "lib", "mfa-pending-store.ts"),
      `let pending: { ticket: string } | null = null;

export function setMfaPending(value: { ticket: string }) {
  pending = value;
}

export function getMfaPending() {
  return pending;
}

export function getMfaPendingStoreMarker() {
  return "__mfa_pending_store_marker__";
}
`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `import { getMfaPendingStoreMarker, setMfaPending } from "../lib/mfa-pending-store";

export default function Login() {
  return <main><h1>Login</h1><a data-store={getMfaPendingStoreMarker()} href="/mfa-challenge" onClick={() => setMfaPending({ ticket: "ticket-totp-1" })}>Continue</a></main>;
}
`,
    );
    await writeFile(
      join(appDir, "mfa-challenge", "page.tsx"),
      `import { getMfaPending, getMfaPendingStoreMarker } from "../lib/mfa-pending-store";

export default function MfaChallenge() {
  const pending = getMfaPending();
  return <main data-store={getMfaPendingStoreMarker()}><h1>{pending?.ticket ?? "expired"}</h1><button type="button" onClick={() => undefined}>noop</button></main>;
}
`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      routes: Array<{ imports?: string[]; path: string; script?: string }>;
    };
    const login = clientManifest.routes.find((route) => route.path === "/login");
    const challenge = clientManifest.routes.find((route) => route.path === "/mfa-challenge");
    const sharedImports = login?.imports?.filter((file) => challenge?.imports?.includes(file));

    expect(login?.script).toMatch(/^assets\/routes\/login\.[a-f0-9]{8}\.js$/);
    expect(challenge?.script).toMatch(/^assets\/routes\/mfa-challenge\.[a-f0-9]{8}\.js$/);
    expect(sharedImports).toHaveLength(1);

    const sharedCode = await readFile(join(outDir, "client", sharedImports?.[0] ?? ""), "utf8");
    const loginCode = await readFile(join(outDir, "client", login?.script ?? ""), "utf8");
    const challengeCode = await readFile(join(outDir, "client", challenge?.script ?? ""), "utf8");

    expect(sharedCode).toContain("__mfa_pending_store_marker__");
    expect(loginCode).not.toContain("let pending");
    expect(challengeCode).not.toContain("let pending");
  });

  test("uses the client asset base for built dynamic import chunks", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-client-dynamic-import-base-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "lib"), { recursive: true });
    await writeFile(
      join(appDir, "lib", "firebase-client.ts"),
      `export function firebaseMarker() {
  return "__firebase_dynamic_chunk_marker__";
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return (
    <main>
      <button type="button" onClick={async () => {
        const mod = await import("./lib/firebase-client");
        document.body.setAttribute("data-marker", mod.firebaseMarker());
      }}>Load Firebase</button>
    </main>
  );
}
`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      routes: Array<{ imports?: string[]; path: string; script?: string }>;
    };
    const indexRoute = clientManifest.routes.find((route) => route.path === "/");
    const routeCode = await readFile(join(outDir, "client", indexRoute?.script ?? ""), "utf8");

    expect(routeCode).not.toContain('"/assets/chunks/');
    expect(routeCode).not.toContain("return`/`+");
    expect(routeCode).toContain("`/_mreact/client/`+");
  });

  test("emits and links CSS imported from route layouts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-css-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "global.css"), ".title { color: rgb(1 2 3); }");
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "./global.css";

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

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ css?: string[]; path: string }> };
    const css = clientManifest.routes[0]?.css?.[0];

    expect(css).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.css$/);
    await expect(readFile(join(outDir, "client", css ?? ""), "utf8")).resolves.toContain(
      ".title",
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain(`<link rel="stylesheet" href="/_mreact/client/${css}">`);
  });

  test("links layout CSS for built special not-found routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-not-found-css-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "global.css"), ".missing { color: rgb(1 2 3); }");
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "./global.css";

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

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { styles?: Array<{ css?: string[]; file: string }> };
    const notFoundStyles = clientManifest.styles?.find((entry) => entry.file === "not-found.tsx");
    const css = notFoundStyles?.css?.[0];

    expect(css).toMatch(/^assets\/routes\/not-found\.[a-f0-9]{8}\.css$/);
    await expect(readFile(join(outDir, "client", css ?? ""), "utf8")).resolves.toContain(
      ".missing",
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/missing"),
    });
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain("<main class=\"missing\">Missing</main>");
    expect(html).toContain(`<link rel="stylesheet" href="/_mreact/client/${css}">`);
  });

  test("reuses one CSS asset for routes with the same layout CSS set", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-shared-css-batch-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "a"), { recursive: true });
    await mkdir(join(appDir, "b"), { recursive: true });
    await mkdir(join(appDir, "c"), { recursive: true });
    await writeFile(join(appDir, "global.css"), ".shell { color: rgb(1 2 3); }");
    await writeFile(join(appDir, "c", "page.css"), ".page { color: rgb(4 5 6); }");
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import "./global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(join(appDir, "a", "page.mreact.tsx"), "export default function Page() { return <main className=\"shell\">A</main>; }");
    await writeFile(join(appDir, "b", "page.mreact.tsx"), "export default function Page() { return <main className=\"shell\">B</main>; }");
    await writeFile(
      join(appDir, "c", "page.mreact.tsx"),
      `import "./page.css";

export default function Page() {
  return <main className="shell page">C</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ css?: string[]; path: string }> };
    const routeA = clientManifest.routes.find((route) => route.path === "/a");
    const routeB = clientManifest.routes.find((route) => route.path === "/b");
    const routeC = clientManifest.routes.find((route) => route.path === "/c");
    const sharedCss = routeA?.css?.[0];
    const pageCss = routeC?.css?.[0];

    expect(sharedCss).toBe(routeB?.css?.[0]);
    expect(sharedCss).toMatch(/^assets\/routes\/shared\.[a-f0-9]{8}\.[a-f0-9]{8}\.css$/);
    expect(pageCss).toMatch(/^assets\/routes\/c\.[a-f0-9]{8}\.css$/);
    expect(pageCss).not.toBe(sharedCss);
    await expect(readFile(join(outDir, "client", sharedCss ?? ""), "utf8")).resolves.toContain(
      ".shell",
    );
    await expect(readFile(join(outDir, "client", pageCss ?? ""), "utf8")).resolves.toContain(
      ".page",
    );
  });

  test("emits CSS imported by a configured src app layout", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-src-app-layout-css-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "src", "global.css"), ".title { color: rgb(4 5 6); }");
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

    await buildApp({ projectRoot: rootDir, routesDir: appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ css?: string[]; path: string }> };
    const css = clientManifest.routes[0]?.css?.[0];

    expect(css).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.css$/);
    await expect(readFile(join(outDir, "client", css ?? ""), "utf8")).resolves.toContain(
      ".title",
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain(`<link rel="stylesheet" href="/_mreact/client/${css}">`);
  });

  test("client route inference ignores CSS imported by a configured src app layout", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-src-app-client-layout-css-"));
    const appDir = join(rootDir, "src", "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "global.css"),
      ".title { color: rgb(4 5 6); }",
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import "../global.css";

export default function Layout(props) {
  return <html><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main className="title">Count {count.get()}</main>;
}`,
    );

    await buildApp({
      projectRoot: rootDir,
      routesDir: appDir,
      outDir,
      targets: ["cloudflare"],
      viteConfig: {
        plugins: [
          {
            name: "fixture-pass-through-css-transform",
            transform(code, id) {
              if (!id.endsWith(".css")) {
                return;
              }
              return { code, map: null };
            },
          },
        ],
      },
    });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; css?: string[]; path: string }> };
    const route = clientManifest.routes.find((candidate) => candidate.path === "/");
    const css = route?.css?.[0];

    expect(route?.client).toBe(true);
    expect(css).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.css$/);
    await expect(readFile(join(outDir, "client", css ?? ""), "utf8")).resolves.toContain(
      ".title",
    );
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

  test("warns when nested function-call component interactivity is not hydrated", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-nested-interactive-warn-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "Banner.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Banner() {
  const accepted = cell(false);
  return <button type="button" onClick={() => accepted.set(true)}>Accept {accepted.get() ? "yes" : "no"}</button>;
}`,
    );
    await writeFile(
      join(appDir, "components", "Frame.tsx"),
      `import { Banner } from "./Banner";

export function Frame(props) {
  return <main>{props.children}{Banner()}</main>;
}`,
    );
    await writeFile(
      join(appDir, "components", "Login.client.tsx"),
      `export function Login() {
  return <form><button type="submit">Sign in</button></form>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Frame } from "./components/Frame";
import { Login } from "./components/Login.client";

export default function Page() {
  return Frame({ children: <Login /> });
}`,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await buildApp({ appDir, outDir });
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining("MR_CLIENT_BOUNDARY_INFERENCE_FUNCTION_CALL_INTERACTIVE"),
          expect.stringContaining("Banner"),
          expect.stringContaining('route "/"'),
          expect.stringContaining("<Banner />"),
        ]),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("does not warn for static nested function-call components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-nested-static-no-warn-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "Banner.tsx"),
      `export function Banner() {
  return <p>Static banner</p>;
}`,
    );
    await writeFile(
      join(appDir, "components", "Frame.tsx"),
      `import { Banner } from "./Banner";

export function Frame(props) {
  return <main>{props.children}{Banner()}</main>;
}`,
    );
    await writeFile(
      join(appDir, "components", "Login.client.tsx"),
      `export function Login() {
  return <form><button type="submit">Sign in</button></form>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Frame } from "./components/Frame";
import { Login } from "./components/Login.client";

export default function Page() {
  return Frame({ children: <Login /> });
}`,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await buildApp({ appDir, outDir });
      expect(
        warn.mock.calls.some((call) =>
          String(call[0]).includes("MR_CLIENT_BOUNDARY_INFERENCE_FUNCTION_CALL_INTERACTIVE"),
        ),
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
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

  test("auto-injects navigation runtime when a server route renders Link without the flag", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-navigation-auto-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

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
    ) as { routes: Array<{ navigation?: boolean; navigationScript?: string; path: string }> };
    const home = clientManifest.routes.find((route) => route.path === "/");

    expect(home).toMatchObject({ navigation: true });
    expect(home?.navigationScript).toMatch(/^assets\/navigation\.[a-f0-9]{8}\.js$/);
  });

  test("auto-injects navigation runtime when Link is rendered via a custom component", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-navigation-transitive-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "components"), { recursive: true });
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/about" prefetch="viewport">About</Link>; }`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Nav } from "./components/nav";

export default function Page() { return <main><Nav /></main>; }`,
    );
    await writeFile(
      join(appDir, "about", "page.tsx"),
      `export default function Page() { return <main>About</main>; }`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ navigation?: boolean; navigationScript?: string; path: string }> };
    const home = clientManifest.routes.find((route) => route.path === "/");

    expect(home).toMatchObject({ navigation: true });
    expect(home?.navigationScript).toMatch(/^assets\/navigation\.[a-f0-9]{8}\.js$/);
  });

  test("does not inject navigation runtime when Link is imported but not rendered", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-navigation-unused-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export default function Page() { return <main>no link rendered</main>; }`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ navigation?: boolean; navigationScript?: string; path: string }> };
    const home = clientManifest.routes.find((route) => route.path === "/");

    expect(home?.navigation).toBeUndefined();
    expect(home?.navigationScript).toBeUndefined();
  });

  test("navigationRuntime = false forces the runtime off even when Link is rendered", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-navigation-optout-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export const navigationRuntime = false;

export default function Page() { return <main><Link href="/about">About</Link></main>; }`,
    );
    await writeFile(
      join(appDir, "about", "page.tsx"),
      `export default function Page() { return <main>About</main>; }`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ navigation?: boolean; navigationScript?: string; path: string }> };
    const home = clientManifest.routes.find((route) => route.path === "/");

    expect(home?.navigation).toBeUndefined();
    expect(home?.navigationScript).toBeUndefined();
  });

  test("auto-injects navigation runtime when Link is rendered in a layout", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-navigation-layout-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "about"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export default function Layout({ children }: { children: unknown }) {
  return <div><nav><Link href="/about">About</Link></nav>{children}</div>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>home</main>; }`,
    );
    await writeFile(
      join(appDir, "about", "page.tsx"),
      `export default function Page() { return <main>About</main>; }`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ navigation?: boolean; navigationScript?: string; path: string }> };
    const home = clientManifest.routes.find((route) => route.path === "/");

    expect(home).toMatchObject({ navigation: true });
    expect(home?.navigationScript).toMatch(/^assets\/navigation\.[a-f0-9]{8}\.js$/);
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
    const pageArtifact = await readBuiltServerModuleArtifact<{
      string?: {
        code?: string;
        metadata?: { clientReferenceManifest?: Array<{ moduleId: string; name: string }> };
      };
    }>(outDir, "page.tsx");
    const artifactCode = pageArtifact?.string?.code ?? "";
    const metadata = pageArtifact?.string?.metadata;

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

  test("server renders imported presentational components when callback props are undefined", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-imported-pure-component-"));
    const appDir = join(rootDir, "app");
    const componentsDir = join(rootDir, "components");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "TimelineGrid.tsx"),
      `export function TimelineGrid(props: { cardTestId: string; items: Array<{ id: string; thumbnailUrl: string }>; onOpenMedia?: ((id: string) => void) | undefined }) {
  return (
    <section>
      {props.items.map((item) => (
        <article data-testid={props.cardTestId} key={item.id}>
          <button
            type="button"
            onClick={props.onOpenMedia === undefined ? undefined : () => props.onOpenMedia?.(item.id)}
          >
            <img src={item.thumbnailUrl} alt="" />
          </button>
        </article>
      ))}
    </section>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
import { TimelineGrid } from "../components/TimelineGrid";

export function loader() {
  return [{ id: "media-1", thumbnailUrl: "/media/thumb.jpg" }];
}

export default function Page(props: { data: Array<{ id: string; thumbnailUrl: string }> }) {
  const mediaItems = cell(props.data);
  const openViewer = (id: string) => {
    document.body.setAttribute("data-open-media", id);
  };

  return (
    <main>
      <TimelineGrid
        cardTestId="media-card"
        items={mediaItems.get()}
        onOpenMedia={typeof window === "undefined" ? undefined : openViewer}
      />
    </main>
  );
}`,
    );

    await buildApp({ appDir, outDir });
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-testid="media-card"');
    expect(html).toContain('src="/media/thumb.jpg"');
    expect(html).not.toContain(
      '<template data-mreact-client-boundary="TimelineGrid"></template><script',
    );

    const server = await startServer({ outDir, port: 0 });
    try {
      const serverResponse = await fetch(server.url);
      const serverHtml = await serverResponse.text();
      expect(serverResponse.status).toBe(200);
      expect(serverHtml).toContain('data-testid="media-card"');
      expect(serverHtml).toContain('src="/media/thumb.jpg"');
      expect(serverHtml).not.toContain(
        '<template data-mreact-client-boundary="TimelineGrid"></template><script',
      );
    } finally {
      await server.close();
    }
  });

  test("emits a client route bundle for client boundaries rendered by layouts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-layout-boundary-"));
    const appDir = join(rootDir, "app");
    const componentsDir = join(rootDir, "components");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "LocaleSwitcher.client.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function LocaleSwitcher() {
  const locale = cell("ja");
  return <button type="button" onClick={() => locale.set("en")}>{locale.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { LocaleSwitcher } from "../components/LocaleSwitcher.client";

export default function Layout() {
  return <html><body><header><LocaleSwitcher /></header><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Legal terms</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = clientManifest.routes[0]?.script;

    expect(clientManifest.routes[0]?.client).toBe(true);
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    await expect(readFile(join(outDir, "client", script ?? ""), "utf8")).resolves.toContain(
      "LocaleSwitcher",
    );
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('data-mreact-client-boundary="LocaleSwitcher"');
    expect(html).toContain('src="/_mreact/client/assets/routes/index.');
  });

  test("preserves server wrappers that render nested client boundaries from layouts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-layout-wrapper-boundary-"));
    const appDir = join(rootDir, "app");
    const componentsDir = join(rootDir, "components");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "LocaleSwitcher.client.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function LocaleSwitcher() {
  const locale = cell("ja");
  return <button type="button" onClick={() => locale.set("en")}>{locale.get()}</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "Header.tsx"),
      `import { LocaleSwitcher } from "./LocaleSwitcher.client";

export function Header() {
  return <header><h1>Legal</h1><LocaleSwitcher /></header>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { Header } from "../components/Header";

export default function Layout() {
  return <html><body><Header /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Legal terms</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean; script?: string }> };
    const script = clientManifest.routes[0]?.script;

    expect(clientManifest.routes[0]?.client).toBe(true);
    expect(script).toMatch(/^assets\/routes\/index\.[a-f0-9]{8}\.js$/);
    await expect(readFile(join(outDir, "client", script ?? ""), "utf8")).resolves.toContain(
      "LocaleSwitcher",
    );
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain("<header><h1>Legal</h1>");
    expect(html).toContain('data-mreact-client-boundary="LocaleSwitcher"');
    expect(html).not.toContain('data-mreact-client-boundary="Header"');
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
    const pageArtifact = await readBuiltServerModuleArtifact<{
      routeMetadata?: { code?: string };
      request?: { code?: string };
    }>(outDir, "page.tsx");
    expect(pageArtifact?.routeMetadata?.code).toContain("Server-only metadata");
    expect(pageArtifact?.request).toBeUndefined();
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(await response.text()).toContain("Loaded on the server");
    expect(await (await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    })).text()).toContain("<title>Server-only metadata</title>");
  });

  test("keeps typed form action implementations out of production client bundles", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-client-form-action-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "actions.ts"),
      `const secret = "SERVER_SECRET_MARKER";

export async function save(_formData: FormData) {
  return { secret };
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
import { save } from "./actions";

const actions = { save } satisfies Record<string, (formData: FormData) => Promise<unknown>>;

export default function Page() {
  const count = cell(0);
  return (
    <main>
      <button type="button" onClick={() => count.set((value) => value + 1)}>{count}</button>
      <form action={actions.save}><button type="submit">Save</button></form>
    </main>
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
      "SERVER_SECRET_MARKER",
    );
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

  test("reports source location for thrown build-time parse errors", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-parse-error-location-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const routeFile = join(appDir, "page.tsx");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      routeFile,
      `export default function Page() {
  return <main>{</main>;
}`,
    );

    await expect(buildApp({ appDir, outDir })).rejects.toThrow(
      new RegExp(`${escapeRegExp(routeFile)}:\\d+:\\d+`),
    );
  });

  test("fails production validation before replacing an existing output directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-validate-before-write-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const routeFile = join(appDir, "page.tsx");
    await mkdir(appDir, { recursive: true });
    await mkdir(join(outDir, "server"), { recursive: true });
    await writeFile(join(outDir, "server", "manifest.json"), "previous build");
    await writeFile(
      routeFile,
      `export default function Page() {
  return <main>{</main>;
}`,
    );

    await expect(buildApp({ appDir, outDir })).rejects.toThrow(
      new RegExp(`${escapeRegExp(routeFile)}:\\d+:\\d+`),
    );
    await expect(readFile(join(outDir, "server", "manifest.json"), "utf8")).resolves.toBe(
      "previous build",
    );
  });

  test("builds production routes with server JSX spread attributes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-spread-attributes-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `const props = { className: "card", "data-kind": "home" };

export default function Page() {
  return <main {...props}>Home</main>;
}`,
    );

    await buildApp({ appDir, outDir });
    await expect(access(join(outDir, "server", "manifest.json"))).resolves.toBeUndefined();
    await expect(access(join(outDir, "client", "manifest.json"))).resolves.toBeUndefined();
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

  test("preloads built loader and route handler modules before requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-preload-modules-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "healthz"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `const state = globalThis;
state.__mreactBuiltPreload = [...(state.__mreactBuiltPreload ?? []), "loader-module"];

export function loader() {
  return { message: "preloaded" };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}`,
    );
    await writeFile(
      join(appDir, "api", "healthz", "route.ts"),
      `const state = globalThis;
state.__mreactBuiltPreload = [...(state.__mreactBuiltPreload ?? []), "route-module"];

export function GET() {
  return Response.json({ ok: true });
}`,
    );
    const state = globalThis as { __mreactBuiltPreload?: string[] | undefined };
    state.__mreactBuiltPreload = [];

    await buildApp({ appDir, outDir, targets: ["node"] });
    const pageArtifact = await readBuiltServerModuleArtifact<{ loader?: { code?: string } }>(
      outDir,
      "page.tsx",
    );
    const routeArtifact = await readBuiltServerModuleArtifact<{ request?: { code?: string } }>(
      outDir,
      "api/healthz/route.ts",
    );

    expect(pageArtifact?.loader?.code).toContain("loader");
    expect(routeArtifact?.request?.code).toContain("GET");

    await preloadBuiltAppRuntime({ outDir });

    expect(state.__mreactBuiltPreload?.sort()).toEqual([
      "loader-module",
      "loader-module",
      "route-module",
    ]);
  });

  test("preloads built page and layout modules before requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-preload-pages-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `const state = globalThis;
state.__mreactBuiltPagePreload = [...(state.__mreactBuiltPagePreload ?? []), "layout-module"];

export default function Layout() {
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `const state = globalThis;
state.__mreactBuiltPagePreload = [...(state.__mreactBuiltPagePreload ?? []), "page-module"];

export default function Page() {
  return <main>Preloaded page</main>;
}`,
    );
    const state = globalThis as { __mreactBuiltPagePreload?: string[] | undefined };
    state.__mreactBuiltPagePreload = [];

    await buildApp({ appDir, outDir, targets: ["node"] });
    await preloadBuiltAppRuntime({ outDir });

    expect(state.__mreactBuiltPagePreload?.sort()).toEqual(["layout-module", "page-module"]);
  });

  test("writes built server modules as external artifacts instead of manifest code", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-module-files-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export function loader() {
  return { message: "loader-secret" };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const manifestText = await readFile(join(outDir, "server", "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestText) as {
      serverModuleFiles?: Record<string, string>;
      serverModuleRequestFiles?: Record<string, string>;
      serverModules?: Record<string, unknown>;
    };
    const artifactPath =
      manifest.serverModuleRequestFiles?.["page.tsx"] ?? manifest.serverModuleFiles?.["page.tsx"];

    expect(manifest.serverModules).toBeUndefined();
    expect(manifestText).not.toContain("__mreact_jsx");
    expect(artifactPath).toMatch(
      /^server-modules\/(?:request\/)?[a-f0-9]{16}\.json$/,
    );

    const artifact = await hydrateTestServerModuleArtifact<{
      loader?: { code?: string; moduleFile?: string };
      request?: { code?: string };
    }>(
      outDir,
      JSON.parse(await readFile(join(outDir, "server", artifactPath ?? ""), "utf8")),
    );
    expect(artifact.loader?.moduleFile).toMatch(
      /^server-modules\/code\/[a-f0-9]{16}\.mjs$/,
    );
    expect(artifact.loader?.code).toContain("loader-secret");
    expect(artifact.request).toBeUndefined();

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    expect(await response.text()).toContain("<main>loader-secret</main>");
  });

  test("preserves source import.meta.url for built loader dependency asset paths", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-import-meta-assets-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "server"), { recursive: true });
    await mkdir(join(rootDir, "assets"), { recursive: true });
    await writeFile(join(rootDir, "assets", "message.txt"), "asset-message\n");
    await writeFile(
      join(appDir, "server", "read-asset.ts"),
      `import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function readMessage() {
  const assetFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "message.txt");
  return readFileSync(assetFile, "utf8").trim();
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { readMessage } from "./server/read-asset";

export function loader() {
  return { message: readMessage() };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}
`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>asset-message</main>");
  });

  test("keeps built loader request artifacts free of page-only imports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-request-artifact-split-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "heavy-page-dependency.ts"),
      `globalThis.__mreactHeavyPageDependencyLoaded =
  (globalThis.__mreactHeavyPageDependencyLoaded ?? 0) + 1;

export function Heavy() {
  return "heavy";
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";
import { Heavy } from "./heavy-page-dependency";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>{Heavy()}</main>;
}`,
    );
    const state = globalThis as { __mreactHeavyPageDependencyLoaded?: number | undefined };
    state.__mreactHeavyPageDependencyLoaded = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });
    const pageArtifact = await readBuiltServerModuleArtifact<{ loader?: { code?: string } }>(
      outDir,
      "page.tsx",
    );

    expect(pageArtifact?.loader?.code).not.toContain("heavy-page-dependency");
    expect(pageArtifact?.loader?.code).not.toContain("function Heavy");

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(state.__mreactHeavyPageDependencyLoaded).toBe(0);
  });

  test("keeps side-effect-only imports in built loader artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-loader-side-effect-import-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "side-effect.ts"),
      `globalThis.__mreactLoaderSideEffectLoaded =
  (globalThis.__mreactLoaderSideEffectLoaded ?? 0) + 1;`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";
import "./side-effect";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );
    const state = globalThis as { __mreactLoaderSideEffectLoaded?: number | undefined };
    state.__mreactLoaderSideEffectLoaded = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });
    const pageArtifact = await readBuiltServerModuleArtifact<{ loader?: { code?: string } }>(
      outDir,
      "page.tsx",
    );

    expect(pageArtifact?.loader?.code).toContain("__mreactLoaderSideEffectLoaded");
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(303);
    expect(state.__mreactLoaderSideEffectLoaded).toBe(1);
  });

  test("keeps built loader redirects free of metadata-only imports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-loader-metadata-split-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "metadata-dependency.ts"),
      `globalThis.__mreactMetadataDependencyLoaded =
  (globalThis.__mreactMetadataDependencyLoaded ?? 0) + 1;

export const title = "metadata only";`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";
import { title } from "./metadata-dependency";

export const metadata = { title };

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );
    const state = globalThis as { __mreactMetadataDependencyLoaded?: number | undefined };
    state.__mreactMetadataDependencyLoaded = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });
    const pageArtifact = await readBuiltServerModuleArtifact<{
      loader?: { code?: string };
      routeMetadata?: { code?: string };
      request?: { code?: string };
    }>(outDir, "page.tsx");

    expect(pageArtifact?.loader?.code).not.toContain("metadata-dependency");
    expect(pageArtifact?.routeMetadata?.code).toContain("metadata-dependency");
    expect(pageArtifact?.request).toBeUndefined();
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(state.__mreactMetadataDependencyLoaded).toBe(0);
  });

  test("writes layout metadata artifacts without duplicate request artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-layout-metadata-split-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export const metadata = { title: "Layout title" };

export default function Layout() {
  return <html><head></head><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>page</main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const layoutArtifact = await readBuiltServerModuleArtifact<{
      routeMetadata?: { code?: string };
      request?: { code?: string };
    }>(outDir, "layout.tsx");

    expect(layoutArtifact?.routeMetadata?.code).toContain("Layout title");
    expect(layoutArtifact?.request).toBeUndefined();
    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(await response.text()).toContain("<title>Layout title</title>");
  });

  test("does not load matched page artifacts before middleware can redirect", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-middleware-short-circuit-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `export function middleware() {
  return new Response(null, { status: 303, headers: { location: "/login" } });
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>should not render</main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
      serverModuleFiles?: Record<string, string>;
      serverModuleRenderFiles?: Record<string, string>;
    };
    const pageArtifact =
      manifest.serverModuleRenderFiles?.["page.tsx"] ?? manifest.serverModuleFiles?.["page.tsx"];
    expect(pageArtifact).toBeDefined();
    await rm(join(outDir, "server", pageArtifact ?? ""));

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });

  test("splits built request artifacts from render artifacts for loader redirects", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-request-render-split-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  globalThis.__mreactRenderArtifactLoaded = (globalThis.__mreactRenderArtifactLoaded ?? 0) + 1;
  return <main>should not render</main>;
}`,
    );
    const state = globalThis as { __mreactRenderArtifactLoaded?: number | undefined };
    state.__mreactRenderArtifactLoaded = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });
    const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
      serverModuleRenderFiles?: Record<string, string>;
      serverModuleRequestFiles?: Record<string, string>;
    };
    const requestArtifact = manifest.serverModuleRequestFiles?.["page.tsx"];
    const renderArtifact = manifest.serverModuleRenderFiles?.["page.tsx"];

    expect(requestArtifact).toMatch(/^server-modules\/request\/[a-f0-9]{16}\.json$/);
    expect(renderArtifact).toMatch(/^server-modules\/render\/[a-f0-9]{16}\.json$/);
    expect(requestArtifact).not.toBe(renderArtifact);
    await rm(join(outDir, "server", renderArtifact ?? ""));

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(state.__mreactRenderArtifactLoaded).toBe(0);
  });

  test("stores prebuilt server module code as module files outside artifact JSON", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-module-code-files-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export function loader() {
  return { message: "module-file" };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
      serverModuleRenderFiles?: Record<string, string>;
      serverModuleRequestFiles?: Record<string, string>;
    };
    const requestArtifactText = await readFile(
      join(outDir, "server", manifest.serverModuleRequestFiles?.["page.tsx"] ?? ""),
      "utf8",
    );
    const renderArtifactText = await readFile(
      join(outDir, "server", manifest.serverModuleRenderFiles?.["page.tsx"] ?? ""),
      "utf8",
    );
    const requestArtifact = JSON.parse(requestArtifactText) as {
      loader?: { code?: string; moduleFile?: string };
    };
    const renderArtifact = JSON.parse(renderArtifactText) as {
      string?: { bundleCode?: string; moduleFile?: string };
    };

    expect(requestArtifact.loader?.moduleFile).toMatch(
      /^server-modules\/code\/[a-f0-9]{16}\.mjs$/,
    );
    expect(renderArtifact.string?.moduleFile).toMatch(
      /^server-modules\/code\/[a-f0-9]{16}\.mjs$/,
    );
    expect(requestArtifact.loader?.code ?? "").not.toContain("module-file");
    expect(renderArtifact.string?.bundleCode).toBeUndefined();

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    expect(await response.text()).toContain("<main>module-file</main>");
  });

  test("preloads built request modules serially to limit peak memory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-preload-serial-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "slow"), { recursive: true });
    const routeSource = (name: string) => `const state = globalThis;
state.__mreactBuiltPreloadActive = (state.__mreactBuiltPreloadActive ?? 0) + 1;
state.__mreactBuiltPreloadMaxActive = Math.max(
  state.__mreactBuiltPreloadMaxActive ?? 0,
  state.__mreactBuiltPreloadActive,
);
await new Promise((resolve) => setTimeout(resolve, 20));
state.__mreactBuiltPreloadActive -= 1;

export function loader() {
  return { message: ${JSON.stringify(name)} };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}`;
    await writeFile(join(appDir, "page.tsx"), routeSource("home"));
    await writeFile(join(appDir, "slow", "page.tsx"), routeSource("slow"));
    const state = globalThis as {
      __mreactBuiltPreloadActive?: number | undefined;
      __mreactBuiltPreloadMaxActive?: number | undefined;
    };
    state.__mreactBuiltPreloadActive = 0;
    state.__mreactBuiltPreloadMaxActive = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });
    await preloadBuiltAppRuntime({ outDir });

    expect(state.__mreactBuiltPreloadMaxActive).toBe(1);
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

  test("uses built route source analysis summaries during first render", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-built-route-analysis-summary-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const events: Array<{ phases?: Record<string, number>; type: string }> = [];
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = { title: "Built summary" };
export const revalidate = 60;

export function loader() {
  return { message: "summary" };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["node"] });
    const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
      serverModuleFiles?: Record<string, string>;
      serverModuleRequestFiles?: Record<string, string>;
    };
    const artifactFile =
      manifest.serverModuleRequestFiles?.["page.tsx"] ?? manifest.serverModuleFiles?.["page.tsx"];

    expect(artifactFile).toBeDefined();
    const artifact = JSON.parse(
      await readFile(join(outDir, "server", artifactFile ?? ""), "utf8"),
    ) as { analysis?: unknown };

    expect(artifact.analysis).toEqual(
      expect.objectContaining({
        hasLoader: true,
        routePath: "/",
        streamRoute: false,
      }),
    );

    const response = await renderBuiltAppRequest({
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      outDir,
      request: new Request("http://local.test/"),
    });
    await response.text();
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(timing?.phases).toEqual(
      expect.objectContaining({
        sourceAnalysisArtifactMs: expect.any(Number),
      }),
    );
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

  test("started server renders imported server component dependencies from bundled artifacts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-start-server-bundled-artifact-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "message.ts"), `export const message = "Artifact dependency";`);
    await writeFile(
      join(appDir, "page.tsx"),
      `import { message } from "./message";

export default function Page() {
  return <main>{message}</main>;
}`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const server = await startServer({ outDir, port: 0 });

    try {
      await writeFile(
        join(outDir, "server", "runtime", "app", "message.ts"),
        `export const message = "Mutated dependency";`,
      );

      expect(await (await fetch(`${server.url}/`)).text()).toContain(
        "<main>Artifact dependency</main>",
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

async function writeFakePackage(rootDir: string, name: string, source: string): Promise<void> {
  await writeFakePackageWithJson(rootDir, name, {
    exports: "./index.js",
    name,
    type: "module",
  }, source);
}

async function writeFakePackageWithJson(
  rootDir: string,
  name: string,
  packageJson: Record<string, unknown>,
  source: string,
): Promise<void> {
  const packageDir = join(rootDir, "node_modules", name);
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), JSON.stringify(packageJson));
  await writeFile(join(packageDir, "index.js"), source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInputValue(html: string, name: string): string {
  const match = html.match(
    new RegExp(`<input[^>]+name="${escapeRegExp(name)}"[^>]+value="(?<value>[^"]*)"`, "u"),
  );
  const value = match?.groups?.value;

  if (value === undefined) {
    throw new Error(`Missing input ${name}`);
  }

  return value;
}
