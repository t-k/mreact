import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { withStandaloneSmokeWorkspace } from "./standalone-tarball-smoke-workspace.mjs";

describe("standalone tarball smoke workspace", () => {
  test("keeps packed artifacts inside the run-specific temporary directory", async () => {
    const source = await readFile(
      new URL("./standalone-tarball-smoke.mjs", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain('join(rootDir, "dist", "npm-standalone-smoke")');
    expect(source).toContain("withStandaloneSmokeWorkspace");
  });

  test("one concurrent run cannot remove another run's packed artifacts", async () => {
    const parentDir = await mkdtemp(join(tmpdir(), "mreact-smoke-workspace-test-"));
    let firstWorkspace;
    let resolveFirstReady;
    let resolveSecondCleaned;
    const firstReady = new Promise((resolve) => {
      resolveFirstReady = resolve;
    });
    const secondCleaned = new Promise((resolve) => {
      resolveSecondCleaned = resolve;
    });

    try {
      const firstRun = withStandaloneSmokeWorkspace(
        async (workspace) => {
          firstWorkspace = workspace;
          await mkdir(workspace.packDir, { recursive: true });
          await writeFile(join(workspace.packDir, "first.tgz"), "first");
          resolveFirstReady();
          await secondCleaned;
          await expect(readFile(join(workspace.packDir, "first.tgz"), "utf8")).resolves.toBe(
            "first",
          );
        },
        { temporaryDirectory: parentDir },
      );

      await firstReady;
      let secondWorkspace;
      await withStandaloneSmokeWorkspace(
        async (workspace) => {
          secondWorkspace = workspace;
          await mkdir(workspace.packDir, { recursive: true });
          await writeFile(join(workspace.packDir, "second.tgz"), "second");
          expect(workspace.packDir).not.toBe(firstWorkspace.packDir);
        },
        { temporaryDirectory: parentDir },
      );
      resolveSecondCleaned();
      await firstRun;

      await expect(access(firstWorkspace.smokeDir)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(secondWorkspace.smokeDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(parentDir, { force: true, recursive: true });
    }
  });

  test("removes packed artifacts and the consumer after a failed run", async () => {
    const parentDir = await mkdtemp(join(tmpdir(), "mreact-smoke-workspace-failure-test-"));
    let failedWorkspace;

    try {
      await expect(
        withStandaloneSmokeWorkspace(
          async (workspace) => {
            failedWorkspace = workspace;
            await mkdir(workspace.packDir, { recursive: true });
            await mkdir(workspace.appDir, { recursive: true });
            await writeFile(join(workspace.packDir, "packed.tgz"), "packed");
            throw new Error("forced failure after packing");
          },
          { temporaryDirectory: parentDir },
        ),
      ).rejects.toThrow("forced failure after packing");
      await expect(access(failedWorkspace.smokeDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(parentDir, { force: true, recursive: true });
    }
  });
});
