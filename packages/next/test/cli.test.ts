import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

describe("@modular-react/next CLI entry", () => {
  const originalArgv = process.argv;
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  let rootDir: string;

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "mreact-next-cli-"));
    await writeFile(
      join(rootDir, "Counter.mreact.tsx"),
      `export function Counter() {\n  return <button>0</button>;\n}\n`,
    );
    process.argv = [process.argv[0]!, "cli.ts", rootDir];
  });

  afterAll(() => {
    process.argv = originalArgv;
    logSpy.mockRestore();
  });

  test("compiles the .mreact.tsx components beneath the directory passed as argv", async () => {
    await import("../src/cli.ts");

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("Counter.mreact.tsx -> Counter.tsx");
  });
});
