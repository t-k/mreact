import { describe, expect, test } from "vitest";
import {
  createMreactAppHelpText,
  createMreactAppSuccessText,
  parseCreateMreactAppCliArgs,
} from "../src/cli-args.js";

describe("create-mreact-app CLI args", () => {
  test("does not treat option values as the target directory", () => {
    expect(
      parseCreateMreactAppCliArgs(["--template", "app-router-tailwind", "--pm", "pnpm", "demo"]),
    ).toEqual({
      command: "create",
      deploy: undefined,
      directory: "demo",
      packageManager: "pnpm",
      srcDir: undefined,
      template: "app-router-tailwind",
    });
  });

  test("supports equals-form options before the target directory", () => {
    expect(parseCreateMreactAppCliArgs(["--template=cloudflare", "--pm=npm", "edge-app"])).toEqual({
      command: "create",
      deploy: undefined,
      directory: "edge-app",
      packageManager: "npm",
      srcDir: undefined,
      template: "cloudflare",
    });
  });

  test("leaves unprovided options undefined so the wizard can prompt for them", () => {
    expect(parseCreateMreactAppCliArgs([])).toEqual({
      command: "create",
      deploy: undefined,
      directory: undefined,
      packageManager: undefined,
      srcDir: undefined,
      template: undefined,
    });
  });

  test("marks src-dir as provided when the flag is present", () => {
    expect(parseCreateMreactAppCliArgs(["--src-dir", "demo"])).toEqual({
      command: "create",
      deploy: undefined,
      directory: "demo",
      packageManager: undefined,
      srcDir: true,
      template: undefined,
    });
  });

  test("rejects missing option values and multiple directories", () => {
    expect(() => parseCreateMreactAppCliArgs(["--template"])).toThrow(/Missing value.*template/);
    expect(() => parseCreateMreactAppCliArgs(["--pm"])).toThrow(/Missing value.*package manager/);
    expect(() => parseCreateMreactAppCliArgs(["--deploy"])).toThrow(/Missing value.*deploy/);
    expect(() => parseCreateMreactAppCliArgs(["first", "second"])).toThrow(
      /Expected one target directory/,
    );
  });

  test("parses deploy targets", () => {
    expect(parseCreateMreactAppCliArgs(["--deploy", "container", "demo"])).toEqual({
      command: "create",
      deploy: "container",
      directory: "demo",
      packageManager: undefined,
      srcDir: undefined,
      template: undefined,
    });
    expect(parseCreateMreactAppCliArgs(["--deploy=container", "demo"])).toMatchObject({
      deploy: "container",
    });
    expect(parseCreateMreactAppCliArgs(["--deploy", "aws-lambda", "demo"])).toEqual({
      command: "create",
      deploy: "aws-lambda",
      directory: "demo",
      packageManager: undefined,
      srcDir: undefined,
      template: undefined,
    });
    expect(parseCreateMreactAppCliArgs(["--deploy=aws-lambda", "demo"])).toMatchObject({
      deploy: "aws-lambda",
    });
    expect(() => parseCreateMreactAppCliArgs(["--deploy=cloudrun", "demo"])).toThrow(
      /Unknown deploy target/,
    );
  });

  test("supports help output without requiring a target directory", () => {
    expect(parseCreateMreactAppCliArgs(["--help"])).toMatchObject({
      help: true,
    });
    expect(parseCreateMreactAppCliArgs(["-h"])).toMatchObject({
      help: true,
    });

    expect(createMreactAppHelpText()).toContain("Usage:");
    expect(createMreactAppHelpText()).toContain("--template");
    expect(createMreactAppHelpText()).toContain("--package-manager");
    expect(createMreactAppHelpText()).toContain("--deploy");
    expect(createMreactAppHelpText()).toContain("--src-dir");
    expect(createMreactAppHelpText()).toContain("upgrade");
  });

  test("formats post-create next steps with the selected package manager", () => {
    const message = createMreactAppSuccessText({
      directory: "/tmp/demo",
      displayDirectory: "demo",
      packageManager: "pnpm",
      template: "dashboard",
    });

    expect(message).toContain("Created mreact app in /tmp/demo (template: dashboard)");
    expect(message).toContain("Next steps:");
    expect(message).toContain("cd demo");
    expect(message).toContain("pnpm install");
    expect(message).toContain("pnpm dev");
    expect(message).toContain("http://localhost:3001/");
    expect(message).toContain("demo@example.com / kanban1234");
  });

  test("parses the upgrade subcommand", () => {
    expect(
      parseCreateMreactAppCliArgs(["upgrade", "--dry-run", "--from", "0.0.10", "demo"]),
    ).toEqual({
      command: "upgrade",
      directory: "demo",
      dryRun: true,
      fromVersion: "0.0.10",
      help: undefined,
      targetVersion: undefined,
    });
    expect(parseCreateMreactAppCliArgs(["upgrade", "--to=0.0.16"])).toMatchObject({
      command: "upgrade",
      directory: ".",
      targetVersion: "0.0.16",
    });
  });
});
