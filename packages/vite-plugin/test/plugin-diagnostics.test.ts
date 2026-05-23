import { describe, expect, test } from "vitest";
import { modularReact } from "../src/index.js";

describe("modularReact diagnostics", () => {
  test("transforms server target after Phase 5", () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      "export function App() { return <div>Hello SSR</div>; }",
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect((result as { code: string }).code).toContain("Hello SSR");
  });

  test("throws Vite error for unsupported server event handlers", () => {
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
        "export function App() { return <button onClick={() => {}}>Click</button>; }",
        "/src/App.tsx",
        { ssr: true },
      ),
    ).toThrow("MR_UNSUPPORTED_SERVER_EVENT_HANDLER");
  });

  test("allows trusted server dangerouslySetInnerHTML", () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    expect(
      transform.call(
        {
          error(error: string | Error): never {
            throw typeof error === "string" ? new Error(error) : error;
          },
          warn() {},
        } as never,
        "export function App(props) { return <div dangerouslySetInnerHTML={{ __html: props.html }}>Hello</div>; }",
        "/src/App.tsx",
        { ssr: true },
      ),
    ).toEqual(expect.objectContaining({ code: expect.stringContaining("_value.__html") }));
  });

  test("allows server spread attributes", () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    expect(
      transform.call(
        {
          error(error: string | Error): never {
            throw typeof error === "string" ? new Error(error) : error;
          },
          warn() {},
        } as never,
        "export function App(props) { return <div {...props} />; }",
        "/src/App.tsx",
        { ssr: true },
      ),
    ).toEqual(expect.objectContaining({ code: expect.stringContaining("_renderSpreadAttributes") }));
  });
});
