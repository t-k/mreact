import { execFileSync, spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
});
