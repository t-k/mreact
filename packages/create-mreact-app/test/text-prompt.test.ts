import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { text } from "../src/prompts.js";

describe("text prompt", () => {
  test("returns the typed value", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = text({
      defaultValue: "mreact-app",
      input,
      message: "Project directory",
      output,
    });

    input.write("my-shop\r");

    expect(await pending).toBe("my-shop");
  });

  test("falls back to the default when the input is empty", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = text({
      defaultValue: "mreact-app",
      input,
      message: "Project directory",
      output,
    });

    input.write("\r");

    expect(await pending).toBe("mreact-app");
  });

  test("trims surrounding whitespace from the typed value", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = text({
      defaultValue: "mreact-app",
      input,
      message: "Project directory",
      output,
    });

    input.write("  spaced  \r");

    expect(await pending).toBe("spaced");
  });
});
