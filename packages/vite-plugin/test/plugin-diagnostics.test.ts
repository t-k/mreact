import { describe, expect, test } from "vitest";
import { modularReact } from "../src/index.js";

describe("modularReact diagnostics", () => {
  test("throws Vite error for server target in this phase", async () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    expect(() =>
      transform.call(
        {
          error(error: string | Error): never {
            throw typeof error === "string" ? new Error(error) : error;
          },
          warn() {},
        } as never,
        "export function App() { return <div />; }",
        "/src/App.tsx",
        { ssr: true },
      ),
    ).toThrow("MR_UNSUPPORTED_TARGET");
  });

  test("throws Vite error for unsupported JSX syntax", async () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    expect(() =>
      transform.call(
        {
          error(error: string | Error): never {
            throw typeof error === "string" ? new Error(error) : error;
          },
          warn() {},
        } as never,
        "export function App(props) { return <div {...props} />; }",
        "/src/App.tsx",
        { ssr: false },
      ),
    ).toThrow("MR_UNSUPPORTED_SPREAD_ATTRIBUTE");
  });
});
