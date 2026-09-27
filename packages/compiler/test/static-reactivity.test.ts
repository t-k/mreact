import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { analyzeToIr } from "../src/internal.js";
import type { ModuleIr } from "../src/ir.js";
import {
  emitClosedDirectCellAttachRoute,
  hasClosedDirectCellTextRoute,
} from "../src/static-reactivity.js";

function analyzeRoute(component: string): ModuleIr {
  const analyzed = analyzeToIr({
    code: `import { cell } from "@reckona/mreact-reactive-core"; ${component}`,
    filename: "page.mreact.tsx",
    target: "client",
    options: {
      topLevelJsx: "diagnostic",
      bodyStatementJsx: "dom-node",
      awaitCompatComponents: "diagnostic",
    },
  });
  expect(analyzed.diagnostics).toEqual([]);
  return analyzed.ir;
}

function provesClosedRoute(component: string): boolean {
  return hasClosedDirectCellTextRoute(analyzeRoute(component));
}

describe("closed direct-cell route proof", () => {
  test("accepts an isolated literal cell with direct text and event binding", () => {
    expect(
      provesClosedRoute(`export default function Page() {
  const count = cell(0);
  return <main><button onClick={() => count.set((value) => value + 1)}>{count.get()}</button></main>;
}`),
    ).toBe(true);
    expect(
      provesClosedRoute(
        `export default function Page() { const count = cell(42); return <p>{count.get()}</p>; }`,
      ),
    ).toBe(true);
  });

  test.each([
    `export default function Page(props) { const count = cell(0); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0); const label = count.get(); return <p>{label}</p>; }`,
    `export default function Page() { const count = cell(0); return <p className={count.get()}>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0); return <p>{count.get() && "open"}</p>; }`,
    `export default function Page() { const count = cell(0); return <p>{count.get().map((item) => <b>{item}</b>)}</p>; }`,
    `export default function Page() { const count = cell(Date.now()); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0); return <p onClick={count.get()}>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(1 + 2); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(-1); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0.5); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell("0"); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0); return <p onClick={() => count.set(1)}>static</p>; }`,
    `export function Page() { const count = cell(0); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0); return <>{count.get()}</>; }`,
    `export default function Page() { const count = cell(0); return <p>{count.get()}</p>; } function Other() { return <p>other</p>; }`,
    `export default async function Page() { const count = cell(0); return <p>{count.get()}</p>; }`,
    `export default function Page() { const count = cell(0); return <svg><text>{count.get()}</text></svg>; }`,
  ])("rejects a route whose render may need tracked updates: %s", (source) => {
    expect(provesClosedRoute(source)).toBe(false);
  });

  test("rejects malformed or expanded component facts", () => {
    const source = `export default function Page() { const count = cell(0); return <p>{count.get()}</p>; }`;
    const baseline = analyzeRoute(source);
    const component = baseline.components[0]!;

    expect(hasClosedDirectCellTextRoute({ ...baseline, components: [] })).toBe(false);
    expect(hasClosedDirectCellTextRoute({ ...baseline, components: [undefined as never] })).toBe(
      false,
    );
    expect(
      hasClosedDirectCellTextRoute({
        ...baseline,
        components: [{ ...component, reassigned: true }],
      }),
    ).toBe(false);
    expect(
      hasClosedDirectCellTextRoute({ ...baseline, components: [{ ...component, async: true }] }),
    ).toBe(false);
    expect(
      hasClosedDirectCellTextRoute({
        ...baseline,
        components: [{ ...component, bodyStatements: [] }],
      }),
    ).toBe(false);
    expect(
      hasClosedDirectCellTextRoute({
        ...baseline,
        components: [{ ...component, bindingNames: [] }],
      }),
    ).toBe(false);
    expect(
      hasClosedDirectCellTextRoute({
        ...baseline,
        components: [{ ...component, bindingNames: ["count", "other"] }],
      }),
    ).toBe(false);
    expect(
      hasClosedDirectCellTextRoute({
        ...baseline,
        components: [{ ...component, root: { kind: "text", value: "static" } }],
      }),
    ).toBe(false);
  });
});

