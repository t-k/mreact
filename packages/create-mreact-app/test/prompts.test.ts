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
        { label: "tailwind", value: "tailwind" },
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

  test("renders every choice and marks the active one as the cursor moves", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let rendered = "";
    output.on("data", (chunk: Buffer) => {
      rendered += chunk.toString();
    });

    const pending = select({
      choices: [
        { label: "basic", value: "basic" },
        { label: "tailwind", value: "tailwind" },
        { label: "dashboard", value: "dashboard" },
      ],
      input,
      message: "Template",
      output,
    });

    pump(input, DOWN, ENTER);
    await pending;

    expect(rendered).toContain("Template");
    expect(rendered).toContain("basic");
    expect(rendered).toContain("tailwind");
    expect(rendered).toContain("dashboard");
    // Initial frame points at the first choice; after one DOWN, at the second.
    expect(rendered).toContain("> basic");
    expect(rendered).toContain("> tailwind");
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
