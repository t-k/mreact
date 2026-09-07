import { describe, expect, test } from "vitest";
import { analyzeToIr } from "../src/internal.js";
import {
  UNKNOWN_EXPRESSION_FACTS,
  mergeExpressionFacts,
  readExpressionFacts,
} from "../src/expression-facts.js";
import type { ExpressionFactsIr } from "../src/expression-facts.js";
import type { ConditionalIr, ExprIr, JsxNodeIr } from "../src/ir.js";

function analyzeClientRoot(code: string): JsxNodeIr {
  const output = analyzeToIr({ code, filename: "App.tsx", target: "client" });

  expect(output.diagnostics).toEqual([]);
  const root = output.ir.components[0]?.root;

  if (root === undefined) {
    throw new Error("Expected the analyzed module to expose one component root.");
  }

  return root;
}

function findExpressions(node: JsxNodeIr, found: ExprIr[] = []): ExprIr[] {
  if (node.kind === "expr") {
    found.push(node);
    return found;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) findExpressions(child, found);
    return found;
  }

  if (node.kind === "element" || node.kind === "fragment" || node.kind === "list") {
    for (const child of node.children) findExpressions(child, found);
  }

  return found;
}

function onlyExpressionFacts(root: JsxNodeIr): ExpressionFactsIr {
  const expressions = findExpressions(root);

  if (expressions.length !== 1) {
    throw new Error(`Expected exactly one lowered expression, found ${expressions.length}.`);
  }

  return readExpressionFacts(expressions[0] as ExprIr);
}

