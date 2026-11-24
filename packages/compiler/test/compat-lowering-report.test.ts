import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  explainTransform,
  formatCompatLoweringReport,
  transform,
  type CompatLoweringPath,
  type CompatLoweringReason,
} from "../src/index.js";

const PICT_CASES = [
  ["prod", "stateless-props", "host-element", "none"],
  ["prod", "stateless-destructured", "host-element", "none"],
  ["prod", "stateful-text", "host-element", "none"],
  ["prod", "stateful-root-list", "list", "none"],
  ["prod", "stateful-complex", "host-element", "none"],
  ["prod", "stateless-props", "host-element", "ref-attr"],
  ["prod", "stateless-props", "host-element", "controlled-input-value"],
  ["prod", "stateless-props", "host-element", "imported-child-component"],
  ["prod", "stateful-root-list", "list", "unkeyed-list"],
  ["dev", "stateless-props", "host-element", "none"],
  ["dev", "stateful-text", "component", "none"],
  ["dev", "stateful-complex", "fragment", "none"],
  ["dev", "stateful-complex", "host-element", "ref-attr"],
  ["prod", "stateless-props", "fragment", "none"],
  ["prod", "stateful-complex", "component", "none"],
  ["dev", "stateless-props", "host-element", "static-only"],
  ["prod", "stateless-props", "component", "none"],
  ["dev", "stateless-destructured", "host-element", "ref-attr"],
  ["dev", "stateful-complex", "host-element", "controlled-input-value"],
  ["dev", "stateful-text", "keyed-host-element", "none"],
  ["dev", "stateless-destructured", "host-element", "imported-child-component"],
  ["prod", "stateful-complex", "keyed-host-element", "none"],
  ["dev", "stateless-destructured", "keyed-host-element", "none"],
  ["dev", "stateful-text", "host-element", "ref-attr"],
  ["prod", "stateful-text", "host-element", "controlled-input-value"],
  ["dev", "stateless-destructured", "fragment", "none"],
  ["dev", "stateless-destructured", "component", "none"],
  ["dev", "stateful-text", "host-element", "imported-child-component"],
  ["dev", "stateless-props", "keyed-host-element", "none"],
  ["prod", "stateful-complex", "host-element", "imported-child-component"],
  ["dev", "stateful-root-list", "list", "unkeyed-list"],
  ["dev", "stateful-text", "fragment", "none"],
  ["prod", "stateless-props", "host-element", "static-only"],
  ["dev", "stateless-destructured", "host-element", "controlled-input-value"],
] as const;

type BuildMode = (typeof PICT_CASES)[number][0];
type ComponentShape = (typeof PICT_CASES)[number][1];
type RootNodeKind = (typeof PICT_CASES)[number][2];
type BlockerFeature = (typeof PICT_CASES)[number][3];

