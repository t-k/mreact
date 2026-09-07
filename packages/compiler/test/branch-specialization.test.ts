// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

interface CellHost {
  get(): unknown;
  set(value: unknown): void;
}

type BranchHost = typeof globalThis & { __branchCondition?: CellHost };

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

/** Compiles a conditional component that publishes its condition cell. */
function mountConditional(body: string): {
  condition: CellHost;
  dispose: () => void;
  host: HTMLElement;
} {
  const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const open = cell(false);
  globalThis.__branchCondition = open;
  return <main>${body}</main>;
}`);

  expect(code).toContain("insertBranch(");
  expect(code).not.toContain("insertDynamic(");
  const host = document.createElement("div");
  document.body.append(host);
  const disposeRoot = createRoot(host, compileClientComponent(code));
  const condition = (globalThis as BranchHost).__branchCondition;

  if (condition === undefined) {
    throw new Error("Expected the compiled component to publish its condition cell.");
  }

  return {
    condition,
    dispose: () => {
      disposeRoot();
      host.remove();
      delete (globalThis as BranchHost).__branchCondition;
    },
    host,
  };
}

describe("compiler conditional branch specialization", () => {
  test("emits the branch binding for two native element branches", () => {
    const code = compile(`export function App(props) {
  return <main>{props.open ? <section>Open</section> : <p>Closed</p>}</main>;
}`);

    expect(code).toContain("insertBranch(_root, _root.childNodes[0], () =>");
    expect(code).not.toContain("insertDynamic");
    expect(code).toContain('from "@reckona/mreact-reactive-dom/internal"');
  });

  test("emits the branch binding for an element branch against an empty branch", () => {
    for (const source of [
      "props.open ? <section>Open</section> : null",
      "props.open ? <section>Open</section> : false",
      'props.open ? <section>Open</section> : "closed"',
      "props.open && <section>Open</section>",
      "props.open ? 1 : 2",
    ]) {
      const code = compile(`export function App(props) {
  return <main>{${source}}</main>;
}`);

      expect(code, source).toContain("insertBranch(");
      expect(code, source).not.toContain("insertDynamic");
    }
  });

  test("emits the branch binding for a component whose root is a conditional", () => {
    const code = compile(`export function App(props) {
  return props.open ? <section>Open</section> : <p>Closed</p>;
}`);

    expect(code).toContain("insertBranch(_fragment, _marker, () =>");
    expect(code).not.toContain("insertDynamic");
  });

  test("emits the branch binding for a conditional nested inside a branch", () => {
    const code = compile(`export function App(props) {
  return <main>{props.open ? (props.busy ? <b>Busy</b> : <i>Idle</i>) : <p>Closed</p>}</main>;
}`);

    expect(code).toContain("insertBranch(");
    expect(code).not.toContain("insertDynamic");
  });

  test("keeps a nested list branch on the generic dynamic insertion", () => {
    const code = compile(`export function App(props) {
  return <main>{props.open ? (props.busy ? props.rows.map((row) => <li>{row}</li>) : <i>Idle</i>) : <p>Closed</p>}</main>;
}`);

    expect(code).toContain("insertDynamic");
    expect(code).not.toContain("insertBranch");
  });

  test("keeps a list-producing branch on the generic dynamic insertion", () => {
    const code = compile(`export function App(props) {
  return <main>{props.open ? props.rows.map((row) => <li>{row}</li>) : <p>Closed</p>}</main>;
}`);

    expect(code).toContain("insertDynamic");
    expect(code).not.toContain("insertBranch");
  });

  test("keeps component, render-value and unknown branches on the generic dynamic insertion", () => {
    for (const source of [
      "props.open ? <Card /> : <p>Closed</p>",
      "props.open ? props.node : <p>Closed</p>",
      "props.open ? props.render() : null",
    ]) {
      const code = compile(`function Card() { return <b>Card</b>; }
