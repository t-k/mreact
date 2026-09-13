// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent, compileClientModule } from "./helpers.js";

test.each(
  [
    "<Button />",
    "<section><Button /></section>",
    "<><Button /></>",
    "<Wrapper><Button /></Wrapper>",
    "<Wrapper>{shown.get() ? <Button /> : null}</Wrapper>",
  ].flatMap((child) => [true, false].map((branchInsertion) => ({ child, branchInsertion }))),
)(
  "JSX setup reads recreate the component with $child (specialized branch: $branchInsertion)",
  async ({ child, branchInsertion }) => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
const shown = cell(true);
const busy = cell(false);
const label = cell("a");
let setups = 0;
function setup() { busy.get(); setups++; }
function Wrapper(props) { return <section>{props.children}</section>; }
function Button() {
  setup();
  return <button id="child" onClick={() => { busy.set(!busy.get()); label.set("b"); }}>{setups}:{label.get()}</button>;
}
export function App() {
  return <main><button id="toggle" onClick={() => shown.set(!shown.get())}>toggle</button>{shown.get() ? ${child} : null}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    expect(output.diagnostics).toEqual([]);
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(output.code));
    try {
      await flushEffects();
      const child = host.querySelector<HTMLButtonElement>("#child")!;
      expect(child.textContent).toBe("1:a");
      child.click();
      await flushEffects();
      expect(host.querySelector("#child")).not.toBe(child);
      expect(host.querySelector("#child")?.textContent).toBe("2:b");
      host.querySelector<HTMLButtonElement>("#toggle")!.click();
      await flushEffects();
      expect(host.querySelector("#child")).toBeNull();
      host.querySelector<HTMLButtonElement>("#toggle")!.click();
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("3:b");
    } finally {
      dispose();
    }
  },
);

test("JSX invocation preserves parent spread tracking and child-owned effects after setup recreation", async () => {
  const output = transform({
    code: `import { cell, effect } from "@reckona/mreact-reactive-core";
const shown = cell(true);
const values = cell({ label: "a" });
const busy = cell(false);
function Child({ label, ignored = busy.get() }) {
  const observed = cell("initial");
  effect(() => observed.set(busy.get() ? "busy" : "idle"));
  return <button id="child" onClick={() => busy.set(true)}>{label}:{observed.get()}</button>;
}
export function App() {
  return <main><button id="update" onClick={() => values.set({ label: "b" })}>update</button>{shown.get() ? <Child {...values.get()} /> : null}</main>;
}`,
    filename: "App.tsx",
    target: "client",
    dev: false,
  });
  expect(output.diagnostics).toEqual([]);
  const host = document.createElement("div");
  const dispose = createRoot(host, compileClientComponent(output.code));
  try {
    await flushEffects();
    const child = host.querySelector<HTMLButtonElement>("#child")!;
    expect(child.textContent).toBe("a:idle");
    child.click();
    await flushEffects();
    expect(host.querySelector("#child")).not.toBe(child);
    expect(host.querySelector("#child")?.textContent).toBe("a:busy");
    host.querySelector<HTMLButtonElement>("#update")!.click();
    await flushEffects();
    expect(host.querySelector("#child")?.textContent).toBe("b:busy");
  } finally {
    dispose();
  }
});

test.each([true, false])(
  "tracks reads hidden by an imported parameterized helper (specialized branch: %s)",
  async (branchInsertion) => {
    const years = cell<number[]>([]);
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
import { readYears } from "./calendar-state";
const shown = cell(true);
let setups = 0;
function Calendar() {
  setups++;
  const previous = readYears(2026).filter((year) => year < 2026)[0];
  return <button id="month" disabled={previous === undefined}>{setups}:{previous ?? "none"}</button>;
}
export function App() { return <main>{shown.get() ? <Calendar /> : null}</main>; }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    expect(output.diagnostics).toEqual([]);
    const readYears = (_year: number) => years.get();
    const host = document.createElement("div");
    const { App } = compileClientModule(output.code, { readYears });
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      expect(host.querySelector("#month")?.textContent).toBe("1:none");
      years.set([2024]);
      await flushEffects();
      expect(host.querySelector("#month")?.textContent).toBe("2:2024");
    } finally {
      dispose();
    }
  },
);

