import { describe, expect, test } from "vitest";
import { modularReact } from "../src/index.js";

describe("modularReact vite plugin transform", () => {
  test("transforms tsx files through compiler client target", async () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      'export function App() { return <div id="app">Hello</div>; }',
      "/src/App.tsx",
      { ssr: false },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain("createTemplate");
    expect((result as { code: string }).code).toContain("export function App()");
  });

  test("ignores non jsx modules", async () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {} as never,
      "export const x = 1;",
      "/src/value.ts",
    );

    expect(result).toBeNull();
  });

  test("forwards server stream output mode for ssr transforms", async () => {
    const plugin = modularReact({ serverOutput: "stream" });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      'export function App() { return <div id="app">Hello stream</div>; }',
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain(".append(");
    expect((result as { code: string }).code).toContain("Hello stream");
  });
});
