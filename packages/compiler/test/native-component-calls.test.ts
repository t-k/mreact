// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

describe("compiler native component call specialization", () => {
  test("drops the render-value guard for a same-module component call", () => {
    const code = compile(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  return <main><Badge label="new" /></main>;
}`);

    expect(code).toContain('_children[0].replaceWith(Badge({ label: ("new") }))');
    expect(code).not.toContain('typeof _component === "boolean"');
  });

  test("keeps one shared component function for repeated call sites", () => {
    const code = compile(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  return <main><Badge label="a" /><Badge label="b" /><Badge label="c" /></main>;
}`);

    expect(code.match(/function Badge\(/g)).toHaveLength(1);
    expect(code.match(/_children\[\d\]\.replaceWith\(Badge\(/g)).toHaveLength(3);
    expect(code).not.toContain("_component");
  });

  test("keeps the guard for callees whose return value the emitter cannot prove", () => {
    const unproven: [string, string][] = [
      [
        "imported component",
        `import { Maybe } from "./Maybe";
export function App() { return <main><Maybe /></main>; }`,
      ],
      [
        "component that returns another component call",
        `import { Maybe } from "./Maybe";
function Wrapper(props) { return <Maybe {...props} />; }
export function App() { return <main><Wrapper /></main>; }`,
      ],
      [
        "reassigned component",
        `function Badge() { return <span>badge</span>; }
Badge = () => null;
export function App() { return <main><Badge /></main>; }`,
      ],
    ];

    for (const [scenario, source] of unproven) {
      const code = compile(source);

      expect(code, scenario).toContain('=== "boolean"');
    }
  });

  test("removes the placeholder when a proven component renders an empty fragment", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
const open = cell(false);
function Panel() { return open.get() ? <section>Open</section> : null; }
export function App() {
  return <main><Panel /><footer>end</footer></main>;
}`);

    expect(code).toContain("replaceWith(Panel({  }))");
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));

    try {
      await flushEffects();
      expect(host.querySelector("main")?.textContent).toBe("end");
      expect(host.querySelector("section")).toBeNull();
    } finally {
      dispose();
    }
  });

  test("renders proven component calls with their constant and dynamic props", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
const label = cell("live");
function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  return <main><Badge label="constant" /><Badge label={label.get()} /></main>;
}`);
    const host = document.createElement("div");
    const dispose = createRoot(host, compileClientComponent(code));

    try {
      await flushEffects();
      const badges = Array.from(host.querySelectorAll("span.badge")).map(
        (badge) => badge.textContent,
      );

      expect(badges).toEqual(["constant", "live"]);
    } finally {
      dispose();
    }
  });
});