describe("closed direct-cell attach output", () => {
  test("attaches only the live text and event targets in existing nested DOM", () => {
    const ir = analyzeRoute(`export const clientNavigation = false;
export default function Page() {
  const count = cell(0);
  return <main><p onClick={() => count.set(7)}>Static</p><button onClick={() => count.set(value => value + 1)}>{count.get()}</button></main>;
}`);
    const code = emitClosedDirectCellAttachRoute(ir);
    expect(code).toBeDefined();
    expect(code).toContain('import { bindEvent } from "@reckona/mreact-reactive-dom";');

    const text = { nodeType: 3, textContent: "0" };
    const button = { nodeType: 1, localName: "button", childNodes: [text] };
    const staticText = { nodeType: 3, textContent: "Static" };
    const paragraph = { nodeType: 1, localName: "p", childNodes: [staticText] };
    const main = { nodeType: 1, localName: "main", childNodes: [paragraph, button] };
    const events = new Map<object, () => void>();
    const boundTexts: object[] = [];
    let createdCells = 0;
    const attach = runInNewContext(
      `${code!.replace(/^import .*;\n/gmu, "")}\n__mreactAttachRoute`,
      {
        cell(initial: number) {
          createdCells += 1;
          let value = initial;
          const listeners: Array<() => void> = [];
          return {
            get: () => value,
            set(next: number | ((current: number) => number)) {
              value = typeof next === "function" ? next(value) : next;
              listeners.forEach((listener) => listener());
            },
            subscribe(listener: () => void) {
              listeners.push(listener);
            },
          };
        },
        bindCellText(
          target: typeof text,
          source: { get: () => number; subscribe: (listener: () => void) => void },
        ) {
          boundTexts.push(target);
          source.subscribe(() => {
            target.textContent = String(source.get());
          });
        },
        bindEvent(target: object, _event: string, listener: () => void) {
          events.set(target, listener);
        },
      },
    ) as (marker: { firstChild: object }) => boolean;

    expect(attach({ firstChild: main })).toBe(true);
    expect(createdCells).toBe(1);
    expect(boundTexts).toEqual([text]);
    expect([...events.keys()]).toEqual([paragraph, button]);
    events.get(button)!();
    expect(text.textContent).toBe("1");
    events.get(paragraph)!();
    expect(text.textContent).toBe("7");
    expect(staticText.textContent).toBe("Static");

    expect(
      attach({ firstChild: { ...main, childNodes: [paragraph, { ...button, localName: "a" }] } }),
    ).toBe(false);
    expect(createdCells).toBe(1);
  });

  test("references only live DOM targets and omits static HTML", () => {
    const ir = analyzeRoute(`export const clientNavigation = false;
export default function Page() {
  const count = cell(0);
  return <main><p>Static content that stays on the server</p><button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button></main>;
}`);
    const code = emitClosedDirectCellAttachRoute(ir);

    expect(code).toContain("bindCellText");
    expect(code).toContain("bindEvent");
    expect(code).toContain("childNodes[1]");
    expect(code).not.toContain("Static content that stays on the server");
    expect(code).not.toContain("createTemplate");
  });

  test("does not emit a validation record for each static sibling", () => {
    const page = (staticContent: string) =>
      analyzeRoute(`export const clientNavigation = false;
export default function Page() { const count = cell(0); return <main>${staticContent}<button onClick={() => count.set(1)}>{count.get()}</button></main>; }`);
    const one = emitClosedDirectCellAttachRoute(page("<p>static</p>"))!;
    const many = emitClosedDirectCellAttachRoute(page("<p>static</p>".repeat(100)))!;

    expect(many.length - one.length).toBeLessThan(20);
  });

  test("omits the event module when only text is bound", () => {
    const ir = analyzeRoute(`export const clientNavigation = false;
export default function Page() { const count = cell(0); return <main><p>{count.get()}</p></main>; }`);
    const code = emitClosedDirectCellAttachRoute(ir);

    expect(code).toContain('import { bindCellText } from "@reckona/mreact-reactive-dom/internal";');
    expect(code).not.toContain('import { bindEvent } from "@reckona/mreact-reactive-dom";');
  });

  test.each([
    `export default function Page() { const count = cell(0); return <button onClick={() => count.set(1)}>Count: {count.get()}</button>; }`,
    `export default function Page() { const count = cell(0); return <table><tr><td>{count.get()}</td></tr></table>; }`,
    `export default function Page() { const count = cell(0); return <p><span>{count.get()}</span></p>; }`,
    `export default function Page() { const count = cell(0); return <button onClick={() => count.set(1)}>{count.get()}</button>; } const label = "extra";`,
  ])("does not emit attach code for an unsupported DOM or module shape: %s", (source) => {
    expect(emitClosedDirectCellAttachRoute(analyzeRoute(source))).toBeUndefined();
  });
});