describe("compiler expression facts", () => {
  test("proves a component-scoped native cell read and records its declaration span", () => {
    const code = `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main>{count.get()}</main>;
}`;
    const facts = onlyExpressionFacts(analyzeClientRoot(code));

    expect(facts.value.kind).toBe("native-cell-read");

    if (facts.value.kind !== "native-cell-read") return;

    expect(facts.value.binding.name).toBe("count");
    expect(code.slice(facts.value.binding.start, facts.value.binding.end)).toBe("count = cell(0)");
    expect(facts.dependencies).toEqual([facts.value.binding]);
    expect(facts.effectFree).toBe("proven");
  });

  test("proves a native cell read through an aliased cell factory import", () => {
    const facts = onlyExpressionFacts(
      analyzeClientRoot(`import { cell as makeCell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = makeCell(0);
  return <main>{count.get()}</main>;
}`),
    );

    expect(facts.value.kind).toBe("native-cell-read");
  });

  test("keeps a same-named binding from another factory unknown", () => {
    const facts = onlyExpressionFacts(
      analyzeClientRoot(`import { cell } from "@reckona/mreact-other-core";
export function App() {
  const count = cell(0);
  return <main>{count.get()}</main>;
}`),
    );

    expect(facts).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("still proves a module cell read inside a list renderer that shadows other names", () => {
    const root = analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
const count = cell(0);
export function App(props) {
  return <ul>{props.rows.map((row) => <li>{count.get()}</li>)}</ul>;
}`);

    expect(onlyExpressionFacts(root).value.kind).toBe("native-cell-read");
  });

  test("keeps a component parameter that shadows a module cell unknown", () => {
    const root = analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
const count = cell(0);
export function App(count) {
  return <main>{count.get()}</main>;
}`);

    expect(onlyExpressionFacts(root)).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("keeps a reactive alias that shadows a module cell unknown", () => {
    const root = analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
const source = cell(0);
const count = cell(1);
export function App() {
  const count = source.get();
  return <main>{count.get()}</main>;
}`);

    expect(onlyExpressionFacts(root)).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("resolves a list parameter that shadows a module cell to the shadowing binding", () => {
    const root = analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
const count = cell(0);
export function App() {
  const rows = [{ get: () => "row" }];
  return <ul>{rows.map((count) => <li>{count.get()}</li>)}</ul>;
}`);

    expect(onlyExpressionFacts(root)).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("keeps a cell binding unknown once its get method is replaced", () => {
    const facts = onlyExpressionFacts(
      analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  count.get = () => 42;
  return <main>{count.get()}</main>;
}`),
    );

    expect(facts).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("keeps a reassignable cell binding unknown", () => {
    const facts = onlyExpressionFacts(
      analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  let count = cell(0);
  count = cell(1);
  return <main>{count.get()}</main>;
}`),
    );

    expect(facts).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("keeps a computed read on top of a cell unknown", () => {
    const facts = onlyExpressionFacts(
      analyzeClientRoot(`import { cell, computed } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  const doubled = computed(() => count.get() * 2);
  return <main>{doubled.get()}</main>;
}`),
    );

    expect(facts).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("keeps an optional or argument-bearing get call unknown", () => {
    for (const expression of ["count?.get()", "count.get(1)", "count[read]()"]) {
      const facts = onlyExpressionFacts(
        analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
const read = "get";
export function App() {
  const count = cell(0);
  return <main>{${expression}}</main>;
}`),
      );

      expect(facts).toEqual(UNKNOWN_EXPRESSION_FACTS);
    }
  });

  test("merges conditional branch facts conservatively when the branches disagree", () => {
    const root = analyzeClientRoot(`import { cell } from "@reckona/mreact-reactive-core";
export function App(props) {
  const count = cell(0);
  return <main>{props.ready ? count.get() : props.label}</main>;
}`);
    const conditional = (root as Extract<JsxNodeIr, { kind: "element" }>)
      .children[0] as ConditionalIr;

    expect(conditional.kind).toBe("conditional");
    const [whenTrue] = findExpressions(conditional.whenTrue[0] as JsxNodeIr);
    const [whenFalse] = findExpressions(conditional.whenFalse[0] as JsxNodeIr);

    expect(readExpressionFacts(whenTrue as ExprIr).value.kind).toBe("native-cell-read");
    expect(readExpressionFacts(whenFalse as ExprIr)).toEqual(UNKNOWN_EXPRESSION_FACTS);
    expect(
      mergeExpressionFacts(
        readExpressionFacts(whenTrue as ExprIr),
        readExpressionFacts(whenFalse as ExprIr),
      ),
    ).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });

  test("merges identical branch facts into one proven fact and unions dependencies", () => {
    const binding = { name: "count", start: 1, end: 2 };
    const other = { name: "label", start: 5, end: 9 };
    const left: ExpressionFactsIr = {
      value: { kind: "native-cell-read", binding },
      dependencies: [binding],
      effectFree: "proven",
      escape: "unknown",
    };
    const right: ExpressionFactsIr = {
      value: { kind: "native-cell-read", binding },
      dependencies: [binding, other],
      effectFree: "proven",
      escape: "unknown",
    };

    expect(mergeExpressionFacts(left, right)).toStrictEqual({
      value: { kind: "native-cell-read", binding },
      dependencies: [binding, other],
      effectFree: "proven",
      escape: "unknown",
    });
    expect(mergeExpressionFacts(left, UNKNOWN_EXPRESSION_FACTS)).toStrictEqual(
      UNKNOWN_EXPRESSION_FACTS,
    );
  });

  test("merges two proven primitive branches into one primitive fact", () => {
    const root = analyzeClientRoot(`export function App(props) {
  return <main>{props.ready ? "ready" : "waiting"}</main>;
}`);
    const conditional = (root as Extract<JsxNodeIr, { kind: "element" }>)
      .children[0] as ConditionalIr;
    const whenTrue = readExpressionFacts(conditional.whenTrue[0] as ExprIr);
    const whenFalse = readExpressionFacts(conditional.whenFalse[0] as ExprIr);

    expect(whenTrue.value).toEqual({ kind: "renderable-primitive" });
    expect(whenFalse.value).toEqual({ kind: "renderable-primitive" });
    expect(mergeExpressionFacts(whenTrue, whenFalse).value).toEqual({
      kind: "renderable-primitive",
    });
    expect(mergeExpressionFacts(whenTrue, UNKNOWN_EXPRESSION_FACTS).value).toEqual({
      kind: "unknown",
    });
  });

  test("produces the same facts for equivalent client and server analyses", () => {
    const code = `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(0);
  return <main>{count.get()}</main>;
}`;
    const clientFacts = onlyExpressionFacts(analyzeClientRoot(code));
    const serverOutput = analyzeToIr({ code, filename: "App.tsx", target: "server" });
    const serverRoot = serverOutput.ir.components[0]?.root as JsxNodeIr;

    expect(serverOutput.diagnostics).toEqual([]);
    expect(onlyExpressionFacts(serverRoot)).toEqual(clientFacts);
  });
});
