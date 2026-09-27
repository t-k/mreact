import { describe, expect, test } from "vitest";
import { analyzeToIr } from "../src/internal.js";
import type { ModuleIr } from "../src/ir.js";
import { hasClosedDirectCellTextRoute } from "../src/static-reactivity.js";

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
