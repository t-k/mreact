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
      "@reckona/mreact-compat/jsx-runtime",
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
    expect((result as { code: string }).code).toContain("_out += \"<div\";");
    expect((result as { code: string }).code).toContain("_out += \"</div>\";");
  });

  test("forwards server hydration option for SSR transforms", async () => {
    const plugin = modularReact({ serverHydration: true });
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
      "export function App() { return <main>Hello</main>; }",
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain("mreact-h:start:App");
  });

  test("emits VDOM fallback warnings and callbacks when compatDiagnostics is enabled", async () => {
    const warnings: unknown[] = [];
    const reports: Array<{ filename: string; entries: unknown[] }> = [];
    const plugin = modularReact({
      mode: "compat",
      compatDiagnostics: "warn",
      onCompatLowering(filename, entries) {
        reports.push({ filename, entries });
      },
    });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn(warning: unknown) {
          warnings.push(warning);
        },
      } as never,
      "export function Fast(props) { return <span>{props.label}</span>; }\nexport function Fallback(props) { return <input value={props.value} />; }",
      "/src/Widget.compat.tsx",
      { ssr: false },
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.filename).toBe("/src/Widget.compat.tsx");
    expect(warnings).toEqual([
      expect.objectContaining({
        id: "/src/Widget.compat.tsx",
        message: expect.stringContaining("MR_COMPAT_VDOM_FALLBACK"),
      }),
    ]);
    expect((warnings[0] as { message: string }).message).toContain("Fallback");
    expect((warnings[0] as { message: string }).message).toContain("unsupported-dynamic-attribute");
    expect((warnings[0] as { message: string }).message).not.toContain("Fast");
  });

  test("stays silent about compat VDOM fallbacks by default", async () => {
    const warnings: unknown[] = [];
    const plugin = modularReact({ mode: "compat" });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn(warning: unknown) {
          warnings.push(warning);
        },
      } as never,
      "export function Fallback(props) { return <input value={props.value} />; }",
      "/src/Widget.compat.tsx",
      { ssr: false },
    );

    expect(warnings).toEqual([]);
  });

  test("warns for compat class components when compatDiagnostics is enabled", async () => {
    const warnings: unknown[] = [];
    const plugin = modularReact({ mode: "compat", compatDiagnostics: "warn" });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn(warning: unknown) {
          warnings.push(warning);
        },
      } as never,
      'import { Component } from "@reckona/mreact-compat";\nexport class Legacy extends Component { render() { return <div />; } }',
      "/src/Legacy.compat.tsx",
      { ssr: false },
    );

    expect(warnings).toEqual([
      expect.objectContaining({
        id: "/src/Legacy.compat.tsx",
        message: expect.stringContaining("class-component"),
      }),
    ]);
  });
});
