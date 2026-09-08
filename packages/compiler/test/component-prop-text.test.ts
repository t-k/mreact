// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { analyzeToIr } from "../src/internal.js";
import { compileClientComponent, compileServerModule, runServerComponent } from "./helpers.js";
import type { ExprIr, JsxNodeIr } from "../src/ir.js";

interface CellHost {
  set(value: unknown): void;
}

type PropHost = typeof globalThis & { __badgeLabel?: CellHost };

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

function collectExpressions(node: JsxNodeIr, found: ExprIr[] = []): ExprIr[] {
  if (node.kind === "expr") {
    found.push(node);
    return found;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) collectExpressions(child, found);
    return found;
  }

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) collectExpressions(child, found);
      }
    }
  }

  if (
    node.kind === "element" ||
    node.kind === "fragment" ||
    node.kind === "list" ||
    node.kind === "component"
  ) {
    for (const child of node.children) collectExpressions(child, found);
  }

  return found;
}

const primitiveCallSites = `import { cell } from "@reckona/mreact-reactive-core";
function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  const count = cell(0);
  globalThis.__badgeLabel = { set: (next) => count.set(next) };
  return <main><Badge label="alpha" /><Badge label={count.get()} /></main>;
}`;

describe("compiler component prop text lowering", () => {
  test("binds a component prop child as text when every call site passes text", () => {
    const code = compile(primitiveCallSites);

    expect(code).toContain("bindText(");
    expect(code).not.toContain("insertRenderValue");
    expect(code).not.toContain("insertDynamic");
  });

  test("keeps the render value insertion when the component is exported", () => {
    const code = compile(`export function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="alpha" /></main>; }`);

    expect(code).toContain("insertRenderValue");
  });

  test("keeps the render value insertion when a call site cannot be proven text", () => {
    const unproven = [
      'function Badge(props) { return <span>{props.label}</span>; }\nexport function App(props) { return <main><Badge label={props.node} /></main>; }',
      'function Badge(props) { return <span>{props.label}</span>; }\nexport function App(props) { return <main><Badge {...props.rest} /></main>; }',
      'function Badge(props) { return <span>{props.label}</span>; }\nexport function App(props) { return <main><Badge label={props.make()} /></main>; }',
    ];

    for (const source of unproven) {
      expect(compile(source), source).toContain("insertRenderValue");
    }
  });

  test("keeps the render value insertion when only some call sites are proven text", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
function Badge(props) { return <span>{props.label}</span>; }
export function App(props) {
  const count = cell(0);
  return <main><Badge label={count.get()} /><Badge label={props.node} /></main>;
}`);

    // One unprovable call site is enough: the callee has to keep the generic
    // insertion for every call site, not just for that one.
    expect(code).toContain("insertRenderValue");
  });

  test("keeps the render value insertion when the component escapes as a value", () => {
    const code = compile(`function Badge(props) { return <span>{props.label}</span>; }
const registry = { Badge };
export function App() { return <main><Badge label="alpha" />{registry.Badge === Badge ? "" : ""}</main>; }`);

    expect(code).toContain("insertRenderValue");
  });

  test("keeps one shared component function for repeated lowered call sites", () => {
    // Every call site reads the same cell, so all four are lowered to text and
    // none of them folds into the caller, which is what keeps them sharing.
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  const count = cell(0);
  return <main><Badge label={count.get()} /><Badge label={count.get()} /><Badge label={count.get()} /><Badge label={count.get()} /></main>;
}`);

    expect(code.match(/function Badge\(/g)).toHaveLength(1);
    expect(code.match(/_tmpl_Badge/g)?.length).toBeGreaterThan(0);
    expect(code).not.toContain("insertRenderValue");
  });

  test("finds call sites through every lowered tree shape", () => {
    const shapes: [string, string][] = [
      ["conditional branch", "{props.open ? <Badge label={props.node} /> : null}"],
      ["list row", "{props.rows.map((row) => <Badge label={props.node} />)}"],
      ["fragment", "<><Badge label={props.node} /></>"],
      ["render prop", "<Shell slot={<Badge label={props.node} />} />"],
    ];

    for (const [scenario, body] of shapes) {
      const code = compile(`import { Shell } from "./Shell";
function Badge(props) { return <span>{props.label}</span>; }
export function App(props) { return <main>${body}</main>; }`);

      // The call site passes an unprovable value, so finding it must keep the
      // callee on the generic render value insertion.
      expect(code, scenario).toContain("insertRenderValue");
    }
  });

  test("keeps the render value insertion for a call site with children", () => {
    const code = compile(`function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="alpha">child</Badge></main>; }`);

    expect(code).toContain("insertRenderValue");
  });

  test("lowers a callee reached only through a nested tree shape", () => {
    const code = compile(`function Badge(props) { return <span>{props.label}</span>; }
export function App(props) { return <main>{props.open ? <Badge label="alpha" /> : null}</main>; }`);

    expect(code).not.toContain("insertRenderValue");
    expect(code).toContain("bindText(");
  });

  test("renders and updates a lowered component prop child", async () => {
    const code = compile(primitiveCallSites);
    const host = globalThis as PropHost;
    const container = document.createElement("div");
    const dispose = createRoot(container, compileClientComponent(code));

    try {
      await flushEffects();
      expect(container.textContent).toBe("alpha0");

      host.__badgeLabel?.set(7);
      await flushEffects();
      expect(container.textContent).toBe("alpha7");
    } finally {
      dispose();
      delete host.__badgeLabel;
    }
  });

  test("lowers the prop child on every target", () => {
    const renderModes = (target: "client" | "server"): (string | undefined)[] => {
      const output = analyzeToIr({ code: primitiveCallSites, filename: "App.tsx", target });

      expect(output.diagnostics).toEqual([]);
      const badge = output.ir.components.find((component) => component.name === "Badge");

      if (badge === undefined) {
        throw new Error("Expected the analyzed module to contain Badge.");
      }

      return collectExpressions(badge.root).map((expression) => expression.renderMode);
    };

    // Neither target keeps the render value classification: each server emitter
    // calls a lowered callee with its own convention rather than reading one off
    // the classification.
    expect(renderModes("client")).toEqual([undefined]);
    expect(renderModes("server")).toEqual([undefined]);
  });

  test("renders the same markup on the server as the client mounts", async () => {
    const source = `function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() { return <main><Badge label="alpha" /><Badge label="beta" /></main>; }`;
    const serverOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });

    expect(serverOutput.diagnostics).toEqual([]);
    const container = document.createElement("div");
    const dispose = createRoot(container, compileClientComponent(compile(source)));

    try {
      await flushEffects();
      expect(runServerComponent(serverOutput.code)).toBe(container.innerHTML);
    } finally {
      dispose();
    }
  });

  test("renders the same markup on the server as the client mounts for a dynamic prop", async () => {
    const serverOutput = transform({
      code: primitiveCallSites,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });

    expect(serverOutput.diagnostics).toEqual([]);
    const clientCode = compile(primitiveCallSites);
    expect(clientCode).not.toContain("insertRenderValue");
    const serverModule = compileServerModule(serverOutput.code, { cell });
    const serverApp = serverModule.App as () => string;
    const container = document.createElement("div");
    const dispose = createRoot(container, compileClientComponent(clientCode));

    try {
      await flushEffects();
      expect(serverApp()).toBe(container.innerHTML);
    } finally {
      dispose();
    }
  });
});
