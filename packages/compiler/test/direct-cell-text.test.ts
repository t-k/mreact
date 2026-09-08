// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { batch } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

interface TestCell {
  set(value: unknown): void;
}

type CellHost = typeof globalThis & { __setDirectCellTextValue?: (value: unknown) => void };

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

/** Compiles a component that publishes its own cell so a test can drive updates. */
function mountPublishedCell(initialValue: string): {
  dispose: () => void;
  host: HTMLElement;
  value: TestCell;
} {
  const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const value = cell(${initialValue});
  globalThis.__setDirectCellTextValue = (next) => value.set(next);
  return <main>{value.get()}</main>;
}`);

  expect(code).toContain("bindCellText(_text_0, value)");
  const App = compileClientComponent(code);
  const host = document.createElement("div");
  const dispose = createRoot(host, App);
  const set = (globalThis as CellHost).__setDirectCellTextValue;

  if (set === undefined) {
    throw new Error("Expected the compiled component to publish its cell setter.");
  }

  return { dispose, host, value: { set } };
}

afterEach(() => {
  delete (globalThis as CellHost).__setDirectCellTextValue;
});

describe("compiler direct cell text binding", () => {
  test("falls back to the getter thunk when the cell escapes through an alias", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(1);
  const originalGet = count.get;
  const alias = count;
  alias.get = () => originalGet() * 10;
  return <main><span>{count.get()}</span><button onClick={() => count.setValue(2)}>+</button></main>;
}`);

    expect(code).not.toContain("bindCellText(_text_0, count)");
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));

    try {
      expect(host.querySelector("span")?.textContent).toBe("10");
      host.querySelector("button")?.click();
      await flushEffects();
      expect(host.querySelector("span")?.textContent).toBe("20");
    } finally {
      dispose();
    }
  });

  test.each([
    ["a helper argument", "patch(count);"],
    ["Object.assign", "Object.assign(count, { get: () => 1 });"],
  ])("falls back to the getter thunk when the cell escapes through %s", (_label, statement) => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
declare function patch(target: unknown): void;
export function App() {
  const count = cell(0);
  ${statement}
  return <main>{count.get()}</main>;
}`);

    expect(code).not.toContain("bindCellText(_text_0, count)");
    expect(code).toContain("count.get()");
  });

  test.each([
    ["export const", "export const count = cell(0);"],
    ["export { name }", "const count = cell(0);\nexport { count };"],
    ["export { name as alias }", "const count = cell(0);\nexport { count as total };"],
  ])("falls back to the getter thunk when the module cell is exported via %s", (_label, declaration) => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
${declaration}
export function App() {
  return <main>{count.get()}</main>;
}`);

    expect(code).not.toContain("bindCellText(_text_0, count)");
    expect(code).toContain("count.get()");
  });

  test("still binds a module cell that is not exported straight to the text node", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
const count = cell(0);
export function App() {
  return <main>{count.get()}</main>;
}`);

    expect(code).toContain("bindCellText(_text_0, count)");
  });

  test("binds a proven native cell straight to the text node", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main>{count.get()}</main>;
}`);

    expect(code).toContain("bindCellText(_text_0, count)");
    expect(code).not.toContain("() => (count.get())");
  });

  test("renders the initial value and every later update through the direct binding", async () => {
    const { dispose, host, value } = mountPublishedCell("1");

    try {
      expect(host.textContent).toBe("1");
      value.set(2);
      await flushEffects();
      expect(host.textContent).toBe("2");
    } finally {
      dispose();
    }
  });

  test("normalizes nullish and non-string cell values exactly like the generic path", async () => {
    const { dispose, host, value } = mountPublishedCell('"a"');

    try {
      expect(host.textContent).toBe("a");

      for (const [next, expected] of [
        [null, ""],
        [undefined, ""],
        [0, "0"],
        [false, "false"],
        [12n, "12"],
      ] as const) {
        value.set(next);
        await flushEffects();
        expect(host.textContent).toBe(expected);
      }
    } finally {
      dispose();
    }
  });

  test("updates through a compiled event handler that writes the same cell", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main><span>{count.get()}</span><button onClick={() => count.set(count.get() + 1)}>+</button></main>;
}`);

    expect(code).toContain("bindCellText(_text_0, count)");
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));

    try {
      expect(host.querySelector("span")?.textContent).toBe("0");
      host.querySelector("button")?.click();
      await flushEffects();
      expect(host.querySelector("span")?.textContent).toBe("1");
    } finally {
      dispose();
    }
  });

  test("stops writing to the text node once the owner scope is disposed", async () => {
    const { dispose, host, value } = mountPublishedCell("1");
    const text = host.firstChild?.firstChild as Text;

    expect(text.data).toBe("1");
    dispose();
    value.set(5);
    await flushEffects();

    expect(text.data).toBe("1");
  });

  test("writes one final value for a batch of updates", async () => {
    const { dispose, host, value } = mountPublishedCell("1");

    try {
      batch(() => {
        value.set(2);
        value.set(3);
        expect(host.textContent).toBe("1");
      });
      await flushEffects();
      expect(host.textContent).toBe("3");
    } finally {
      dispose();
    }
  });

  test("keeps the generic thunk for receivers the compiler cannot prove", () => {
    const unprovenSources = {
      "plain object with a get method": `export function App() {
  const count = { get: () => 1 };
  return <main>{count.get()}</main>;
}`,
      "reassignable binding": `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  let count = cell(0);
  count = cell(1);
  return <main>{count.get()}</main>;
}`,
      "replaced get method": `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  count.get = () => 7;
  return <main>{count.get()}</main>;
}`,
      "computed derived from a cell": `import { cell, computed } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  const doubled = computed(() => count.get() * 2);
  return <main>{doubled.get()}</main>;
}`,
      "call result receiver": `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const make = () => cell(0);
  return <main>{make().get()}</main>;
}`,
      "cell factory from another package": `import { cell } from "@reckona/mreact-store";