function buildPictFixture(
  shape: ComponentShape,
  rootKind: RootNodeKind,
  blocker: BlockerFeature,
): { code: string; componentName: string } {
  if (shape === "stateful-root-list") {
    const keyAttr = blocker === "unkeyed-list" ? "" : " key={row.id}";
    return {
      componentName: "App",
      code: [
        'import { useReducer } from "@reckona/mreact-compat";',
        "function Row(props: { row: { id: number; label: string } }) {",
        "  return <tr><td>{props.row.label}</td></tr>;",
        "}",
        "export function App() {",
        "  const [state, dispatch] = useReducer((s: { rows: { id: number; label: string }[] }) => s, { rows: [] });",
        "  void dispatch;",
        `  return state.rows.map((row) => <Row${keyAttr} row={row} />);`,
        "}",
      ].join("\n"),
    };
  }

  const imports: string[] = [];
  if (shape === "stateful-text") {
    imports.push('import { useState } from "@reckona/mreact-compat";');
  } else if (shape === "stateful-complex") {
    imports.push('import { useEffect, useState } from "@reckona/mreact-compat";');
  }
  if (rootKind === "component" || blocker === "imported-child-component") {
    imports.push('import { ExternalWidget } from "./external";');
  }

  const param =
    shape === "stateless-props"
      ? "props: { label: string; value?: string; nodeRef?: unknown }"
      : shape === "stateless-destructured"
        ? "{ label, value, nodeRef }: { label: string; value?: string; nodeRef?: unknown }"
        : "";
  const expr =
    shape === "stateless-props"
      ? "props.label"
      : shape === "stateless-destructured"
        ? "label"
        : "count";
  const valueExpr =
    shape === "stateless-props"
      ? "props.value"
      : shape === "stateless-destructured"
        ? "value"
        : "count";
  const refExpr =
    shape === "stateless-props"
      ? "props.nodeRef"
      : shape === "stateless-destructured"
        ? "nodeRef"
        : "null";

  const bodyLines: string[] = [];
  if (shape === "stateful-text") {
    bodyLines.push("  const [count, setCount] = useState(0);");
  } else if (shape === "stateful-complex") {
    bodyLines.push("  const [count, setCount] = useState(0);");
    bodyLines.push("  useEffect(() => {}, [count]);");
  }

  let jsx: string;
  if (rootKind === "fragment") {
    jsx = `<><p>{${expr}}</p></>`;
  } else if (rootKind === "component") {
    jsx = `<ExternalWidget value={${expr}} />`;
  } else if (rootKind === "keyed-host-element") {
    jsx = `<div key="fixed">{${expr}}</div>`;
  } else {
    if (blocker === "static-only") {
      jsx = `<div className="static">Static text</div>`;
    } else if (blocker === "ref-attr") {
      jsx = `<div ref={${refExpr}}>{${expr}}</div>`;
    } else if (blocker === "controlled-input-value") {
      jsx = `<input value={${valueExpr}} />`;
    } else if (blocker === "imported-child-component") {
      jsx = `<div><ExternalWidget value={${expr}} /></div>`;
    } else {
      jsx = `<div>{${expr}}</div>`;
    }
  }

  return {
    componentName: "Subject",
    code: [...imports, `export function Subject(${param}) {`, ...bodyLines, `  return ${jsx};`, "}"].join(
      "\n",
    ),
  };
}

