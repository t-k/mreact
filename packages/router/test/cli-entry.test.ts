import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

describe("router CLI entry", () => {
  const originalArgv = process.argv;
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let appDir: string;

  beforeAll(async () => {
    appDir = await mkdtemp(join(tmpdir(), "mreact-router-cli-"));
    await writeFile(join(appDir, "package.json"), JSON.stringify({ name: "mreact-cli-test" }));
  });

  afterEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
    process.argv = originalArgv;
    vi.resetModules();
  });

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.argv = originalArgv;
  });

  test("emits an error for an unknown command and sets process.exitCode = 1", async () => {
    process.argv = [process.argv[0]!, "cli.ts", "totally-not-a-command"];
    const previousExitCode = process.exitCode;
    try {
      // Importing the CLI module triggers its top-level `await` flow.
      await import("../src/cli.ts");
      expect(errorSpy).toHaveBeenCalledWith("Unknown command: totally-not-a-command");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  }, 15_000);

  test("prints help without loading a project", async () => {
    process.argv = [process.argv[0]!, "cli.ts", "--help"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: mreact-router"));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("mreact-router build --target=aws-lambda"),
      );
      expect(errorSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(previousExitCode);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("prints route and component boundaries without building", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-boundaries-text-"));
    await writeFile(
      join(rootDir, "page.tsx"),
      `import Counter from "./Counter.client";
import { MissingPanel } from "./MissingPanel";

export default function Page() {
  return <main><Counter /><MissingPanel /></main>;
}`,
    );
    await writeFile(
      join(rootDir, "Counter.client.tsx"),
      `export default function Counter() {
  return <button type="button">Count</button>;
}`,
    );
    process.argv = [process.argv[0]!, "cli.ts", "boundaries", rootDir];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/ [server-render]"));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Counter.client.tsx#default  client-boundary"),
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("MissingPanel  unknown"));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("MR_CLIENT_BOUNDARY_INFERENCE_UNRESOLVED_REFERENCE"),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("prints one JSON document for boundaries --json", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-boundaries-json-"));
    await writeFile(
      join(rootDir, "page.tsx"),
      `export default function Page() {
  return <main>Home</main>;
}`,
    );
    process.argv = [process.argv[0]!, "cli.ts", "boundaries", rootDir, "--json"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual(
        expect.objectContaining({
          routes: [
            expect.objectContaining({
              classification: "server-render",
              path: "/",
            }),
          ],
          version: 1,
        }),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("prints detailed boundaries with build progress and a duration summary", async () => {
    const buildApp = vi.fn(
      async (options: {
        onBoundaryReport?: (report: {
          diagnostics: readonly [];
          routes: readonly [
            {
              classification: "server-render";
              components: readonly [
                {
                  classification: "server-render";
                  exportName: "default";
                  file: "app/page.tsx";
                  origin: "server-render";
                },
              ];
              entry: "app/page.tsx";
              path: "/";
            },
          ];
          summary: {
            clientBoundaries: 0;
            clientRoutes: 0;
            serverOnlyComponents: 0;
            serverRenderComponents: 1;
            serverRenderRoutes: 1;
            sharedComponents: 0;
            unknownComponents: 0;
          };
          version: 1;
        }) => void;
        onBuildProgress?: (event: {
          count?: number;
          kind: string;
          ms?: number;
          phase?: string;
        }) => void;
      }) => {
        options.onBuildProgress?.({ kind: "phase-start", phase: "scan" });
        options.onBuildProgress?.({ kind: "phase-end", ms: 2.5, phase: "scan" });
        options.onBuildProgress?.({ count: 2, kind: "routes-discovered" });
        options.onBoundaryReport?.({
          diagnostics: [],
          routes: [
            {
              classification: "server-render",
              components: [
                {
                  classification: "server-render",
                  exportName: "default",
                  file: "app/page.tsx",
                  origin: "server-render",
                },
              ],
              entry: "app/page.tsx",
              path: "/",
            },
          ],
          summary: {
            clientBoundaries: 0,
            clientRoutes: 0,
            serverOnlyComponents: 0,
            serverRenderComponents: 1,
            serverRenderRoutes: 1,
            sharedComponents: 0,
            unknownComponents: 0,
          },
          version: 1,
        });
        options.onBuildProgress?.({ kind: "phase-start", phase: "serverModules" });
        options.onBuildProgress?.({ kind: "phase-end", ms: 10, phase: "serverModules" });
        options.onBuildProgress?.({ kind: "phase-start", phase: "clientBundles" });
        options.onBuildProgress?.({ kind: "phase-end", ms: 11, phase: "clientBundles" });
        options.onBuildProgress?.({ kind: "phase-start", phase: "writeManifests" });
        options.onBuildProgress?.({ kind: "phase-end", ms: 1, phase: "writeManifests" });

        return { routes: [{ path: "/" }, { path: "/about" }] };
      },
    );
    vi.doMock("../src/build.js", () => ({
      buildApp,
      packageAwsLambdaArtifact: vi.fn(),
      packageCloudflarePagesArtifact: vi.fn(),
    }));
    vi.doMock("../src/vite-config.js", () => ({
      loadMreactRouterViteConfigDetails: vi.fn(async () => ({
        project: { projectRoot: appDir, routesDir: appDir },
        viteConfig: undefined,
      })),
    }));
    process.argv = [process.argv[0]!, "cli.ts", "build", "--target=node"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      const messages = logSpy.mock.calls.map((call) => call[0]);

      expect(messages).toEqual([
        expect.stringMatching(/^mreact-router build v/),
        expect.stringMatching(/^Target: node$/),
        expect.stringMatching(/^Root: /),
        "Config: loading...",
        "Routes: discovering...",
        "Routes: 2 discovered",
        expect.stringContaining("app/page.tsx#default  server-render"),
        "Server: building...",
        "Client: building...",
        "Artifacts: writing...",
        expect.stringMatching(/^Built 2 routes in \d+(?:\.\d+)?s\.$/),
      ]);
      expect(buildApp).toHaveBeenCalledWith(
        expect.objectContaining({
          outDir: expect.stringMatching(/\.mreact$/),
          targets: ["node"],
        }),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("prints the active build phase when build fails", async () => {
    vi.doMock("../src/build.js", () => ({
      buildApp: vi.fn(
        async (options: {
          onBuildProgress?: (event: { kind: string; phase?: string }) => void;
        }) => {
          options.onBuildProgress?.({ kind: "phase-start", phase: "clientBundles" });
          throw new Error("client transform failed");
        },
      ),
      packageAwsLambdaArtifact: vi.fn(),
      packageCloudflarePagesArtifact: vi.fn(),
    }));
    vi.doMock("../src/vite-config.js", () => ({
      loadMreactRouterViteConfigDetails: vi.fn(async () => ({
        project: { projectRoot: appDir, routesDir: appDir },
        viteConfig: undefined,
      })),
    }));
    process.argv = [process.argv[0]!, "cli.ts", "build", "--target=node"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");

      expect(errorSpy).toHaveBeenCalledWith(
        "Build failed during client output build: client transform failed",
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("passes the start host option to startServer", async () => {
    const startServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://0.0.0.0:3001",
    }));
    vi.doMock("../src/serve.js", () => ({ startServer }));
    process.argv = [process.argv[0]!, "cli.ts", "start", ".mreact", "--host", "0.0.0.0"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "0.0.0.0",
          outDir: expect.stringMatching(/\.mreact$/),
          port: 3001,
        }),
      );
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("passes the start port option to startServer", async () => {
    const startServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://127.0.0.1:8080",
    }));
    vi.doMock("../src/serve.js", () => ({ startServer }));
    process.argv = [process.argv[0]!, "cli.ts", "start", ".mreact", "--port", "8080"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          outDir: expect.stringMatching(/\.mreact$/),
          port: 8080,
        }),
      );
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("passes the dev host and port options to startDevServer", async () => {
    const startDevServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://0.0.0.0:15174",
    }));
    vi.doMock("../src/dev-server.js", () => ({ startDevServer }));
    process.argv = [
      process.argv[0]!,
      "cli.ts",
      "dev",
      appDir,
      "--host",
      "0.0.0.0",
      "--port",
      "15174",
    ];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          appDir,
          hostname: "0.0.0.0",
          port: 15174,
        }),
      );
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("packages Cloudflare Pages output from the CLI", async () => {
    const packageCloudflarePagesArtifact = vi.fn(async () => ({
      files: [{ bytes: 12, path: "_worker.js" }],
      runtime: "cloudflare-pages",
      totalBytes: 12,
      version: 1,
      worker: "_worker.js",
    }));
    vi.doMock("../src/build.js", () => ({
      buildApp: vi.fn(),
      packageAwsLambdaArtifact: vi.fn(),
      packageCloudflarePagesArtifact,
    }));
    process.argv = [
      process.argv[0]!,
      "cli.ts",
      "package",
      "cloudflare-pages",
      "--from",
      ".mreact",
      "--out",
      ".mreact/pages",
      "--worker",
      "src/worker.ts",
    ];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(packageCloudflarePagesArtifact).toHaveBeenCalledWith({
        fromDir: expect.stringMatching(/\.mreact$/),
        outDir: expect.stringMatching(/\.mreact\/pages$/),
        workerEntry: expect.stringMatching(/src\/worker\.ts$/),
      });
      expect(logSpy).toHaveBeenCalledWith(
        "Packaged Cloudflare Pages artifact with 1 files (12 bytes).",
      );
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("passes an AWS Lambda custom handler entry to the package command", async () => {
    const packageAwsLambdaArtifact = vi.fn(async () => ({
      files: [{ bytes: 12, path: "mreact-handler.mjs" }],
      handler: "mreact-handler.handler",
      runtime: "aws-lambda",
      totalBytes: 12,
      version: 1,
    }));
    vi.doMock("../src/build.js", () => ({
      buildApp: vi.fn(),
      packageAwsLambdaArtifact,
      packageCloudflarePagesArtifact: vi.fn(),
    }));
    process.argv = [
      process.argv[0]!,
      "cli.ts",
      "package",
      "aws-lambda",
      "--from",
      ".mreact",
      "--out",
      ".lambda",
      "--handler",
      "lambda/mreact-handler.ts",
      "--aws-lambda-preload",
      "hot-route-requests",
    ];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(packageAwsLambdaArtifact).toHaveBeenCalledWith({
        awsLambdaPreload: "hot-route-requests",
        fromDir: expect.stringMatching(/\.mreact$/),
        handlerEntry: expect.stringMatching(/lambda\/mreact-handler\.ts$/),
        outDir: expect.stringMatching(/\.lambda$/),
        skipRuntimeDependencyCheck: undefined,
      });
      expect(logSpy).toHaveBeenCalledWith("Packaged AWS Lambda artifact with 1 files (12 bytes).");
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  test("uses HOST for start host binding unless the flag is set", async () => {
    const startServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://0.0.0.0:3001",
    }));
    vi.doMock("../src/serve.js", () => ({ startServer }));
    vi.stubEnv("HOST", "127.0.0.1");
    process.argv = [process.argv[0]!, "cli.ts", "start", "--host=0.0.0.0"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "0.0.0.0",
        }),
      );
    } finally {
      vi.unstubAllEnvs();
      process.exitCode = previousExitCode;
    }
  });

  test("passes start Host header trust options to startServer", async () => {
    const startServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://0.0.0.0:3001",
    }));
    vi.doMock("../src/serve.js", () => ({ startServer }));
    vi.stubEnv("MREACT_ROUTER_HOST_POLICY", "strict");
    vi.stubEnv("MREACT_ROUTER_ALLOWED_HOSTS", "app.example.com,www.example.com");
    process.argv = [process.argv[0]!, "cli.ts", "start", "--host", "0.0.0.0"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedHosts: ["app.example.com", "www.example.com"],
          hostPolicy: "strict",
          hostname: "0.0.0.0",
        }),
      );
    } finally {
      vi.unstubAllEnvs();
      process.exitCode = previousExitCode;
    }
  });

  test("passes forwarded protocol trust to startServer", async () => {
    const startServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://0.0.0.0:3001",
    }));
    vi.doMock("../src/serve.js", () => ({ startServer }));
    vi.stubEnv("MREACT_ROUTER_TRUST_FORWARDED_PROTO", "1");
    process.argv = [process.argv[0]!, "cli.ts", "start"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({ trustForwardedProto: true }),
      );
    } finally {
      vi.unstubAllEnvs();
      process.exitCode = previousExitCode;
    }
  });
});
