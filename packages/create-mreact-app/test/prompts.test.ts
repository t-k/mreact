import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { select } from "../src/prompts.js";

const ESC = String.fromCharCode(27);
const ENTER = "\r";
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const CTRL_C = String.fromCharCode(3);

function pump(stream: PassThrough, ...keys: string[]): void {
  for (const key of keys) {
    stream.write(key);
  }
}

describe("select prompt", () => {
  test("returns the first choice when Enter is pressed immediately", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = select({
      choices: [
        { label: "basic", value: "basic" },
        { label: "app-router", value: "app-router" },
      ],
      input,
      message: "Template",
      output,
    });

    pump(input, ENTER);

    expect(await pending).toBe("basic");
  });

  test("moves down with the arrow key before selecting", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = select({
      choices: [
        { label: "pnpm", value: "pnpm" },
        { label: "npm", value: "npm" },
        { label: "bun", value: "bun" },
      ],
      input,
      message: "Package manager",
      output,
    });

    pump(input, DOWN, DOWN, ENTER);

    expect(await pending).toBe("bun");
  });

  test("starts at initialIndex and wraps with up arrow", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = select({
      choices: [
        { label: "pnpm", value: "pnpm" },
        { label: "npm", value: "npm" },
        { label: "bun", value: "bun" },
      ],
      initialIndex: 0,
      input,
      message: "Package manager",
      output,
    });

    // Up from index 0 wraps to the last choice.
    pump(input, UP, ENTER);

    expect(await pending).toBe("bun");
  });

  test("starts at the provided initialIndex", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = select({
      choices: [
        { label: "pnpm", value: "pnpm" },
        { label: "npm", value: "npm" },
        { label: "bun", value: "bun" },
      ],
      initialIndex: 1,
      input,
      message: "Package manager",
      output,
    });

    pump(input, ENTER);

    expect(await pending).toBe("npm");
  });

  test("rejects with a cancellation error on Ctrl+C", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const pending = select({
      choices: [{ label: "basic", value: "basic" }],
      input,
      message: "Template",
      output,
    });

    pump(input, CTRL_C);

    await expect(pending).rejects.toThrowError("Prompt cancelled.");
  });
});