describe("compat lowering diagnostics", () => {
  test("does not collect metadata or alter emitted code when reportCompatLowering is omitted", () => {
    const code = [
      "export function Row(props: { label: string }) {",
      "  return <tr><td>{props.label}</td></tr>;",
      "}",
    ].join("\n");
    const input = { code, filename: "Row.compat.tsx", target: "client" as const, dev: false, mode: "compat" as const };

    const ordinary = transform(input);
    const reported = transform({ ...input, reportCompatLowering: true });

    expect(ordinary.metadata.compatLowering).toBeUndefined();
    expect("compatLowering" in ordinary.metadata).toBe(false);
    expect(reported.code).toBe(ordinary.code);
    expect(reported.metadata.compatLowering).toEqual([
      expect.objectContaining({
        component: "Row",
        exportName: "Row",
        path: "prop-reactive-dom-block",
        optimized: true,
        fallback: false,
        reasons: [],
      }),
    ]);
  });

  test("omits compatLowering for reactive client and server transforms", () => {
    const code = "export function App(props: { label: string }) { return <p>{props.label}</p>; }";
    for (const options of [
      { target: "client" as const, mode: "reactive" as const },
      { target: "server" as const, mode: "compat" as const },
      { target: "server" as const, mode: "reactive" as const },
    ]) {
      const output = transform({
        code,
        filename: "App.tsx",
        dev: false,
        reportCompatLowering: true,
        ...options,
      });
      expect(output.metadata.compatLowering).toBeUndefined();
      expect("compatLowering" in output.metadata).toBe(false);
    }
  });

  test("classifies all five compat client lowering paths accurately", () => {
    const code = [
      'import { useEffect, useReducer, useState } from "@reckona/mreact-compat";',
      "export function CounterText() {",
      "  const [count, setCount] = useState(0);",
      "  return <span>{count}</span>;",
      "}",
      "export function PropRow(props: { label: string }) {",
      "  return <tr><td>{props.label}</td></tr>;",
      "}",
      "export function RootList() {",
      "  const [state, dispatch] = useReducer((s: { rows: { id: number; label: string }[] }) => s, { rows: [] });",
      "  void dispatch;",
      "  return state.rows.map((row) => <PropRow key={row.id} label={row.label} />);",
      "}",
      "export function DirectTextVdom() {",
      "  const [count, setCount] = useState(0);",
      "  return <section><p>{count}</p></section>;",
      "}",
      "export function EffectFallback(props: { label: string }) {",
      "  useEffect(() => {}, [props.label]);",
      "  return <div ref={null}>{props.label}</div>;",
      "}",
    ].join("\n");

    const output = transform({
      code,
      filename: "AllPaths.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
      reportCompatLowering: true,
    });

    const byName = new Map(
      (output.metadata.compatLowering ?? []).map((entry) => [entry.component, entry]),
    );

    expect(byName.get("CounterText")).toMatchObject({
      path: "reactive-dom-block",
      optimized: true,
      fallback: false,
      reasons: [],
    });
    expect(byName.get("PropRow")).toMatchObject({
      path: "prop-reactive-dom-block",
      optimized: true,
      fallback: false,
      reasons: [],
    });
    expect(byName.get("RootList")).toMatchObject({
      path: "root-list-reactive-dom-block",
      optimized: true,
      fallback: false,
      reasons: [],
    });
    expect(byName.get("DirectTextVdom")).toMatchObject({
      path: "vdom-direct-text",
      optimized: false,
      fallback: true,
      reasons: expect.arrayContaining(["has-body-statements", "no-direct-state-text-child"]),
    });
    expect(byName.get("EffectFallback")).toMatchObject({
      path: "vdom",
      optimized: false,
      fallback: true,
      reasons: expect.arrayContaining(["has-body-statements", "unsupported-dynamic-attribute"]),
      details: expect.arrayContaining([
        expect.stringContaining("useEffect"),
        expect.stringContaining("ref"),
      ]),
    });
    expect(byName.get("EffectFallback")?.runtimeImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "@reckona/mreact-compat/jsx-runtime",
          specifiers: expect.arrayContaining(["jsx"]),
        }),
      ]),
    );
  });

  test("explains root-list cascade when row component falls back to VDOM", () => {
    const code = [
      'import { useReducer } from "@reckona/mreact-compat";',
      "function BrokenRow(props: { label: string; nodeRef: unknown }) {",
      "  return <tr ref={props.nodeRef}><td>{props.label}</td></tr>;",
      "}",
      "export function App() {",
      "  const [state, dispatch] = useReducer((s: { rows: { id: number; label: string }[] }) => s, { rows: [] });",
      "  void dispatch;",
      "  return state.rows.map((row) => <BrokenRow key={row.id} label={row.label} nodeRef={null} />);",
      "}",
    ].join("\n");

    const report = explainTransform({
      code,
      filename: "BrokenTable.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    const row = report.compatLowering.find((entry) => entry.component === "BrokenRow");
    const app = report.compatLowering.find((entry) => entry.component === "App");

    expect(row).toMatchObject({
      path: "vdom",
      optimized: false,
      fallback: true,
      reasons: ["unsupported-dynamic-attribute"],
      details: [expect.stringContaining("ref")],
    });
    expect(app).toMatchObject({
      path: "vdom",
      optimized: false,
      fallback: true,
      reasons: ["root-list-item-not-prop-block"],
      details: [expect.stringContaining("BrokenRow")],
    });

    const formatted = formatCompatLoweringReport(report.filename, report.compatLowering);
    expect(formatted).toContain("BrokenRow");
    expect(formatted).toContain("unsupported-dynamic-attribute");
    expect(formatted).toContain("root-list-item-not-prop-block");
    expect(formatted).toContain("Summary: 0 optimized, 2 VDOM fallbacks");
  });

  test("reports specific reasons for unsupported parameters, imported root-list items, and parameter shadowing", () => {
    const code = [
      'import { useReducer } from "@reckona/mreact-compat";',
      'import { ImportedRow } from "./row";',
      "export function ComplexParams({ label = 'x' }: { label?: string }) {",
      "  return <div>{label}</div>;",
      "}",
      "export function ImportedList() {",
      "  const [state, dispatch] = useReducer((s: { rows: { id: number }[] }) => s, { rows: [] });",
      "  void dispatch;",
      "  return state.rows.map((row) => <ImportedRow key={row.id} row={row} />);",
      "}",
      "function ShadowRow(row: { label: string }) {",
      "  return <tr><td>{row.label}</td></tr>;",
      "}",
      "export function ShadowList() {",
      "  const [state, dispatch] = useReducer((s: { rows: { id: number; label: string }[] }) => s, { rows: [] });",
      "  void dispatch;",
      "  return state.rows.map((row) => <ShadowRow key={row.id} label={row.label} />);",
      "}",
    ].join("\n");

    const output = transform({
      code,
      filename: "EdgeCases.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
      reportCompatLowering: true,
    });
    const byName = new Map(
      (output.metadata.compatLowering ?? []).map((entry) => [entry.component, entry]),
    );

    expect(byName.get("ComplexParams")?.reasons).toContain("unsupported-parameters");
    expect(byName.get("ImportedList")?.reasons).toContain("root-list-item-not-same-module");
    expect(byName.get("ShadowList")?.reasons).toContain("root-list-param-shadowing");
  });

  test("reports class components (Component, PureComponent, and TypeScript generics) as VDOM fallbacks", () => {
    const code = [
      'import React, { Component, PureComponent, type ReactCompatNode } from "@reckona/mreact-compat";',
      "export class Counter extends Component {",
      "  state = { count: 1 };",
      "  render() {",
      "    return <p>{this.state.count}</p>;",
      "  }",
      "}",
      "export class TypedCounter extends React.Component<{ label: string }, { count: number }> {",
      "  render(): ReactCompatNode {",
      "    return <span>{this.props.label}</span>;",
      "  }",
      "}",
      "export default class Item extends PureComponent<{ label: string }> {",
      "  render(): ReactCompatNode {",
      "    return <li>{this.props.label}</li>;",
      "  }",
      "}",
    ].join("\n");

    const prod = explainTransform({
      code,
      filename: "Classes.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(prod.compatLowering).toEqual([
      expect.objectContaining({
        component: "Counter",
        exportName: "Counter",
        path: "vdom",
        optimized: false,
        fallback: true,
        reasons: ["class-component"],
      }),
      expect.objectContaining({
        component: "TypedCounter",
        exportName: "TypedCounter",
        path: "vdom",
        optimized: false,
        fallback: true,
        reasons: ["class-component"],
      }),
      expect.objectContaining({
        component: "Item",
        exportName: "default",
        path: "vdom",
        optimized: false,
        fallback: true,
        reasons: ["class-component"],
      }),
    ]);

    const devReport = explainTransform({
      code,
      filename: "Classes.compat.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });
    expect(devReport.compatLowering[0]?.reasons).toEqual(["dev-mode", "class-component"]);
  });

  test("distinguishes keyed unsupported .map() expressions from missing keys", () => {
    const code = [
      'import { createElement, useReducer } from "@reckona/mreact-compat";',
      "function Row(props: { row: { id: number }; index: number }) {",
      "  return <tr><td>{props.row.id}:{props.index}</td></tr>;",
      "}",
      "export function KeyedWithIndex() {",
      "  const [state, dispatch] = useReducer((s: { rows: { id: number }[] }) => s, { rows: [] });",
      "  void dispatch;",
      "  return state.rows.map((row, index) => createElement(Row, { key: row.id, row, index }));",
      "}",
      "export function MissingKey() {",
      "  const [state, dispatch] = useReducer((s: { rows: { id: number }[] }) => s, { rows: [] });",
      "  void dispatch;",
      "  return state.rows.map((row) => createElement(Row, { row, index: 0 }));",
      "}",
    ].join("\n");

    const output = transform({
      code,
      filename: "MapShapes.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
      reportCompatLowering: true,
    });
    const byName = new Map(
      (output.metadata.compatLowering ?? []).map((entry) => [entry.component, entry]),
    );

    expect(byName.get("KeyedWithIndex")?.reasons).toEqual(["root-list-unsupported-expression"]);
    expect(byName.get("MissingKey")?.reasons).toEqual(["root-list-missing-key"]);
  });

  test("diagnoses the real js-framework-benchmark mreact-react-compat fixture and detects VDOM regressions", async () => {
    const fixtureUrl = new URL(
      "../../../benchmarks/js-framework-benchmark/frameworks/keyed/mreact-react-compat/src/main.tsx",
      import.meta.url,
    );
    const source = await readFile(fixtureUrl, "utf8");

    const optimizedReport = explainTransform({
      code: source,
      filename: "mreact-react-compat/src/main.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(optimizedReport.compatLowering).toEqual([
      expect.objectContaining({
        component: "Row",
        path: "prop-reactive-dom-block",
        optimized: true,
        fallback: false,
        reasons: [],
      }),
      expect.objectContaining({
        component: "App",
        path: "root-list-reactive-dom-block",
        optimized: true,
        fallback: false,
        reasons: [],
      }),
    ]);

    const regressedSource = source.replace(
      '<tr className={props.selected ? "danger" : ""}>',
      '<tr ref={null} className={props.selected ? "danger" : ""}>',
    );
    const regressedReport = explainTransform({
      code: regressedSource,
      filename: "mreact-react-compat/src/main.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(regressedReport.compatLowering).toEqual([
      expect.objectContaining({
        component: "Row",
        path: "vdom",
        optimized: false,
        fallback: true,
        reasons: ["unsupported-dynamic-attribute"],
      }),
      expect.objectContaining({
        component: "App",
        path: "vdom",
        optimized: false,
        fallback: true,
        reasons: ["root-list-item-not-prop-block"],
      }),
    ]);
  });

  test.each(PICT_CASES)(
    "PICT case [%s | %s | %s | %s] matches emitted code and diagnostic invariants",
    (buildMode: BuildMode, shape: ComponentShape, rootKind: RootNodeKind, blocker: BlockerFeature) => {
      const { code, componentName } = buildPictFixture(shape, rootKind, blocker);
      const dev = buildMode === "dev";
      const ordinary = transform({
        code,
        filename: "PictCase.compat.tsx",
        target: "client",
        dev,
        mode: "compat",
      });
      const reported = transform({
        code,
        filename: "PictCase.compat.tsx",
        target: "client",
        dev,
        mode: "compat",
        reportCompatLowering: true,
      });

      expect(reported.code).toBe(ordinary.code);
      const entry = reported.metadata.compatLowering?.find(
        (item) => item.component === componentName,
      );
      expect(entry).toBeDefined();

      const hasSafeDirectText =
        shape === "stateful-text" &&
        rootKind !== "component" &&
        blocker !== "controlled-input-value" &&
        blocker !== "imported-child-component";
      const expectedPath: CompatLoweringPath =
        dev
          ? hasSafeDirectText
            ? "vdom-direct-text"
            : "vdom"
          : blocker !== "none"
            ? hasSafeDirectText
              ? "vdom-direct-text"
              : "vdom"
            : shape === "stateful-root-list"
              ? "root-list-reactive-dom-block"
              : shape === "stateful-text" && rootKind === "host-element"
                ? "reactive-dom-block"
                : (shape === "stateless-props" || shape === "stateless-destructured") &&
                    rootKind === "host-element"
                  ? "prop-reactive-dom-block"
                  : hasSafeDirectText
                    ? "vdom-direct-text"
                    : "vdom";

      expect(entry?.path).toBe(expectedPath);
      expect(entry?.optimized).toBe(expectedPath !== "vdom" && expectedPath !== "vdom-direct-text");
      expect(entry?.fallback).toBe(!entry?.optimized);

      if (entry?.optimized) {
        expect(entry.reasons).toEqual([]);
        expect(reported.code).toContain("createReactiveDomBlock");
      } else {
        expect(entry?.reasons.length).toBeGreaterThan(0);
        const expectedReason: CompatLoweringReason | undefined =
          dev
            ? "dev-mode"
            : blocker === "ref-attr" || blocker === "controlled-input-value"
              ? "unsupported-dynamic-attribute"
              : blocker === "imported-child-component"
                ? "unsupported-child-component"
                : blocker === "static-only"
                  ? "no-dynamic-part"
                  : blocker === "unkeyed-list"
                    ? "root-list-missing-key"
                    : rootKind === "keyed-host-element"
                      ? "root-has-key"
                      : rootKind === "fragment" || rootKind === "component"
                        ? "unsupported-root-kind"
                        : shape === "stateful-complex"
                          ? "has-body-statements"
                          : undefined;
        if (expectedReason !== undefined) {
          expect(entry?.reasons).toContain(expectedReason);
        }
      }
    },
  );
});
