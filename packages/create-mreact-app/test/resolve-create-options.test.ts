import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import type { CreateMreactAppCreateCliOptions } from "../src/cli-args.js";
import { resolveCreateOptions } from "../src/resolve-create-options.js";

const ESC = String.fromCharCode(27);
const ENTER = "\r";
const DOWN = `${ESC}[B`;

function parsed(
  overrides: Partial<CreateMreactAppCreateCliOptions> = {},
): CreateMreactAppCreateCliOptions {
  return { command: "create", ...overrides };
}

describe("resolveCreateOptions (non-TTY)", () => {
  test("fills every missing option with its default and never prompts", async () => {
    const resolved = await resolveCreateOptions(parsed(), {
      env: {},
      isTTY: false,
    });

    expect(resolved).toEqual({
      deploy: undefined,
      directory: "mreact-app",
      packageManager: "pnpm",
      srcDir: false,
      template: "app-router",
    });
  });

  test("passes provided flags through unchanged", async () => {
    const resolved = await resolveCreateOptions(
      parsed({
        deploy: "container",
        directory: "shop",
        packageManager: "npm",
        srcDir: true,
        template: "cloudflare",
      }),
      { env: {}, isTTY: false },
    );

    expect(resolved).toEqual({
      deploy: "container",
      directory: "shop",
      packageManager: "npm",
      srcDir: true,
      template: "cloudflare",
    });
  });

  test("defaults the package manager to the one detected from the user agent", async () => {
    const resolved = await resolveCreateOptions(parsed(), {
      env: { npm_config_user_agent: "bun/1.1.0 npm/? node/v22.0.0" },
      isTTY: false,
    });

    expect(resolved.packageManager).toBe("bun");
  });
});

describe("resolveCreateOptions (interactive TTY)", () => {
  test("prompts only for the options not already provided as flags", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = resolveCreateOptions(
      // template + package manager provided as flags -> only directory, src-dir, deploy prompt.
      parsed({ packageManager: "npm", template: "app-router-tailwind" }),
      { env: {}, input, isTTY: true, output },
    );

    // directory (text): type a name
    input.write("storefront\r");
    // src-dir (select No/Yes): move to Yes
    input.write(DOWN);
    input.write(ENTER);
    // deploy (select none/container/aws-lambda): move to container
    input.write(DOWN);
    input.write(ENTER);

    expect(await pending).toEqual({
      deploy: "container",
      directory: "storefront",
      packageManager: "npm",
      srcDir: true,
      template: "app-router-tailwind",
    });
  });

  test("defaults the template prompt to app-router, matching non-interactive mode", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = resolveCreateOptions(
      // Only the template (and deploy) are left to prompt.
      parsed({ directory: "demo", packageManager: "pnpm", srcDir: false }),
      { env: {}, input, isTTY: true, output },
    );

    // Accept the template prompt as-is, then accept "none" for deploy.
    input.write(ENTER);
    input.write(ENTER);

    expect((await pending).template).toBe("app-router");
  });

  test("places the detected package manager under the initial cursor", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = resolveCreateOptions(
      // Everything provided except the package manager.
      parsed({ deploy: undefined, directory: "edge", srcDir: false, template: "cloudflare" }),
      {
        env: { npm_config_user_agent: "bun/1.1.0 node/v22.0.0" },
        input,
        isTTY: true,
        output,
      },
    );

    // Accepting the package manager prompt immediately should pick the detected one.
    input.write(ENTER);
    // deploy still prompts (no flag): accept "none".
    input.write(ENTER);

    expect((await pending).packageManager).toBe("bun");
  });
});
