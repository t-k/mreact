import { describe, expect, test } from "vitest";
import { parseCreateMreactAppCliArgs } from "../src/cli-args.js";

describe("create-mreact-app CLI args", () => {
  test("does not treat option values as the target directory", () => {
    expect(
      parseCreateMreactAppCliArgs(["--template", "app-router-tailwind", "--pm", "pnpm", "demo"]),
    ).toEqual({
      directory: "demo",
      packageManager: "pnpm",
      srcDir: false,
      template: "app-router-tailwind",
    });
  });

  test("supports equals-form options before the target directory", () => {
    expect(parseCreateMreactAppCliArgs(["--template=cloudflare", "--pm=npm", "edge-app"])).toEqual(
      {
        directory: "edge-app",
        packageManager: "npm",
        srcDir: false,
        template: "cloudflare",
      },
    );
  });

  test("rejects missing option values and multiple directories", () => {
    expect(() => parseCreateMreactAppCliArgs(["--template"])).toThrow(/Missing value.*template/);
    expect(() => parseCreateMreactAppCliArgs(["--pm"])).toThrow(/Missing value.*package manager/);
    expect(() => parseCreateMreactAppCliArgs(["first", "second"])).toThrow(
      /Expected one target directory/,
    );
  });
});
