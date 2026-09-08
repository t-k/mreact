// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import type { ClientSpecializationFlags } from "../src/types.js";
import { compileClientComponent } from "./helpers.js";

/**
 * Every specialization replaces a generic runtime helper with a narrower one.
 * These tests compile the same component with one specialization switched off
 * and drive both mounts through the same script, so a specialized path that
 * only matches on the initial render is caught by the later steps.
 */

interface ParityControls {
  set(name: string, value: unknown): void;
  clicks: number;
}

type ParityHost = typeof globalThis & { __parity?: ParityControls };

interface ParityFixture {
  name: string;
  flag: keyof ClientSpecializationFlags;
  source: string;
  steps: ReadonlyArray<Record<string, unknown>>;
  clickSelector?: string;
}

const fixtures: ParityFixture[] = [
  {
    name: "direct cell text",
    flag: "directCellText",
    source: `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const count = cell(1);
  const label = cell("a");
  globalThis.__parity = {
    clicks: 0,
    set(name, value) { if (name === "count") count.set(value); else label.set(value); },
  };
  return <main><span>{count.get()}</span><em>{label.get()}</em><button onClick={() => { globalThis.__parity.clicks += 1; count.set(count.get() + 1); }}>+</button></main>;
}`,
    steps: [{ count: 2 }, { label: null }, { label: 0 }, { count: false }, { label: "z", count: 9 }],
    clickSelector: "button",
  },
  {
    name: "branch insertion",
    flag: "branchInsertion",
    source: `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const open = cell(false);
  const deep = cell(true);
  globalThis.__parity = {
    clicks: 0,
    set(name, value) { if (name === "open") open.set(value); else deep.set(value); },
  };
  return <main>{open.get() ? <b>{deep.get() ? <i>deep</i> : "flat"}</b> : <p>closed</p>}<button onClick={() => { globalThis.__parity.clicks += 1; open.set(!open.get()); }}>t</button></main>;
}`,
    steps: [{ open: true }, { deep: false }, { open: false }, { deep: true }, { open: true }],
    clickSelector: "button",
  },
  {
    name: "element property",
    flag: "elementProperty",
    source: `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const cls = cell("one");
  const title = cell("t");
  globalThis.__parity = {
    clicks: 0,
    set(name, value) { if (name === "cls") cls.set(value); else title.set(value); },
  };
  return <main><div class={cls.get()} id={cls.get() + "-id"} title={title.get()} lang={title.get()}>x</div></main>;
}`,
    steps: [{ cls: "two" }, { title: null }, { title: undefined }, { cls: "" }, { title: 3 }],
  },
  {
    name: "select binding",
    flag: "selectBinding",
    source: `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const value = cell("b");
  globalThis.__parity = { clicks: 0, set(name, next) { value.set(next); } };
  return <main><select value={value.get()}><option value="a">A</option><option value="b">B</option><option value="c">C</option></select></main>;
}`,
    steps: [{ value: "a" }, { value: "c" }, { value: "missing" }, { value: "b" }],
  },
];

interface Observation {
  html: string;
  text: string;
  selectValue: string | undefined;
  identity: boolean[];
}

function observe(host: HTMLElement, anchors: readonly Element[]): Observation {
  const select = host.querySelector("select");
  const current = Array.from(host.querySelectorAll("*"));

  return {
    html: host.innerHTML,
    text: host.textContent ?? "",
    selectValue: select === null ? undefined : select.value,
    // Whether each element from the previous observation is still attached.
    identity: anchors.map((anchor) => current.includes(anchor)),
  };
}

async function runScript(
  code: string,
  fixture: ParityFixture,
): Promise<{ observations: Observation[]; clicks: number; afterDispose: string }> {
  const host = document.createElement("div");
  const dispose = createRoot(host, compileClientComponent(code));
  const controls = (globalThis as ParityHost).__parity;

  if (controls === undefined) {
    throw new Error("fixture did not publish its controls");
  }

  const observations: Observation[] = [];
  let anchors: Element[] = [];

  try {
    await flushEffects();
    observations.push(observe(host, anchors));
    anchors = Array.from(host.querySelectorAll("*"));

    for (const step of fixture.steps) {
      for (const [name, value] of Object.entries(step)) {
        controls.set(name, value);
      }
      await flushEffects();
      observations.push(observe(host, anchors));
      anchors = Array.from(host.querySelectorAll("*"));
    }

    if (fixture.clickSelector !== undefined) {
      (host.querySelector(fixture.clickSelector) as HTMLElement).click();
      await flushEffects();
      observations.push(observe(host, anchors));
    }
  } finally {
    dispose();
  }

  controls.set(Object.keys(fixture.steps[0] ?? {})[0] ?? "", "after-dispose");
  await flushEffects();

  return { observations, clicks: controls.clicks, afterDispose: host.innerHTML };
}

function compileWith(source: string, overrides?: Partial<ClientSpecializationFlags>): string {
  const output = transform({
    code: source,
    filename: "App.tsx",
    target: "client",
    dev: false,
    ...(overrides === undefined ? {} : { clientSpecializations: overrides }),
  });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

afterEach(() => {
  delete (globalThis as ParityHost).__parity;
});

describe("client specialization parity", () => {
  test.each(fixtures)("$name behaves like the generic path it replaces", async (fixture) => {
    const specialized = compileWith(fixture.source);
    const generic = compileWith(fixture.source, { [fixture.flag]: false });

    // The toggle has to change the output, or the comparison proves nothing.
    expect(generic).not.toBe(specialized);

    const specializedRun = await runScript(specialized, fixture);
    const genericRun = await runScript(generic, fixture);

    expect(specializedRun.observations).toEqual(genericRun.observations);
    expect(specializedRun.clicks).toBe(genericRun.clicks);
    expect(specializedRun.afterDispose).toBe(genericRun.afterDispose);
  });

  test("switching every specialization off yields only generic runtime imports", () => {
    const source = fixtures.map((fixture) => fixture.source).join("\n");
    const generic = compileWith(source, {
      branchInsertion: false,
      directCellText: false,
      elementProperty: false,
      selectBinding: false,
    });

    expect(generic).not.toContain("@reckona/mreact-reactive-dom/internal");
    expect(generic).toContain("bindText(");
    expect(generic).toContain("insertDynamic(");
    expect(generic).toContain("bindProp(");
    expect(generic).toContain("bindSpreadProps(");
  });

  test("a specialization override never leaks into the next transform", () => {
    const fixture = fixtures[0]!;
    compileWith(fixture.source, { directCellText: false });

    expect(compileWith(fixture.source)).toContain("bindCellText(");
  });
});
