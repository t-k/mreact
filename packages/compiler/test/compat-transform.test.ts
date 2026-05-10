// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runCompatComponent } from "./helpers.js";

describe("compiler compat mode", () => {
  test("emits jsx-runtime imports for a single-child element", async () => {
    const output = transform({
      code: 'export function App() { return <button className="primary">Save</button>; }',
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain(
      'import { jsx as _jsx } from "@modular-react/react-compat/jsx-runtime";',
    );
    expect(output.code).toContain("return _jsx(\"button\"");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe('<button class="primary">Save</button>');
  });

  test("uses jsxs when an element has multiple children", async () => {
    const output = transform({
      code: "export function App() { return <div><span>A</span><span>B</span></div>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx", "jsxs"],
      },
    ]);
    expect(output.code).toContain("return _jsxs(\"div\"");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<div><span>A</span><span>B</span></div>");
  });

  test("emits Fragment for fragments", async () => {
    const output = transform({
      code: "export function App() { return <>Hello <span>compat</span></>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["Fragment", "jsx", "jsxs"],
      },
    ]);
    expect(output.code).toContain("_Fragment");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("Hello <span>compat</span>");
  });

  test("reports server compat mode as unsupported", () => {
    const output = transform({
      code: "export function App() { return <div>Hello</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "MR_UNSUPPORTED_COMPAT_SERVER_TARGET",
    ]);
    expect(output.metadata.imports).toEqual([]);
  });
});
