import { describe, expect, test } from "vitest";
import { modularReact } from "../src/index.js";

describe("modularReact compat mode", () => {
  test("passes compat mode to compiler for client transforms", async () => {
    const plugin = modularReact({ mode: "compat" });
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
      'export function App() { return <div id="app">Compat</div>; }',
      "/src/App.tsx",
      { ssr: false },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain(
      "@modular-react/react-compat/jsx-runtime",
    );
    expect((result as { code: string }).code).toContain("_jsx");
  });

  test("transforms compat mode for server rendering", async () => {
    const plugin = modularReact({ mode: "compat" });
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
      "export function App() { return <div>Hello</div>; }",
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain("export function App()");
    expect((result as { code: string }).code).toContain("\"<div>\" + \"Hello\" + \"</div>\"");
  });
});
