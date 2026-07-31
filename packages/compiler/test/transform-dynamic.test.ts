import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler dynamic JSX transform", () => {
  test("emits text, prop, and event bindings", () => {
    const output = transform({
      code: `
        export function App() {
          const count = cell(0);
          return <button disabled={count.get() > 1} onClick={() => count.set((n) => n + 1)}>count: {count.get()}</button>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-reactive-dom",
      specifiers: ["bindEvent", "bindProp", "bindText", "createTemplate"],
    });
    expect(output.code).toContain("bindText(");
    expect(output.code).toContain("bindProp(");
    expect(output.code).toContain("bindEvent(");
    expect(output.code).toContain("count.get()");
  });

  test("treats parenthesized JSX expression children as JSX", () => {
    const output = transform({
      code: "export function App() { return <div>{(<span>Hello</span>)}</div>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("<div><span>Hello</span></div>");
    expect(output.code).not.toContain("bindText");
  });

  // Issue 057 Phase A regression gate: the client emit must import only the
  // binding helpers actually used by the component. Helpers like `bindList`
  // (only needed for `{items.map(...)}`) or `bindSpreadProps` (only needed
  // for `<X {...props} />`) must not leak into the import line when unused.
  test("emits only the runtime helpers the component actually uses", () => {
    const output = transform({
      code: `
        export function App() {
          const n = cell(0);
          return <div onClick={() => n.set(n.get() + 1)}>{n.get()}</div>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // bindEvent / bindText / createTemplate are required by the JSX above.
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-reactive-dom",
      specifiers: ["bindEvent", "bindText", "createTemplate"],
    });
    // bindList / bindProp / bindSpreadProps / insertDynamic are not used and
    // must not appear in the import specifiers nor in the emitted code.
    expect(output.code).not.toContain("bindList");
    expect(output.code).not.toContain("bindSpreadProps");
    expect(output.code).not.toContain("insertDynamic");
    // bindProp is reserved for `attr={expr}` (other than event handlers).
    expect(output.code).not.toContain("bindProp");
  });

  test("emits bindList only when a list child is present", () => {
    const output = transform({
      code: `
        export function App() {
          const items = cell([1, 2, 3]);
          return <ul>{items.get().map((n) => <li>{n}</li>)}</ul>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual(
      expect.objectContaining({
        source: "@reckona/mreact-reactive-dom",
        specifiers: expect.arrayContaining(["bindList"]),
      }),
    );
    expect(output.code).toContain("bindList");
  });

  test("emits the compiler keyed helper for a safe single intrinsic root", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: "A" }]);
          return <tbody>{rows.get().map((row, index, items) => (
            <tr key={row.id} data-index={index} data-count={items.length}>
              <td>{row.label}</td>
              <td><button onClick={() => globalThis.__selected = row.id}>Select</button></td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-reactive-dom/internal",
      specifiers: ["bindCompilerKeyedSingleNodeList"],
    });
    expect(output.code).toContain("bindCompilerKeyedSingleNodeList");
    expect(output.code).toContain("row.item).label");
    expect(output.code).toContain("row.index)");
    expect(output.code).toContain("row.items).length");
    expect(output.code).toContain('const _keyedTemplate = createTemplate("<tr');
    expect(output.code.indexOf("const _keyedTemplate")).toBeLessThan(
      output.code.lastIndexOf("bindCompilerKeyedSingleNodeList("),
    );
    expect(output.code).not.toContain("bindList");
  });

  test("directly initializes key-equivalent text in compiler keyed rows", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: "A" }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.label}</td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code.match(/\bbindText\(/g)).toHaveLength(1);
    expect(output.code).toMatch(/document\.createTextNode\([\s\S]*row\.item[\s\S]*\.id/);
    expect(output.code).toContain("row.item).label");
  });

  test("keeps non-key-equivalent keyed row text on reactive bindings", () => {
    const output = transform({
      code: `
        function readId(row) {
          return row.id;
        }

        export function App() {
          const selected = cell(1);
          const rows = cell([{ id: 1, meta: { id: 1 } }]);
          return <tbody>{rows.get().map((row, index) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.meta.id}</td>
              <td>{readId(row)}</td>
              <td>{index}</td>
              <td>{selected.get()}</td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code.match(/\bbindText\(/g)).toHaveLength(4);
  });

  test.each([
    ["nested key", "row.meta.id"],
    ["computed key", 'row["id"]'],
    ["optional key", "row?.id"],
    ["index key", "index"],
    ["external key", "selected.get()"],
  ])("does not directly initialize %s text", (_name, expression) => {
    const output = transform({
      code: `
        function readId(row) {
          return row.id;
        }

        export function App() {
          const selected = cell(1);
          const rows = cell([{ id: 1, meta: { id: 1 } }]);
          return <tbody>{rows.get().map((row, index) => (
            <tr key={${expression}}>
              <td>{${expression}}</td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindCompilerKeyedSingleNodeList");
    expect(output.code.match(/\bbindText\(/g)).toHaveLength(1);
  });

  test("keeps call-based keyed text on the generic list path", () => {
    const output = transform({
      code: `
        function readId(row) {
          return row.id;
        }

        export function App() {
          const rows = cell([{ id: 1 }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={readId(row)}>
              <td>{readId(row)}</td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindList");
    expect(output.code).not.toContain("bindCompilerKeyedSingleNodeList");
  });

  test.each([
    ["fragment", "<><tr key={row.id} /><tr /></>"],
    ["component", "<Row key={row.id} row={row} />"],
    ["conditional", "row.active ? <tr key={row.id} /> : null"],
    ["nested list", "<tr key={row.id}>{row.children.map((child) => <td>{child}</td>)}</tr>"],
    ["spread", "<tr key={row.id} {...row.props} />"],
    ["event handler identifier", "<tr key={row.id} onClick={save} />"],
    [
      "event handler default parameter",
      "<tr key={row.id} onClick={(event, current = row) => globalThis.__selected = current.id} />",
    ],
    [
      "conditional event handler",
      '<tr key={row.id} onClick={row.active ? () => globalThis.__selected = "active" : () => globalThis.__selected = "inactive"} />',
    ],
    ["no key", "<tr>{row.label}</tr>"],
  ])("keeps %s keyed list shapes on bindList", (_name, renderer) => {
    const output = transform({
      code: `function Row(props) { return <tr><td>{props.row.label}</td></tr>; }
        export function App() {
          const rows = cell([]);
          return <tbody>{rows.get().map((row) => (${renderer}))}</tbody>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.code).toContain("bindList");
    expect(output.code).not.toContain("bindCompilerKeyedSingleNodeList");
  });

  test("rewrites shorthand row reads without changing raw key or shadowed event parameters", () => {
    const output = transform({
      code: `export function App() {
        const rows = cell([{ id: 1, label: "A" }]);
        return <tbody>{rows.get().map((row) => (
          <tr key={row.id}>
            <td>{row.label}</td>
            <td><button onClick={() => globalThis.__row = { row }}>Capture</button></td>
            <td><button onClick={(row) => globalThis.__event = row.type}>Event</button></td>
          </tr>
        ))}</tbody>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("{ row: (row.item) }");
    expect(output.code).toContain("(row) => globalThis.__event = row.type");
    expect(output.code).toContain("{ key: (row) => (row.id) }");
    expect(output.code).not.toContain("{ key: (row) => ((row.item).id) }");
  });
});
