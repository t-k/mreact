import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

const source = `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const value = cell("a");
  return <main><span>{value.get()}</span>{value.get() ? <b>yes</b> : <i>no</i>}<div title={value.get()} /><select value={value.get()}><option value="a">A</option></select></main>;
}`;

describe("client specialization report", () => {
  test("records emitted helpers and real source positions only when requested", () => {
    const input = { code: source, filename: "App.tsx", target: "client" as const, dev: false };
    const ordinary = transform(input);
    const reported = transform({ ...input, reportClientSpecializations: true });

    expect(reported.code).toBe(ordinary.code);
    expect(ordinary.metadata.clientSpecializations).toBeUndefined();
    expect("clientSpecializations" in ordinary.metadata).toBe(false);
    expect(reported.metadata.clientSpecializations).toEqual([
      { name: "directCellText", applied: true, helper: "bindCellText", loc: { line: 4, column: 23 } },
      { name: "branchInsertion", applied: true, helper: "insertBranch", loc: { line: 4, column: 43 } },
      { name: "elementProperty", applied: true, helper: "bindElementProperty", loc: { line: 4, column: 85 } },
      { name: "selectBinding", applied: true, helper: "bindSelectValue", loc: { line: 4, column: 108 } },
    ]);
  });

  test("explains disabled and ineligible paths without claiming an unused helper", () => {
    const input = { code: source, filename: "App.tsx", target: "client" as const, dev: false, reportClientSpecializations: true };
    const output = transform({ ...input, clientSpecializations: { directCellText: false, branchInsertion: false, elementProperty: false, selectBinding: false } });
    expect(output.metadata.clientSpecializations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "directCellText", applied: false, reason: "disabled", helper: "bindText" }),
      expect.objectContaining({ name: "branchInsertion", applied: false, reason: "disabled", helper: "insertDynamic" }),
      expect.objectContaining({ name: "elementProperty", applied: false, reason: "disabled", helper: "bindProp" }),
      expect.objectContaining({ name: "selectBinding", applied: false, reason: "disabled", helper: "bindSpreadProps" }),
    ]));
  });

  test("records distinct eligibility reasons for ordinary JSX", () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const value = cell("a");
  const many = cell(false);
  const props = { title: "x" };
  return <main><span>{value.get() + "!"}</span><svg title={value.get()} /><div role={value.get()} /><select multiple={many.get()} value={value.get()} /><select {...props} value={value.get()} /></main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      reportClientSpecializations: true,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientSpecializations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "directCellText", applied: false, reason: "not-native-cell-read", helper: "bindText" }),
      expect.objectContaining({ name: "elementProperty", applied: false, reason: "svg-namespace", helper: "bindProp" }),
      expect.objectContaining({ name: "elementProperty", applied: false, reason: "unsupported-property", helper: "bindProp" }),
      expect.objectContaining({ name: "selectBinding", applied: false, reason: "dynamic-multiple", helper: "bindSpreadProps" }),
      expect.objectContaining({ name: "selectBinding", applied: false, reason: "spread-attribute", helper: "bindSpreadProps" }),
    ]));
  });

  test("leaves compat and server transforms without reactive client decisions", () => {
    for (const options of [{ target: "server" as const }, { target: "client" as const, mode: "compat" as const }]) {
      const output = transform({ code: "export function App() { return <div />; }", filename: "App.tsx", dev: false, reportClientSpecializations: true, ...options });
      expect(output.metadata.clientSpecializations).toBeUndefined();
      expect("clientSpecializations" in output.metadata).toBe(false);
    }
  });

  test.each([
    ["<MemoCard label=\"A\" />", "insertMemo"],
    ["rows.map((row) => <span key={row.id}>Row</span>)", "insertMemoDynamic"],
  ])("reports the actual owner-scoped memo helper for %s", (fallback, helper) => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact";
const MemoCard = memo(function MemoCardView() { return <article>A</article>; });
export function App(props: { visible: boolean; rows: { id: number }[] }) {
  const rows = props.rows;
  return <main>{props.visible ? <MemoCard /> : ${fallback}}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      reportClientSpecializations: true,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientSpecializations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "branchInsertion", applied: false, reason: "owner-scoped-memo", helper }),
    ]));
  });

  test("reports a list-producing branch and a generic unkeyed list", () => {
    const output = transform({
      code: `export function App(props: { visible: boolean; rows: number[] }) {
  return <main>{props.visible ? props.rows.map((row) => <span>{row}</span>) : <p>empty</p>}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      reportClientSpecializations: true,
    });
    expect(output.metadata.clientSpecializations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "branchInsertion", applied: false, reason: "list-producing-branch", helper: "insertDynamic" }),
    ]));
    const list = transform({
      code: "export function App(props: { rows: number[] }) { return <main>{props.rows.map((row) => <span>{row}</span>)}</main>; }",
      filename: "List.tsx",
      target: "client",
      dev: false,
      reportClientSpecializations: true,
    });
    expect(list.metadata.clientSpecializations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "compilerKeyedList", applied: false, reason: "no-key", helper: "bindList" }),
    ]));
  });

  test("reports the compiler keyed list used by the canonical JSX benchmark", async () => {
    const filename = new URL("../../../benchmarks/js-framework-benchmark/frameworks/keyed/mreact/src/main.tsx", import.meta.url);
    const output = transform({ code: await readFile(filename, "utf8"), filename: filename.pathname, target: "client", dev: false, reportClientSpecializations: true });
    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientSpecializations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "compilerKeyedList", applied: true, helper: "bindCompilerKeyedSingleNodeList", loc: expect.objectContaining({ line: expect.any(Number), column: expect.any(Number) }) }),
    ]));
  });
});
