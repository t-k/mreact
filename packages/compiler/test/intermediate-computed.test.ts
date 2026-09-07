// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

interface CellHost {
  set(value: unknown): void;
}

type PatternHost = typeof globalThis & {
  __patternEvents?: string[];
  __patternState?: CellHost;
};

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

describe("compiler destructuring alias intermediates", () => {
  test("omits the readiness flag when the destructuring has no computed key", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const state = cell([1, 2]);
  const [first, second] = state.get();
  return <main><span>{first}</span><b>{second}</b></main>;
}`);

    expect(code).toContain("deferredComputed(");
    expect(code).not.toContain("Ready");
  });

  test("keeps the readiness flag so a computed key is evaluated once", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
function key() { globalThis.__patternEvents.push("key"); return "value"; }
export function App() {
  const state = cell([{ value: 1 }]);
  globalThis.__patternState = state;
  const [{ [key()]: value }] = state.get();
  return <main><span>{value}</span></main>;
}`);

    expect(code).toContain("Ready");
    const events: string[] = [];
    const host = globalThis as PatternHost;
    host.__patternEvents = events;
    const container = document.createElement("div");
    const dispose = createRoot(container, compileClientComponent(code));

    try {
      await flushEffects();
      expect(container.textContent).toBe("1");
      expect(events).toEqual(["key"]);

      host.__patternState?.set([{ value: 2 }]);
      await flushEffects();

      expect(container.textContent).toBe("2");
      expect(events).toEqual(["key"]);
    } finally {
      dispose();
      delete host.__patternEvents;
      delete host.__patternState;
    }
  });

  test("renders and updates every binding of a destructuring alias", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const state = cell([1, 2]);
  globalThis.__patternState = state;
  const [first, second] = state.get();
  return <main><span>{first}</span><b>{second}</b></main>;
}`);
    const host = globalThis as PatternHost;
    const container = document.createElement("div");
    const dispose = createRoot(container, compileClientComponent(code));

    try {
      await flushEffects();
      expect(container.textContent).toBe("12");

      host.__patternState?.set([3, 4]);
      await flushEffects();

      expect(container.textContent).toBe("34");
    } finally {
      dispose();
      delete host.__patternState;
    }
  });

  test("consumes an iterable initializer exactly once at declaration time", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
function* values(value) {
  globalThis.__patternEvents.push("next:" + value);
  try { yield value; } finally { globalThis.__patternEvents.push("close:" + value); }
}
export function App() {
  const state = cell(values(1));
  globalThis.__patternState = state;
  const [first] = state.get();
  return <main><span>{first}</span></main>;
}`);
    const events: string[] = [];
    const host = globalThis as PatternHost;
    host.__patternEvents = events;
    const container = document.createElement("div");
    const dispose = createRoot(container, compileClientComponent(code));

    try {
      await flushEffects();

      // Two text reads of `first` must not re-consume the generator: the
      // intermediate computation caches the destructured values.
      expect(container.textContent).toBe("1");
      expect(events).toEqual(["next:1", "close:1"]);
    } finally {
      dispose();
      delete host.__patternEvents;
      delete host.__patternState;
    }
  });
});
