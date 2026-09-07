// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter((option) => option.selected)
    .map((option) => option.value);
}

describe("compiler select control binding", () => {
  test("emits a dedicated select binding when the element has no spread props", () => {
    const code = compile(`export function App(props) {
  return <select value={props.value}><option value="a">A</option><option value="b">B</option></select>;
}`);

    expect(code).toContain("bindSelectValue(_root, () => ({ value: (props.value) }))");
    expect(code).not.toContain("bindSpreadProps");
    expect(code).not.toContain("Object.assign");
  });

  test("carries defaultValue and a static value through the dedicated binding", () => {
    const code = compile(`export function App(props) {
  return <select defaultValue={props.fallback} value="a"><option value="a">A</option></select>;
}`);

    expect(code).toContain(
      'bindSelectValue(_root, () => ({ defaultValue: (props.fallback), value: "a" }))',
    );
    expect(code).not.toContain("bindSpreadProps");
  });

  test("leaves a static multiple attribute to the template instead of rebinding it", () => {
    const code = compile(`export function App(props) {
  return <select multiple value={props.value}><option value="a">A</option></select>;
}`);

    expect(code).toContain('createTemplate("<select multiple=\\"\\">');
    expect(code).toContain("bindSelectValue(_root, () => ({ value: (props.value) }))");
    expect(code).not.toContain("bindSpreadProps");
  });

  test("keeps a real spread on the generic spread binding", () => {
    const code = compile(`export function App(props) {
  return <select value={props.value} {...props.rest}><option value="a">A</option></select>;
}`);

    expect(code).toContain("bindSpreadProps");
    expect(code).not.toContain("bindSelectValue");
  });

  test("keeps a dynamic multiple attribute on the generic spread binding", () => {
    const code = compile(`export function App(props) {
  return <select multiple={props.many} value={props.value}><option value="a">A</option></select>;
}`);

    expect(code).toContain("bindSpreadProps");
    expect(code).not.toContain("bindSelectValue");
  });

  test("imports and runs the generic spread binding for a spread select", async () => {
    const code = compile(`export function App(props) {
  return <select multiple value="open" {...props.rest}><option value="open">Open</option><option value="done">Done</option></select>;
}`);

    expect(code).toContain('import { bindSpreadProps,');
    expect(code).toContain('Object.assign(_selectProps, { "multiple": "" })');
    expect(code).toContain('Object.assign(_selectProps, { "value": "open" })');
    const App = compileClientComponent(code) as unknown as (props: {
      rest: Record<string, unknown>;
    }) => Node;
    const host = document.createElement("div");
    const dispose = createRoot(host, () => App({ rest: { value: ["done"] } }));

    try {
      await flushEffects();
      const select = host.querySelector("select") as HTMLSelectElement;

      expect(selectedValues(select)).toEqual(["done"]);
    } finally {
      dispose();
    }
  });

  test("keeps a static multiple attribute without a controlled value on the spread binding", () => {
    const code = compile(`export function App() {
  return <select multiple><option value="a">A</option></select>;
}`);

    expect(code).toContain("bindSpreadProps");
    expect(code).not.toContain("bindSelectValue");
  });

  test("does not use the select binding for other elements carrying a value prop", () => {
    const code = compile(`export function App(props) {
  return <input value={props.value} />;
}`);

    expect(code).toContain('bindProp(_root, "value", () => (props.value))');
    expect(code).not.toContain("bindSelectValue");
  });

  test("keeps event and ref attributes off the dedicated select binding", () => {
    const code = compile(`export function App(props) {
  return <select onChange={props.onChange} domRef={props.ref} value={props.value}><option value="a">A</option></select>;
}`);

    expect(code).toContain('bindEvent(_root, "change", props.onChange)');
    expect(code).toContain("bindDomRef(_root, props.ref)");
    expect(code).toContain("bindSelectValue(_root, () => ({ value: (props.value) }))");
  });

  test("emits the select binding before children when the element sets inner HTML", () => {
    const code = compile(`export function App(props) {
  return <select value={props.value} dangerouslySetInnerHTML={{ __html: props.html }} />;
}`);

    const bindingIndex = code.indexOf(
      "bindSelectValue(_root, () => ({ value: (props.value) }))",
    );
    const innerHtmlIndex = code.indexOf(
      'bindProp(_root, "dangerouslySetInnerHTML", () => ({ __html: props.html }))',
    );

    expect(bindingIndex).toBeGreaterThan(-1);
    expect(innerHtmlIndex).toBeGreaterThan(-1);
    expect(innerHtmlIndex).toBeLessThan(bindingIndex);
  });

  test("keeps other dynamic select attributes on their own prop bindings", () => {
    const code = compile(`export function App(props) {
  return <select name={props.name} value={props.value}><option value="a">A</option></select>;
}`);

    expect(code).toContain('bindProp(_root, "name", () => (props.name))');
    expect(code).toContain("bindSelectValue(_root, () => ({ value: (props.value) }))");
  });

  test("selects the compiled option matching the bound value after children mount", async () => {
    const code = compile(`export function App(props) {
  return <select value={props.value}><option value="open">Open</option><option value="done">Done</option></select>;
}`);
    const App = compileClientComponent(code) as unknown as (props: { value: string }) => Node;
    const host = document.createElement("div");
    const dispose = createRoot(host, () => App({ value: "done" }));

    try {
      await flushEffects();
      const select = host.querySelector("select") as HTMLSelectElement;

      expect(select.value).toBe("done");
      expect(selectedValues(select)).toEqual(["done"]);
    } finally {
      dispose();
    }
  });

  test("selects every listed option for a compiled multiple select", async () => {
    const code = compile(`export function App(props) {
  return <select multiple value={props.value}><option value="open">Open</option><option value="done">Done</option></select>;
}`);
    const App = compileClientComponent(code) as unknown as (props: { value: string[] }) => Node;
    const host = document.createElement("div");
    const dispose = createRoot(host, () => App({ value: ["open", "done"] }));

    try {
      await flushEffects();
      const select = host.querySelector("select") as HTMLSelectElement;

      expect(select.multiple).toBe(true);
      expect(selectedValues(select)).toEqual(["open", "done"]);
    } finally {
      dispose();
    }
  });

  test("keeps the enabled-option fallback for a compiled unmatched value", async () => {
    const code = compile(`export function App(props) {
  return <select value={props.value}><option value="open" disabled>Open</option><option value="done">Done</option></select>;
}`);
    const App = compileClientComponent(code) as unknown as (props: { value: string }) => Node;
    const host = document.createElement("div");
    const dispose = createRoot(host, () => App({ value: "missing" }));

    try {
      await flushEffects();
      const select = host.querySelector("select") as HTMLSelectElement;

      expect(select.value).toBe("done");
    } finally {
      dispose();
    }
  });
});
