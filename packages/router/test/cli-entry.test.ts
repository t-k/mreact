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
});
