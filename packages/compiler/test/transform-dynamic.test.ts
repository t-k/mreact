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
    expect(output.code).toMatch(/\b(?:bindText|insertDynamic)\(/);
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
    expect(output.metadata.imports).toContainEqual(
      expect.objectContaining({
        source: "@reckona/mreact-reactive-dom/internal",
        specifiers: expect.arrayContaining([
          "bindCompilerKeyedSingleNodeList",
          "bindCompilerKeyedPropertyText",
        ]),
      }),
    );
    expect(output.metadata.imports).toContainEqual(
      expect.objectContaining({
        source: "@reckona/mreact-reactive-dom",
        specifiers: expect.arrayContaining(["createTemplate", "createTemplateElement"]),
      }),
    );
    expect(output.code).toContain("bindCompilerKeyedSingleNodeList");
    expect(output.code).toContain("compilerEvents:");
    expect(output.code).not.toContain("markCompilerKeyedEventSlot(");
    expect(output.code).toContain("const _keyedEventSlot = Symbol();");
    expect(output.code.match(/\[_keyedEventSlot\] =/g)).toHaveLength(1);
    expect(output.code).toContain("slotKey: _keyedEventSlot");
    expect(output.code).not.toContain('bindEvent(_keyedRoot.childNodes[1].childNodes[0], "click"');
    expect(output.code).toContain('bindCompilerKeyedPropertyText(row, _text_0, "label")');
    expect(output.code).toContain("row.index)");
    expect(output.code).toContain("row.items).length");
    expect(output.code).toContain('const _keyedTemplate = createTemplateElement("<tr');
    expect(output.code).toContain("const _keyedRoot = _keyedTemplate();");
    expect(output.code).not.toContain("_keyedFragment");
    expect(output.code).not.toContain("Array.from(_root.childNodes)");
    expect(output.code.indexOf("const _keyedTemplate")).toBeLessThan(
      output.code.lastIndexOf("bindCompilerKeyedSingleNodeList("),
    );
    expect(output.code).not.toContain("bindList");
  });

  test("reuses a compiler keyed event element for its direct text binding", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: "A" }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id}>
              <td><a onClick={() => globalThis.__selected = row.id}>{row.label}</a></td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toMatch(
      /const (?<element>_keyedElement\w*) = _keyedRoot\.firstElementChild\.firstElementChild;\s*\k<element>\[_keyedEventSlot\] = 0;\s*const _text_0 = \k<element>\.childNodes\[0\];/u,
    );
    expect(output.code.match(/_keyedRoot\.firstElementChild\.firstElementChild/gu)).toHaveLength(
      1,
    );
  });

  test("uses element sibling paths for compiler-owned rows with mixed text", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: "A" }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id}>prefix<td>{row.id}</td>middle<td><a onClick={() => globalThis.__selected = row.id}>{row.label}</a></td></tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_keyedRoot.firstElementChild.childNodes[0]");
    expect(output.code).toMatch(
      /const (?<element>_keyedElement\w*) = _keyedRoot\.childNodes\[3\]\.childNodes\[0\];/u,
    );
    expect(output.code).not.toContain("_keyedRoot.firstElementChild.nextElementSibling");
  });

  test("keeps live child paths for compiler rows with user-controlled setup", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: "A", title: "row" }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id}><td title={row.title}>{row.label}</td><td>Static</td></tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_keyedRoot.childNodes[0]");
    expect(output.code).not.toContain("_keyedRoot.firstElementChild");
  });

  test("archives child nodes when static text precedes a live keyed anchor", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: "A" }]);
          return <tbody>prefix{rows.get().map((row) => (
            <tr key={row.id}><td>{row.label}</td></tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("Array.from(_root.childNodes)");
  });

  test("keeps row events on bindEvent when the keyed list parent is a fragment", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1 }]);
          return <>{rows.get().map((row) => (
            <button key={row.id} onClick={() => globalThis.__selected = row.id}>Select</button>
          ))}</>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("compilerEvents:");
    expect(output.code).not.toContain("markCompilerKeyedEventSlot(");
    expect(output.code).toContain("bindEvent(");
  });

  test("specializes delegated row events while preserving non-delegated event bindings", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1 }]);
          return <section>{rows.get().map((row) => (
            <button
              key={row.id}
              onClick={() => globalThis.__selected = row.id}
              onMouseEnter={() => globalThis.__hovered = row.id}
            >Select</button>
          ))}</section>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('type: "click"');
    expect(output.code).not.toContain("markCompilerKeyedEventSlot(");
    expect(output.code).toContain("const _keyedEventSlot = Symbol();");
    expect(output.code).toContain("_keyedRoot[_keyedEventSlot] = 0");
    expect(output.code).toContain("slotKey: _keyedEventSlot");
    expect(output.code).toContain('bindEvent(_keyedRoot, "mouseenter"');
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
    expect(output.code).not.toContain("bindText(");
    expect(output.code.match(/\bbindCompilerKeyedPropertyText\(/g)).toHaveLength(1);
    expect(output.code).not.toContain("() => ((row.item).label)");
    expect(output.code).toContain('createTemplateElement("<tr><td> </td><td> </td></tr>")');
    expect(output.code).not.toContain("document.createTextNode");
    expect(output.code).not.toContain(".replaceWith(");
    expect(output.code).toMatch(/_textValue_0 = [\s\S]*row\.item[\s\S]*\.id/);
    expect(output.code).toContain('bindCompilerKeyedPropertyText(row, _text_1, "label")');
  });

  test("binds direct keyed row cell properties without a generated reader closure", () => {
    const output = transform({
      code: `
        export function App() {
          const rows = cell([{ id: 1, label: cell("A") }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id}><td>{row.label.get()}</td></tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('bindCompilerKeyedCellText(row, _text_0, "label")');
    expect(output.code).toContain("compilerOwnsTextCleanup: true");
    expect(output.code).not.toContain("nestedObjectFallback: true");
    expect(output.code).not.toContain("() => ((row.item).label.get())");
  });

  test.each([
    ["nested property", "row.meta.label"],
    ["computed property", 'row["label"]'],
    ["optional property", "row?.label"],
    ["call expression", "readLabel(row)"],
  ])("keeps %s keyed text on bindText", (_name, expression) => {
    const output = transform({
      code: `
        function readLabel(row) {
          return row.label;
        }

        export function App() {
          const rows = cell([{ id: 1, label: "A", meta: { label: "A" } }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id}>
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
    expect(output.code).toMatch(/\b(?:bindText|insertDynamic)\(/);
    expect(output.code).not.toContain("bindCompilerKeyedText(");
  });

  test("keeps dynamic render expressions on comment insertion markers", () => {
    const output = transform({
      code: `
        export function App() {
          const visible = cell(true);
          return <div>{visible.get() ? <span>A</span> : null}</div>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('createTemplate("<div><!----></div>")');
    expect(output.code).toContain("insertDynamic(");
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
    expect(output.code).toContain("key: (row) => (row.id)");
    expect(output.code).not.toContain("{ key: (row) => ((row.item).id) }");
  });

  test("emits compiler selected class metadata for an exact keyed row class", () => {
    const output = transform({
      code: `
        export function App() {
          const selected = cell(null);
          const rows = cell([{ id: 1 }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id} class={selected.get() === row.id ? "danger" : ""}>
              <td>{row.id}</td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'compilerSelectedClass: { className: "danger", initialClassValue: "", source: selected }',
    );
    expect(output.code).toContain('createTemplateElement("<tr class=\\"\\"');
    expect(output.code).not.toContain('bindProp(_keyedRoot, "class"');
  });

  test.each([
    ["mutable selected source", "let", 'selected.get() === row.id ? "danger" : ""'],
    ["different row key", "const", 'selected.get() === row.other ? "danger" : ""'],
    ["non-empty false branch", "const", 'selected.get() === row.id ? "danger" : "safe"'],
    ["dynamic selected token", "const", 'selected.get() === row.id ? active.get() : ""'],
  ])("keeps %s class on bindProp", (_name, bindingKind, classExpression) => {
    const output = transform({
      code: `
        export function App() {
          ${bindingKind} selected = cell(null);
          const active = cell("danger");
          const rows = cell([{ id: 1, other: 1 }]);
          return <tbody>{rows.get().map((row) => (
            <tr key={row.id} class={${classExpression}}>
              <td>{row.id}</td>
            </tr>
          ))}</tbody>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("compilerSelectedClass");
    expect(output.code).toContain('bindProp(_keyedRoot, "class"');
  });
});
