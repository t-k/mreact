// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import * as reactive from "@reckona/mreact-reactive-core";
import { transform } from "../src/index.js";
import { compileClientComponent, compileClientModule, compileServerModule } from "./helpers.js";

function compile(source: string, branchInsertion: boolean): string {
  const output = transform({
    code: source,
    filename: "App.tsx",
    target: "client",
    dev: false,
    clientSpecializations: { branchInsertion },
  });
  expect(output.diagnostics).toEqual([]);
  return output.code;
}

describe.each([true, false])("body-derived props (branch insertion: %s)", (branchInsertion) => {
  test("updates transitive props through nested components without repeating setup", async () => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
const selected = cell(null);
const busy = cell(false);
let setups = 0;
function getItem(id) { return id === null ? null : { id }; }
function Viewer(props) {
  const item = props.item;
  const hasItem = item !== null;
  return <section data-open={hasItem}>{hasItem ? item.id : "closed"}</section>;
}
function Selected() {
  setups++;
  busy.get();
  const id = selected.get();
  const item = getItem(id);
  return <div data-setups={setups}><Viewer item={item} /></div>;
}
export function App() {
  return <main><button id="open" onClick={() => selected.set("photo")}>open</button><button id="close" onClick={() => selected.set(null)}>close</button><button id="busy" onClick={() => busy.set(!busy.get())}>busy</button><Selected /></main>;
}`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));
    try {
      await flushEffects();
      const viewer = host.querySelector("section");
      expect(viewer?.textContent).toBe("closed");
      host.querySelector<HTMLButtonElement>("#open")!.click();
      await flushEffects();
      expect(host.querySelector("section")?.textContent).toBe("photo");
      expect(host.querySelector("section")).toBe(viewer);
      expect(viewer?.getAttribute("data-open")).toBe("true");
      host.querySelector<HTMLButtonElement>("#busy")!.click();
      await flushEffects();
      expect(host.querySelector("[data-setups]")?.getAttribute("data-setups")).toBe("1");
      expect(host.querySelector("section")).toBe(viewer);
      host.querySelector<HTMLButtonElement>("#close")!.click();
      await flushEffects();
      expect(viewer?.textContent).toBe("closed");
    } finally {
      dispose();
    }
  });

  test("uses the current component when a lazy tag becomes available or changes", async () => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
const loaded = cell(null);
function First() { return <b>first</b>; }
function Second() { return <b>second</b>; }
function Lazy() {
  const Loaded = loaded.get();
  return <section>{Loaded ? <Loaded /> : null}</section>;
}
export function App() {
  return <main><button id="first" onClick={() => loaded.set(() => First)}>first</button><button id="second" onClick={() => loaded.set(() => Second)}>second</button><button id="clear" onClick={() => loaded.set(null)}>clear</button><Lazy /></main>;
}`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));
    try {
      await flushEffects();
      expect(host.querySelector("section")?.textContent).toBe("");
      for (const id of ["first", "second", "clear"]) {
        host.querySelector<HTMLButtonElement>(`#${id}`)!.click();
        await flushEffects();
        expect(host.querySelector("section")?.textContent).toBe(id === "clear" ? "" : id);
      }
    } finally {
      dispose();
    }
  });

  test.each(["<Loaded />", "<section><Loaded /></section>"])(
    "updates an unconditional dynamic tag in %s",
    async (view) => {
      const code = compile(
        `import { cell } from "@reckona/mreact-reactive-core";
function First() { return <b>first</b>; }
function Second() { return <b>second</b>; }
const loaded = cell(First);
function Lazy() {
  const Loaded = loaded.get();
  return ${view};
}
export function App() {
  return <main><button onClick={() => loaded.set(() => Second)}>change</button><Lazy /></main>;
}`,
        branchInsertion,
      );
      const host = document.createElement("div");
      const dispose = createRoot(host, compileClientComponent(code));
      try {
        await flushEffects();
        expect(host.querySelector("b")?.textContent).toBe("first");
        host.querySelector("button")!.click();
        await flushEffects();
        expect(host.querySelector("b")?.textContent).toBe("second");
      } finally {
        dispose();
      }
    },
  );

  test("shares helper results across props and preserves declaration evaluation order", async () => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
const selected = cell(1);
let calls = 0;
function derive(id, suffix) { calls++; return id + suffix; }
function Leaf(props) { return <p data-value={props.value}>{props.value}:{props.other}</p>; }
function Child() {
  const suffix = 10, id = selected.get(), value = derive(id, suffix);
  return <Leaf value={value} other={value} />;
}
export function App() {
  return <main><button id="change" onClick={() => selected.set(2)}>change</button><button id="count" onClick={(event) => event.currentTarget.textContent = String(calls)}>count</button><Child /></main>;
}`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));
    try {
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("11:11");
      host.querySelector<HTMLButtonElement>("#count")!.click();
      expect(host.querySelector("#count")?.textContent).toBe("1");
      host.querySelector<HTMLButtonElement>("#change")!.click();
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("12:12");
      host.querySelector<HTMLButtonElement>("#count")!.click();
      expect(host.querySelector("#count")?.textContent).toBe("2");
    } finally {
      dispose();
    }
  });

  test("preserves state initialized from a prop while forwarding destructured props reactively", async () => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
const selected = cell("first");
function Leaf(props) { return <b>{props.value}</b>; }
function Child(props) {
  const state = cell(props.value);
  const { value } = props;
  return <section><i>{state.get()}</i><Leaf value={value} /></section>;
}
export function App() {
  return <main><button onClick={() => selected.set("second")}>change</button><Child value={selected.get()} /></main>;
}`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));
    try {
      await flushEffects();
      expect(host.querySelector("i")?.textContent).toBe("first");
      expect(host.querySelector("b")?.textContent).toBe("first");
      host.querySelector("button")!.click();
      await flushEffects();
      expect(host.querySelector("i")?.textContent).toBe("first");
      expect(host.querySelector("b")?.textContent).toBe("second");
    } finally {
      dispose();
    }
  });

  test("propagates body-derived values across separately compiled module boundaries", async () => {
    const viewer = compile(
      `export function Viewer(props) {
  const item = props.item;
  const label = item === null ? "closed" : item.id;
  return <section>{label}</section>;
}`,
      branchInsertion,
    );
    const parent = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
import { Viewer } from "./Viewer";
const selected = cell(null);
function lookup(id) { return id === null ? null : { id }; }
function Selected() {
  const id = selected.get();
  const item = lookup(id);
  return <Viewer item={item} />;
}
export function App() {
  return <main><button onClick={() => selected.set("photo")}>open</button><Selected /></main>;
}`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const { Viewer } = compileClientModule(viewer);
    const { App } = compileClientModule(parent, { Viewer });
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      expect(host.querySelector("section")?.textContent).toBe("closed");
      host.querySelector("button")!.click();
      await flushEffects();
      expect(host.querySelector("section")?.textContent).toBe("photo");
    } finally {
      dispose();
    }
  });

  test.each([
    { declaration: "const [value] = props.values", initial: '["first"]', next: '["second"]' },
    {
      declaration: "const { [key()]: value } = props.values",
      initial: '{ value: "first" }',
      next: '{ value: "second" }',
    },
  ])("caches destructuring from props: $declaration", async ({ declaration, initial, next }) => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
const values = cell(${initial});
let keys = 0;
function key() { keys++; return "value"; }
function Child(props) {
  ${declaration};
  return <p>{value}</p>;
}
export function App() {
  return <main><button onClick={() => values.set(${next})}>change</button><button id="keys" onClick={(event) => event.currentTarget.textContent = String(keys)}>keys</button><Child values={values.get()} /></main>;
}`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));
    try {
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("first");
      host.querySelector("button")!.click();
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("second");
      host.querySelector<HTMLButtonElement>("#keys")!.click();
      expect(host.querySelector("#keys")?.textContent).toBe(
        declaration.includes("key()") ? "1" : "0",
      );
    } finally {
      dispose();
    }
  });

  test("preserves namespace-imported cell initialization and explicit untracked resources", async () => {
    const code = compile(
      `import * as reactive from "@reckona/mreact-reactive-core";
const selected = reactive.cell("first");
let resources = 0;
function createResource(id) { resources++; return { id }; }
function Child(props) {
  const state = reactive.cell(props.value);
  const resource = reactive.untrack(() => createResource(props.value));
  return <section><i>{state.get()}</i><b>{resource.id}</b></section>;
}
export function App() {
  return <main><button onClick={() => selected.set("second")}>change</button><button id="count" onClick={(event) => event.currentTarget.textContent = String(resources)}>count</button><Child value={selected.get()} /></main>;
}`,
      branchInsertion,
    );
    const { App } = compileClientModule(code, { reactive });
    const host = document.createElement("div");
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      host.querySelector("button")!.click();
      await flushEffects();
      expect(host.querySelector("i")?.textContent).toBe("first");
      expect(host.querySelector("b")?.textContent).toBe("first");
      host.querySelector<HTMLButtonElement>("#count")!.click();
      expect(host.querySelector("#count")?.textContent).toBe("1");
    } finally {
      dispose();
    }
  });

  test.each([
    "derive(value)",
    "tools.derive(value)",
    "lookup.get(derive(value))",
    "value > 0 ? tools.derive(value) : null",
    "tools.derive(value) + 0",
  ])("shares a helper derivation in %s", async (expression) => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
import { derive, tools, lookup } from "./tools";
const selected = cell(1);
function Child() {
  const value = selected.get();
  const result = ${expression};
  return <p data-value={result}>{result}:{result}</p>;
}
export function App() { return <main><button onClick={() => selected.set(2)}>change</button><Child /></main>; }
`,
      branchInsertion,
    );
    let calls = 0;
    const tools = {
      derive: (value: number) => {
        calls++;
        return value;
      },
    };
    const { App } = compileClientModule(code, {
      tools,
      derive: tools.derive,
      lookup: new Map([
        [1, 1],
        [2, 2],
      ]),
    });
    const host = document.createElement("div");
    const dispose = createRoot(host, App);
    try {
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("1:1");
      expect(calls).toBe(1);
      host.querySelector("button")!.click();
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("2:2");
      expect(calls).toBe(2);
    } finally {
      dispose();
    }
  });

  test.each(["values.push(value)", 'values["push"](value)'])(
    "does not replay a mutating setup expression: %s",
    async (expression) => {
      const code = compile(
        `import { cell } from "@reckona/mreact-reactive-core";
import { values } from "./values";
const selected = cell(1);
function Child() {
  const value = selected.get();
  const count = ${expression};
  return <p>{count}</p>;
}
export function App() { return <main><button onClick={() => selected.set(2)}>change</button><Child /></main>; }
`,
        branchInsertion,
      );
      const values: number[] = [];
      const { App } = compileClientModule(code, { values });
      const host = document.createElement("div");
      const dispose = createRoot(host, App);
      try {
        await flushEffects();
        host.querySelector("button")!.click();
        await flushEffects();
        expect(host.querySelector("p")?.textContent).toBe("1");
        expect(values).toEqual([1]);
      } finally {
        dispose();
      }
    },
  );

  test("keeps independent destructuring caches and mutable snapshots", async () => {
    const code = compile(
      `import { cell } from "@reckona/mreact-reactive-core";
const selected = cell({ left: { first: "a" }, right: { second: "b" } });
function Child(props) {
  const { first } = props.left;
  const { second } = props.right;
  let snapshot = props.left;
  return <p>{first}:{second}:{snapshot.first}</p>;
}
export function App() { return <main><button onClick={() => selected.set({ left: { first: "c" }, right: { second: "d" } })}>change</button><Child left={selected.get().left} right={selected.get().right} /></main>; }
`,
      branchInsertion,
    );
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));
    try {
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("a:b:a");
      host.querySelector("button")!.click();
      await flushEffects();
      expect(host.querySelector("p")?.textContent).toBe("c:d:a");
    } finally {
      dispose();
    }
  });
});

test("server rendering evaluates helper-derived snapshots only once", () => {
  const output = transform({
    code: `import { cell } from "@reckona/mreact-reactive-core";
const selected = cell(1);
let calls = 0;
function derive(id) { calls++; return id; }
export function App() {
  const value = derive(selected.get());
  return <p>{value}:{value}:{calls}</p>;
}`,
    filename: "App.tsx",
    target: "server",
    dev: false,
  });
  expect(output.diagnostics).toEqual([]);
  const { App } = compileServerModule(output.code, { cell: reactive.cell });
  expect((App as () => string)().replaceAll("<!-- -->", "")).toBe("<p>1:1:1</p>");
});

test("keeps helper reads tracked in an explicitly invoked component effect", async () => {
  const selected = reactive.cell(1);
  const values: number[] = [];
  const code = compile(
    `import { selected, capture } from "./state";
function derive(value) { return value * 2; }
export function App() {
  const result = derive(selected.get());
  capture(result);
  return <p>fixed</p>;
}`,
    true,
  );
  const { App } = compileClientModule(code, {
    selected,
    capture: (value: number) => values.push(value),
  });
  const dispose = reactive.effect(() => {
    App();
  });
  try {
    await flushEffects();
    expect(values).toEqual([2]);
    selected.set(2);
    await flushEffects();
    expect(values).toEqual([2, 4]);
  } finally {
    dispose();
  }
});

test("keeps generated derivation names distinct from user bindings and each other", async () => {
  const prefix = `import { selected } from "./state";
function derive(value) { return value + 1; }
export function App() {
  const first = derive(selected.get());
  const second = derive(first);
`;
  const reserved = `__mreactDerived_${prefix.indexOf("first =")}`;
  const code = compile(
    `${prefix}
  const ${reserved} = "user";
  return <p>{first}:{second}:{${reserved}}</p>;
}`,
    true,
  );
  const selected = reactive.cell(1);
  const { App } = compileClientModule(code, { selected });
  const host = document.createElement("div");
  const dispose = createRoot(host, App);
  try {
    await flushEffects();
    expect(host.textContent).toBe("2:3:user");
    selected.set(2);
    await flushEffects();
    expect(host.textContent).toBe("3:4:user");
  } finally {
    dispose();
  }
});
