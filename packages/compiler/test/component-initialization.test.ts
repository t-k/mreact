// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createTemplate } from "@reckona/mreact-reactive-dom";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

/** Evaluates emitted client code with a stubbed template factory. */
function evaluateWithTemplateStub(
  code: string,
  stub: (html: string) => () => DocumentFragment,
): { calls: string[]; exports: Record<string, () => Node> } {
  const calls: string[] = [];
  const body = code
    .replace(/^\s*(?:import[^\n]*\n\s*)+/, "")
    .replace(/export function /g, "function ");
  const exportedNames = Array.from(code.matchAll(/^export function ([A-Za-z_$][\w$]*)/gm)).map(
    (match) => String(match[1]),
  );
  const exports = new Function(
    "createTemplate",
    `${body}\nreturn { ${exportedNames.map((name) => `${JSON.stringify(name)}: ${name}`).join(", ")} };`,
  )((html: string) => {
    calls.push(html);
    return stub(html);
  }) as Record<string, () => Node>;

  return { calls, exports };
}

describe("compiler component initialization", () => {
  test("declares component templates without running them at module load", () => {
    const code = compile(`export function Small() { return <b>ok</b>; }
export function Large() { return <section data-large="yes"><p>payload</p></section>; }`);

    expect(code).toMatch(/^let _tmpl_Small;$/m);
    expect(code).toMatch(/^let _tmpl_Large;$/m);
    expect(code).not.toMatch(/^(?:const|let) _tmpl_\w+ = createTemplate/m);
    expect(code).toContain('(_tmpl_Large ??= createTemplate("<section data-large=\\"yes\\">');
  });

  test("creates each template on first render and reuses it afterwards", () => {
    const code = compile(`export function App() { return <b>ok</b>; }`);
    const { calls, exports } = evaluateWithTemplateStub(code, (html) => createTemplate(html));

    expect(calls).toEqual([]);

    const first = exports.App?.() as HTMLElement;

    expect(calls).toEqual(["<b>ok</b>"]);
    expect(first.outerHTML).toBe("<b>ok</b>");

    const second = exports.App?.() as HTMLElement;

    expect(calls).toEqual(["<b>ok</b>"]);
    expect(second).not.toBe(first);
    expect(second.outerHTML).toBe("<b>ok</b>");
  });

  test("does not create the template of a component that is never rendered", () => {
    const code = compile(`export function Small() { return <b>ok</b>; }
export function Large() { return <section data-large="yes"><p>payload</p></section>; }`);
    const { calls, exports } = evaluateWithTemplateStub(code, (html) => createTemplate(html));

    exports.Small?.();

    expect(calls).toEqual(["<b>ok</b>"]);
  });

  test("surfaces a template creation failure on first render rather than on import", () => {
    const code = compile(`export function App() { return <b>ok</b>; }`);
    const failure = new Error("template creation failed");

    expect(() =>
      evaluateWithTemplateStub(code, () => {
        throw failure;
      }),
    ).not.toThrow();

    const { exports } = evaluateWithTemplateStub(code, () => {
      throw failure;
    });

    expect(() => exports.App?.()).toThrow(failure);
  });

  test("still renders a large component and its bindings when it is the used export", async () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function Large() {
  const label = cell("payload");
  return <section data-large="yes"><h1>{label.get()}</h1><p>copy</p></section>;
}`);
    const node = compileClientComponent(code, "Large")() as HTMLElement;

    await Promise.resolve();

    expect(node.querySelector("h1")?.textContent).toBe("payload");
    expect(node.querySelector("p")?.textContent).toBe("copy");
  });

  test("keeps a template shared through a same-module component call", () => {
    const code = compile(`function Row() { return <li>row</li>; }
export function App() { return <ul><Row /><Row /></ul>; }`);
    const node = compileClientComponent(code)() as HTMLElement;

    expect(node.querySelectorAll("li")).toHaveLength(2);
    expect(node.textContent).toBe("rowrow");
  });

  test("installs the deferred render value normalizer from the component that needs it", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
import { Panel } from "./Panel";
import { Shell } from "./Shell";

const ticket = cell(null);

export function App() {
  return (
    <Shell>
      <p>Rows</p>
      {ticket.get() === null ? null : <Panel number={ticket.get() ?? 0} />}
    </Shell>
  );
}`);

    expect(code).toContain("  installMemoRenderValueNormalizer();");
    expect(code).not.toMatch(/^installMemoRenderValueNormalizer\(\);$/m);
  });

  test("omits the text binding import when no text binding is emitted", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const open = cell(false);
  return <main>{open.get() ? "Yes" : "No"}</main>;
}`);

    expect(code).not.toContain("bindText");
  });

  test("keeps the text binding import when a text binding is emitted", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const label = cell("hi");
  return <main>{label.get()}</main>;
}`);

    expect(code).toContain('import { bindCellText } from "@reckona/mreact-reactive-dom/internal";');
    expect(code).toContain("bindCellText(_text_0, label)");
    expect(code).not.toContain("bindText,");
  });

  test("keeps the text binding import for text inside a conditional element branch", () => {
    const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const label = cell("hi");
  const open = cell(false);
  return <main>{open.get() ? <span>{label.get()}</span> : null}</main>;
}`);

    expect(code).toContain("bindCellText");
    const node = compileClientComponent(code)() as HTMLElement;

    expect(node.textContent).toBe("");
  });
});
