// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

test.each(
  [false, true].flatMap((split) =>
    ["array", "computed-key"].flatMap((pattern) =>
      ["before", "after", "between"].map((position) => ({ split, pattern, position })),
    ),
  ),
)(
  "mixed JSX and reactive declarations preserve initialization and updates: %j",
  async ({ split, pattern, position }) => {
    const events: string[] = [];
    (globalThis as typeof globalThis & { __mixedEvents?: string[] }).__mixedEvents = events;
    const binding =
      pattern === "array" ? "[value] = state.get()" : "{ [key()]: value } = state.get()";
    const declarations = ["before = record('before')"];
    if (position === "before") declarations.push("node = <span>{value}</span>");
    declarations.push(binding);
    if (position !== "before") declarations.push("node = <span>{value}</span>");
    if (position === "between")
      declarations.push("[other] = second.get()", "otherNode = <b>{other}</b>");
    declarations.push("after = record('after')");
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
function record(value) { globalThis.__mixedEvents.push(value); return value; }
function key() { record("key"); return "value"; }
function* values(value) { record("next:" + value); try { yield value; } finally { record("close:" + value); } }
const state = cell(${pattern === "array" ? "values(1)" : "{ value: 1 }"});
const second = cell(values(10));
export function App() {
${split ? declarations.map((value) => "const " + value + ";").join("\n") : "const " + declarations.join(", ") + ";"}
return <div>{node}${position === "between" ? "{otherNode}" : ""}<button onClick={() => state.set(${pattern === "array" ? "values(2)" : "{ value: 2 }"})}>Update</button></div>;
}`,
      filename: "mixed-declarations.tsx",
      target: "client",
      dev: false,
    });
    expect(output.diagnostics).toEqual([]);
    const App = compileClientComponent(output.code)!;
    const host = document.createElement("div");
    let dispose: (() => void) | undefined;
    try {
      dispose = createRoot(host, App);
      expect(host.querySelector("span")?.textContent).toBe("1");
      expect(events).toEqual([
        "before",
        ...(pattern === "array" ? ["next:1", "close:1"] : ["key"]),
        ...(position === "between" ? ["next:10", "close:10"] : []),
        "after",
      ]);
      if (position === "between") expect(host.querySelector("b")?.textContent).toBe("10");
      events.length = 0;
      host.querySelector("button")?.click();
      await flushEffects();
      expect(host.querySelector("span")?.textContent).toBe("2");
      expect(events).toEqual(pattern === "array" ? ["next:2", "close:2"] : []);
      if (position === "between") expect(host.querySelector("b")?.textContent).toBe("10");
    } finally {
      dispose?.();
      delete (globalThis as typeof globalThis & { __mixedEvents?: string[] }).__mixedEvents;
    }
  },
);
