// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runCompatComponent } from "./helpers.js";

describe("react-compat prop reactive DOM block lowering", () => {
  test("lowers a single-props host-only component to a prop-bridged reactive block", () => {
    const output = transform({
      code: `export function Row(props) {
        return (
          <tr className={props.selected ? "danger" : ""}>
            <td className="col-md-1">{props.row.id}</td>
            <td className="col-md-4">
              <a onClick={() => selectRow(props.row.id)}>{props.row.label}</a>
            </td>
            <td className="col-md-6"></td>
          </tr>
        );
      }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    // Imports: createReactiveDomBlock (compat) + reactive DOM helpers.
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("effect");
    expect(output.code).toContain("bindEvent");
    // The block closure parameter shadows `props` (the reactive proxy)...
    expect(output.code).toMatch(/createReactiveDomBlock\(\(props\) => \{/);
    // ...and the incoming props object is passed as the block props.
    expect(output.code).toMatch(/\}, props\);/);
    // Imperative DOM build.
    expect(output.code).toContain('document.createElement("tr")');
    expect(output.code).toContain('document.createElement("td")');
    expect(output.code).toContain('document.createElement("a")');
    // One effect drives all bindings, reading the proxy verbatim.
    expect(output.code).toMatch(/= _effect\(\(\) => \{/);
    expect(output.code).toContain('(props.selected ? "danger" : "")');
    expect(output.code).toContain("(props.row.id)");
    expect(output.code).toContain("(props.row.label)");
    expect(output.code).toMatch(/\.className !== /);
    // Event handlers are rebound from the reactive props proxy, not captured once.
    expect(output.code).toContain('bindEvent');
    expect(output.code).toContain('"click"');
    expect(output.code).not.toContain("addEventListener");
  });

  test("does not lower components with hooks (non-empty body) or destructured props", () => {
    const withHook = transform({
      code: `import { useState } from "@reckona/mreact-compat";
        export function Row(props) {
          const [n] = useState(0);
          return <div>{props.label}{n}</div>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(withHook.diagnostics).toEqual([]);
    // Falls back to the normal jsx path, not a reactive block.
    expect(withHook.code).not.toContain("document.createElement");

    const destructured = transform({
      code: `export function Row({ row, selected }) {
          return <tr className={selected ? "danger" : ""}>{row.label}</tr>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(destructured.diagnostics).toEqual([]);
    expect(destructured.code).not.toContain("createReactiveDomBlock");
  });

  test("compiled prop block renders correctly end to end", async () => {
    const output = transform({
      code: `export function Row(props) {
          return (
            <tr className={props.selected ? "danger" : ""}>
              <td className="col-md-1">{props.row.id}</td>
              <td className="col-md-4">{props.row.label}</td>
            </tr>
          );
        }
        export function App() {
          return <Row row={{ id: 7, label: "hi" }} selected={true} />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    const tr = container.querySelector("tr");
    expect(tr?.className).toBe("danger");
    expect(container.querySelector("td.col-md-1")?.textContent).toBe("7");
    expect(container.querySelector("td.col-md-4")?.textContent).toBe("hi");
  });

  test("compiled prop block event handlers use latest parent props after updates", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Row(props) {
          return <button id="target" onClick={props.onClick}>{props.label}</button>;
        }

        function Controller() {
          const [mode, setMode] = useState("a");
          const handler = mode === "a"
            ? () => globalThis.__calls.push("a")
            : () => globalThis.__calls.push("b");
          return (
            <div>
              <button id="switch" onClick={() => setMode("b")}>switch</button>
              <Row label={mode} onClick={handler} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(output.diagnostics).toEqual([]);

    const calls: string[] = [];
    const previousCalls = (globalThis as unknown as { __calls?: string[] }).__calls;
    (globalThis as unknown as { __calls?: string[] }).__calls = calls;

    try {
      const container = await runCompatComponent(output.code);
      container.querySelector<HTMLButtonElement>("#target")?.click();
      container.querySelector<HTMLButtonElement>("#switch")?.click();

      expect(container.querySelector("#target")?.textContent).toBe("b");

      container.querySelector<HTMLButtonElement>("#target")?.click();

      expect(calls).toEqual(["a", "b"]);
    } finally {
      (globalThis as unknown as { __calls?: string[] }).__calls = previousCalls;
    }
  });
});
