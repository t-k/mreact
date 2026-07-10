import { execFileSync, spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

describe("router CLI package launcher", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
    );
  });

  test("uses a tracked launcher that exists before the first workspace build", async () => {
    const packageDirectory = join(process.cwd(), "packages", "router");
    const manifest = JSON.parse(
      await readFile(join(packageDirectory, "package.json"), "utf8"),
    ) as { bin?: Record<string, string>; files?: string[] };

    expect(manifest.bin?.["mreact-router"]).toBe("./bin/mreact-router.js");
    expect(manifest.files).toContain("bin/**/*.js");
    await expect(access(join(packageDirectory, "bin", "mreact-router.js"))).resolves.toBeUndefined();
  });

  test("reports an actionable error when invoked before the CLI has been built", async () => {
    const sourceLauncher = join(
      process.cwd(),
      "packages",
      "router",
      "bin",
      "mreact-router.js",
    );
    const isolatedPackage = await mkdtemp(join(tmpdir(), "mreact-router-launcher-"));
    temporaryDirectories.push(isolatedPackage);
    await mkdir(join(isolatedPackage, "bin"), { recursive: true });
    await copyFile(sourceLauncher, join(isolatedPackage, "bin", "mreact-router.js"));

    const result = spawnSync(process.execPath, [join(isolatedPackage, "bin", "mreact-router.js")], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "mreact-router has not been built yet. Run the workspace or package build before invoking the CLI.",
    );
  });

  test("the built launcher delegates to the public CLI", async () => {
    const launcher = join(process.cwd(), "packages", "router", "bin", "mreact-router.js");
    const output = execFileSync(process.execPath, [launcher, "--help"], { encoding: "utf8" });

    expect(output).toContain("Usage: mreact-router");
  });

  test("a first workspace install links the tracked launcher before dist exists", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "mreact-router-clean-install-"));
    temporaryDirectories.push(workspace);
    const packageDirectory = join(workspace, "packages", "router");
    const consumerDirectory = join(workspace, "consumer");
    await mkdir(join(packageDirectory, "bin"), { recursive: true });
    await mkdir(consumerDirectory, { recursive: true });
    await copyFile(
      join(process.cwd(), "packages", "router", "bin", "mreact-router.js"),
      join(packageDirectory, "bin", "mreact-router.js"),
    );
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({ name: "clean-cli-workspace", private: true }),
    );
    await writeFile(join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "consumer"\n');
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify({
        name: "@reckona/mreact-router",
        version: "0.0.0",
        type: "module",
        bin: { "mreact-router": "./bin/mreact-router.js" },
      }),
    );
    await writeFile(
      join(consumerDirectory, "package.json"),
      JSON.stringify({
        name: "clean-cli-consumer",
        private: true,
        dependencies: { "@reckona/mreact-router": "workspace:*" },
      }),
    );

    execFileSync("corepack", ["pnpm", "install", "--ignore-scripts"], {
      cwd: workspace,
      encoding: "utf8",
    });
    await expect(
      access(join(consumerDirectory, "node_modules", ".bin", "mreact-router")),
    ).resolves.toBeUndefined();
    const beforeBuild = spawnSync(
      "corepack",
      ["pnpm", "--dir", consumerDirectory, "exec", "mreact-router"],
      { encoding: "utf8" },
    );
    expect(beforeBuild.status).toBe(1);
    expect(beforeBuild.stderr).toContain("mreact-router has not been built yet");

    await mkdir(join(packageDirectory, "dist"));
    await writeFile(join(packageDirectory, "dist", "cli.js"), 'console.log("clean linked CLI");\n');
    expect(
      execFileSync(
        "corepack",
        ["pnpm", "--dir", consumerDirectory, "exec", "mreact-router"],
        { encoding: "utf8" },
      ),
    ).toContain("clean linked CLI");
  }, 30_000);
});