export function App() {
  const count = cell(0);
  return <main>{count.get()}</main>;
}`,
    };

    for (const [scenario, source] of Object.entries(unprovenSources)) {
      const code = compile(source);

      expect(code, scenario).toContain("bindText(_text_0, () => (");
    }
  });

  test("keeps a proven cell read on the generic path when the text is not a lone child", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main>Count: {count.get()} items</main>;
}`);

    expect(code).toContain("bindCellText(_text_0, count)");
  });

  test("leaves a keyed row initial text child without any bindText call", () => {
    const code = compile(`export function App(props) {
  return <ul>{props.rows.map((row) => <li key={row.id}>{row.id}</li>)}</ul>;
}`);

    expect(code).toContain("_textValue_");
    expect(code).not.toContain("bindText(");
  });

  test("keeps a list row on its existing keyed cell text specialization", () => {
    const code = compile(`export function App(props) {
  return <ul>{props.rows.map((row) => <li key={row.id}>{row.label.get()}</li>)}</ul>;
}`);

    expect(code).toContain("bindCompilerKeyedCellText");
    expect(code).not.toContain("bindText(");
  });

  test("drops the generic text binding import when every text binding is a proven cell", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main><span>{count.get()}</span><button onClick={() => count.set(count.get() + 1)}>+</button></main>;
}`);

    expect(code).toContain('import { bindCellText } from "@reckona/mreact-reactive-dom/internal";');
    expect(code).not.toMatch(/import \{[^}]*\bbindText\b[^}]*\} from "@reckona\/mreact-reactive-dom"/u);
  });

  test("keeps the generic text binding import beside the cell binding for an unproven sibling", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main><span>{count.get()}</span><em>{count.get() * 2}</em></main>;
}`);

    expect(code).toContain("bindCellText(_text_0, count)");
    expect(code).toContain("bindText(_text_1, () => (count.get() * 2))");
    expect(code).toMatch(/import \{[^}]*\bbindText\b[^}]*\} from "@reckona\/mreact-reactive-dom"/u);
  });
});
