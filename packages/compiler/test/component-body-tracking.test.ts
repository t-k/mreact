// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

test.each(
  [
    "<Button />",
    "<section><Button /></section>",
    "<><Button /></>",
    "<Wrapper><Button /></Wrapper>",
    "<Wrapper>{shown.get() ? <Button /> : null}</Wrapper>",
  ].flatMap((child) => [true, false].map((branchInsertion) => ({ child, branchInsertion }))),
)(
  "JSX setup reads stay isolated with $child (specialized branch: $branchInsertion)",
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
      expect(host.querySelector("#child")).toBe(child);
      expect(child.textContent).toBe("1:b");
      host.querySelector<HTMLButtonElement>("#toggle")!.click();
      await flushEffects();
      expect(host.querySelector("#child")).toBeNull();
      host.querySelector<HTMLButtonElement>("#toggle")!.click();
      await flushEffects();
      expect(host.querySelector("#child")?.textContent).toBe("2:b");
    } finally {
      dispose();
    }
  },
);

test("JSX invocation preserves parent spread tracking and child-owned effects", async () => {
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
    expect(host.querySelector("#child")).toBe(child);
    expect(child.textContent).toBe("a:busy");
    host.querySelector<HTMLButtonElement>("#update")!.click();
    await flushEffects();
    expect(host.querySelector("#child")?.textContent).toBe("b:busy");
  } finally {
    dispose();
  }
});
