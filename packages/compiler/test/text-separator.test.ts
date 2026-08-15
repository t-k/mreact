import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

describe("compiler SSR text separators", () => {
  test("string and stream outputs preserve adjacent text boundaries", async () => {
    const source = `export function App({ name }) {
      return <p>Hello, {name}{0}{""}</p>;
    }`;
    const stringOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const streamOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      serverOutput: "stream",
      dev: false,
    });
    const expected = "<p>Hello, <!-- -->Ada<!-- -->0</p>";

    expect(stringOutput.diagnostics).toEqual([]);
    expect(streamOutput.diagnostics).toEqual([]);
    expect(runServerComponent(stringOutput.code, "App", { name: "Ada" })).toBe(expected);
    await expect(runServerStreamComponent(streamOutput.code, "App", { name: "Ada" })).resolves.toBe(
      expected,
    );
  });
});
