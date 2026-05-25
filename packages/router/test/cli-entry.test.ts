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
    await writeFile(
      join(appDir, "package.json"),
      JSON.stringify({ name: "mreact-cli-test" }),
    );
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
      expect(errorSpy).toHaveBeenCalledWith(
        "Unknown command: totally-not-a-command",
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

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

  test("passes the dev port option to startDevServer", async () => {
    const startDevServer = vi.fn(async () => ({
      close: async () => undefined,
      server: {},
      url: "http://localhost:15174",
    }));
    vi.doMock("../src/dev-server.js", () => ({ startDevServer }));
    process.argv = [process.argv[0]!, "cli.ts", "dev", appDir, "--port", "15174"];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(startDevServer).toHaveBeenCalledWith(
        expect.objectContaining({
          appDir,
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
    ];
    const previousExitCode = process.exitCode;
    try {
      await import("../src/cli.ts");
      expect(packageCloudflarePagesArtifact).toHaveBeenCalledWith({
        fromDir: expect.stringMatching(/\.mreact$/),
        outDir: expect.stringMatching(/\.mreact\/pages$/),
      });
      expect(logSpy).toHaveBeenCalledWith(
        "Packaged Cloudflare Pages artifact with 1 files (12 bytes).",
      );
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
});