export function App(props) {
  return <main>{${source}}</main>;
}`);

      expect(code, source).toContain("insertDynamic");
      expect(code, source).not.toContain("insertBranch");
    }
  });

  test("mounts, unmounts and remounts each branch exactly once", async () => {
    const disposals: string[] = [];
    const state = globalThis as typeof globalThis & { __branchDisposals?: string[] };
    state.__branchDisposals = disposals;
    const { condition, dispose, host } = mountConditional(
      `{open.get() ? <section domRef={() => { globalThis.__branchDisposals.push("mount:true"); return () => globalThis.__branchDisposals.push("dispose:true"); }}>Open</section> : <p domRef={() => { globalThis.__branchDisposals.push("mount:false"); return () => globalThis.__branchDisposals.push("dispose:false"); }}>Closed</p>}`,
    );

    try {
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("Closed");

      for (const next of [true, false, true, false]) {
        condition.set(next);
        await flushEffects();
        expect(host.querySelectorAll("section, p")).toHaveLength(1);
        expect(host.textContent).toBe(next ? "Open" : "Closed");
      }

      expect(disposals.filter((entry) => entry === "dispose:true")).toHaveLength(2);
      expect(disposals.filter((entry) => entry === "dispose:false")).toHaveLength(2);
    } finally {
      dispose();
      delete state.__branchDisposals;
    }
  });

  test("replaces same-tag branches instead of reusing the mounted element", async () => {
    const { condition, dispose, host } = mountConditional(
      "{open.get() ? <input data-branch=\"true\" /> : <input data-branch=\"false\" />}",
    );

    try {
      await flushEffects();
      const first = host.querySelector("input") as HTMLInputElement;

      expect(first.dataset.branch).toBe("false");
      first.value = "typed";
      condition.set(true);
      await flushEffects();
      const second = host.querySelector("input") as HTMLInputElement;

      expect(second).not.toBe(first);
      expect(second.dataset.branch).toBe("true");
      expect(second.value).toBe("");
    } finally {
      dispose();
    }
  });

  test("updates a text branch and clears it when the condition turns falsy", async () => {
    const { condition, dispose, host } = mountConditional('{open.get() ? "Open" : "Closed"}');

    try {
      await flushEffects();
      expect(host.textContent).toBe("Closed");

      condition.set(true);
      await flushEffects();
      expect(host.textContent).toBe("Open");
    } finally {
      dispose();
    }
  });

  test("renders nothing for a falsy logical branch and keeps numeric values visible", async () => {
    const { condition, dispose, host } = mountConditional("{open.get() && <section>Open</section>}");

    try {
      await flushEffects();
      expect(host.textContent).toBe("");

      condition.set(true);
      await flushEffects();
      expect(host.textContent).toBe("Open");

      condition.set(0);
      await flushEffects();
      expect(host.textContent).toBe("0");
    } finally {
      dispose();
    }
  });

  test("disposes nested bindings inside a branch before the branch is removed", async () => {
    const events: string[] = [];
    const state = globalThis as typeof globalThis & { __branchEvents?: string[] };
    state.__branchEvents = events;
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const open = cell(true);
  const label = cell("first");
  globalThis.__branchCondition = open;
  globalThis.__branchLabel = label;
  return <main>{open.get() ? <section domRef={() => () => globalThis.__branchEvents.push("dispose")}>{label.get()}</section> : <p>Closed</p>}</main>;
}`);

    expect(code).toContain("insertBranch(");
    const host = document.createElement("div");
    document.body.append(host);
    const disposeRoot = createRoot(host, compileClientComponent(code));
    const dispose = () => {
      disposeRoot();
      host.remove();
    };
    const branchState = globalThis as BranchHost & { __branchLabel?: CellHost };

    try {
      await flushEffects();
      expect(host.textContent).toBe("first");

      branchState.__branchLabel?.set("second");
      await flushEffects();
      expect(host.textContent).toBe("second");

      branchState.__branchCondition?.set(false);
      await flushEffects();
      expect(host.textContent).toBe("Closed");
      expect(events).toEqual(["dispose"]);

      branchState.__branchLabel?.set("third");
      await flushEffects();
      expect(host.textContent).toBe("Closed");
    } finally {
      dispose();
      delete state.__branchEvents;
      delete branchState.__branchLabel;
    }
  });
});