test.each([true, false])(
  "replays direct reactive prop setup decisions (specialized branch: %s)",
  async (branchInsertion) => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
const selected = cell(null);
const shown = cell(true);
let setups = 0;
let starts = 0;
function Viewer(props) {
  setups++;
  if (props.item.get()) queueMicrotask(() => starts++);
  return <section id="viewer" data-setups={setups}>{props.item.get()?.id ?? "closed"}</section>;
}
export function App() {
  return <main><button id="open" onClick={() => selected.set({ id: "photo" })}>open</button><button id="starts" onClick={(event) => event.currentTarget.textContent = String(starts)}>starts</button>{shown.get() ? <Viewer item={selected} /> : null}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    expect(output.diagnostics).toEqual([]);
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(output.code));
    try {
      await flushEffects();
      host.querySelector<HTMLButtonElement>("#open")!.click();
      await flushEffects();
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("#starts")!.click();
      expect(host.querySelector("#starts")?.textContent).toBe("1");
      expect(host.querySelector("#viewer")?.getAttribute("data-setups")).toBe("2");
      expect(host.querySelector("#viewer")?.textContent).toBe("photo");
    } finally {
      dispose();
    }
  },
);

test.each([true, false])(
  "does not loop when tracked setup reads and synchronously writes the same cell (specialized branch: %s)",
  async (branchInsertion) => {
    const source = cell("closed");
    const guard = cell(false);
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
import { readSource, toggleGuard } from "./state";
const shown = cell(true);
let setups = 0;
function Child() {
  setups++;
  const value = readSource();
  toggleGuard();
  return <p id="child" data-setups={setups}>{value}</p>;
}
export function App() { return <main>{shown.get() ? <Child /> : null}</main>; }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    expect(output.diagnostics).toEqual([]);
    const readSource = () => source.get();
    const toggleGuard = () => guard.set(!guard.get());
    const host = document.createElement("div");
    const { App } = compileClientModule(output.code, { readSource, toggleGuard });
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      expect(host.querySelector("#child")?.getAttribute("data-setups")).toBe("1");
      source.set("open");
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("open");
      expect(host.querySelector("#child")?.getAttribute("data-setups")).toBe("2");
    } finally {
      dispose();
    }
  },
);

test.each([true, false])(
  "tracks hidden setup reads through an imported compiled component (specialized branch: %s)",
  async (branchInsertion) => {
    const source = cell("closed");
    const childOutput = transform({
      code: `import { readValue } from "./state";
let setups = 0;
export function Child() {
  setups++;
  const value = readValue();
  return <p id="child" data-setups={setups}>{value}</p>;
}`,
      filename: "Child.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    const parentOutput = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
import { Child } from "./Child";
const shown = cell(true);
export function App() { return <main>{shown.get() ? <Child /> : null}</main>; }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    expect(childOutput.diagnostics).toEqual([]);
    expect(parentOutput.diagnostics).toEqual([]);
    const { Child } = compileClientModule(childOutput.code, {
      readValue: () => source.get(),
    });
    const { App } = compileClientModule(parentOutput.code, { Child });
    const host = document.createElement("div");
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("closed");
      source.set("open");
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("open");
      expect(host.querySelector("#child")?.getAttribute("data-setups")).toBe("2");
    } finally {
      dispose();
    }
  },
);

test.each([true, false])(
  "uses the current reassigned component while retaining setup tracking (specialized branch: %s)",
  async (branchInsertion) => {
    const source = cell("closed");
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
import { bump, readValue } from "./state";
const shown = cell(true);
let firstSetups = 0;
function First() {
  firstSetups++;
  if (readValue() === "open") queueMicrotask(() => {});
  return <p id="child" data-setups={firstSetups}>first</p>;
}
function Second() { return <p id="child">second</p>; }
let Current = First;
export function App() {
  return <main><button id="swap" onClick={() => { Current = Second; bump(); }}>swap</button>{shown.get() ? <Current /> : null}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      clientSpecializations: { branchInsertion },
    });
    expect(output.diagnostics).toEqual([]);
    const host = document.createElement("div");
    const { App } = compileClientModule(output.code, {
      bump: () => source.set("open"),
      readValue: () => source.get(),
    });
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("first");
      host.querySelector<HTMLButtonElement>("#swap")!.click();
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("second");
    } finally {
      dispose();
    }
  },
);
