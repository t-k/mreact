import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { runCreateMreactAppCli } from "../src/run-cli.js";

const CTRL_C = String.fromCharCode(3);

function collector(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

describe("runCreateMreactAppCli", () => {
  test("scaffolds non-interactively and reports success", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-run-cli-"));
    const directory = join(root, "demo");
    const stdout = collector();

    const code = await runCreateMreactAppCli([directory], {
      env: {},
      isTTY: false,
      stdout: stdout.write,
    });

    expect(code).toBe(0);
    expect(stdout.lines.join("\n")).toContain("Created mreact app");

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      name?: string;
    };
    expect(packageJson.name).toBe("demo");
  });

  test("prints help and exits zero", async () => {
    const stdout = collector();

    const code = await runCreateMreactAppCli(["--help"], {
      env: {},
      isTTY: false,
      stdout: stdout.write,
    });

    expect(code).toBe(0);
    expect(stdout.lines.join("\n")).toContain("Usage:");
  });

  test("returns exit code 130 when an interactive prompt is cancelled", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const stderr = collector();

    // Directory provided -> the first prompt is the template select; cancel it.
    const pending = runCreateMreactAppCli(["demo"], {
      env: {},
      input,
      isTTY: true,
      output,
      stderr: stderr.write,
    });

    input.write(CTRL_C);

    expect(await pending).toBe(130);
  });
});
