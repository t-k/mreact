// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { transform } from "../src/index.js";

/**
 * Pins the structural relationship between the client template and the server-rendered DOM.
 *
 * Constructs with no dynamic insertion point produce the same node tree on both sides. Constructs
 * that carry one do not, because the server emits rendered content where the client template emits
 * a single comment marker, which shifts every later child index.
 *
 * The matching half is an SSR and hydration invariant: a change to template or server emission that
 * makes a matching construct stop matching is exactly the silent class of regression that produces
 * no console error and no other failing test. The non-matching half records why addressing hydration
 * nodes by path is unsound in general, so it does not have to be re-derived; deliberately emitting
 * SSR attachment markers would flip those rows and should fail loudly here first.
 */

const fixtures = {
  "static markup": `export function App() { return <main><h1>Title</h1><p>Body</p></main>; }`,
  "dynamic text": `import { cell } from "@reckona/mreact-reactive-core";
const label = cell("hello");
export function App() { return <main><h1>{label.get()}</h1><p>after</p></main>; }`,
  "taken conditional branch": `import { cell } from "@reckona/mreact-reactive-core";
const open = cell(true);
export function App() { return <main>{open.get() ? <section>Open</section> : null}<p>after</p></main>; }`,
  "untaken conditional branch": `import { cell } from "@reckona/mreact-reactive-core";
const open = cell(false);
export function App() { return <main>{open.get() ? <section>Open</section> : null}<p>after</p></main>; }`,
  "keyed list": `import { cell } from "@reckona/mreact-reactive-core";
const rows = cell([{ id: "a", label: "A" }, { id: "b", label: "B" }]);
export function App() { return <main><ul>{rows.get().map((row) => <li key={row.id}>{row.label}</li>)}</ul><p>after</p></main>; }`,
} as const;

/** Node kinds and nesting only. Text content differs by design and is not part of the shape. */
function describeShape(node: Node, depth = 0): string[] {
  const kind =
    node.nodeType === 1
      ? (node as Element).tagName
      : node.nodeType === 3
        ? "#text"
        : node.nodeType === 8
          ? "#comment"
          : `#${node.nodeType}`;
  const lines = [`${"  ".repeat(depth)}${kind}`];

  for (const child of Array.from(node.childNodes)) {
    lines.push(...describeShape(child, depth + 1));
  }

  return lines;
}

function clientTemplateShape(source: string): string {
  const code = transform({ code: source, filename: "App.tsx", target: "client", dev: false }).code;
  const templateHtml = /createTemplate\("((?:[^"\\]|\\.)*)"\)/.exec(code)?.[1];

  if (templateHtml === undefined) {
    throw new Error("Expected the client output to create a template.");
  }

  const host = document.createElement("div");
  host.innerHTML = JSON.parse(`"${templateHtml}"`) as string;
  return describeShape(host).join("\n");
}

function serverRenderedShape(source: string): string {
  const output = transform({ code: source, filename: "App.tsx", target: "server", dev: false });

  expect(output.diagnostics).toEqual([]);
  const body = output.code
    .replace(/^\s*(?:import[^\n]*\n\s*)+/, "")
    .replace(/export function /g, "function ");
  const html = new Function("cell", `${body}\nreturn App();`)(cell) as string;
  const host = document.createElement("div");
  host.innerHTML = html;
  return describeShape(host).join("\n");
}

describe("client template and server DOM structure", () => {
  test.each([
    ["static markup", true],
    ["dynamic text", true],
    ["taken conditional branch", false],
    ["untaken conditional branch", false],
    ["keyed list", false],
  ] as const)("%s matches the server structure: %s", (name, expected) => {
    const source = fixtures[name];

    expect(clientTemplateShape(source) === serverRenderedShape(source)).toBe(expected);
  });

  test("an untaken conditional shifts every later child index", () => {
    const source = fixtures["untaken conditional branch"];
    const template = clientTemplateShape(source).split("\n");
    const server = serverRenderedShape(source).split("\n");

    // The template keeps a marker for the branch the server rendered as nothing, so the paragraph
    // that follows it sits at a different index on each side. That is what defeats path addressing.
    expect(template.length).toBeGreaterThan(server.length);
    expect(template).toContain("    #comment");
    expect(server).not.toContain("    #comment");
  });
});
