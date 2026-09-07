// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import {
  isBooleanishStringAttribute,
  isEventLikePropName,
} from "@reckona/mreact-shared";
import {
  isDangerousHtmlAttribute,
  isSrcsetAttribute,
  isUrlAttribute,
} from "@reckona/mreact-shared/url-safety";
import {
  SPECIALIZED_ELEMENT_PROPERTIES,
  isSelectControlAttributeName,
} from "../src/emit-client-specialization.js";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

interface CellHost {
  set(value: unknown): void;
}

type PropHost = typeof globalThis & { __propValue?: CellHost };

function compile(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

/** Mounts a single intrinsic element whose attribute is driven by a published cell. */
function mountAttribute(
  tag: string,
  attribute: string,
  initial: string,
): { dispose: () => void; element: Element; value: CellHost } {
  const code = compile(`import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const value = cell(${initial});
  globalThis.__propValue = value;
  return <${tag} ${attribute}={value.get()} />;
}`);
  const host = document.createElement("div");
  const disposeRoot = createRoot(host, compileClientComponent(code));
  const value = (globalThis as PropHost).__propValue;

  if (value === undefined) {
    throw new Error("Expected the compiled component to publish its cell.");
  }

  return {
    dispose: () => {
      disposeRoot();
      delete (globalThis as PropHost).__propValue;
    },
    element: host.firstElementChild as Element,
    value,
  };
}

describe("compiler specialized DOM property bindings", () => {
  test("emits the specialized binding for proven plain element properties", () => {
    const cases: [string, string][] = [
      ["className", '"className", "class"'],
      ["class", '"class", "class"'],
      ["id", '"id", "id"'],
      ["title", '"title", "title"'],
      ["lang", '"lang", "lang"'],
      ["dir", '"dir", "dir"'],
      ["slot", '"slot", "slot"'],
    ];

    for (const [name, expected] of cases) {
      const code = compile(`export function App(props) {
  return <div ${name}={props.value} />;
}`);

      expect(code, name).toContain(`bindElementProperty(_root, ${expected}, () => (props.value))`);
      expect(code, name).not.toContain("bindProp");
    }

    const classNameCode = compile(`export function App(props) {
  return <div className={props.value} />;
}`);

    expect(classNameCode).toContain(
      'bindElementProperty(_root, "className", "class", () => (props.value))',
    );
  });

  test("keeps every allowlisted name outside every sanitizing branch of applyDomProp", () => {
    for (const [name, { attribute }] of SPECIALIZED_ELEMENT_PROPERTIES) {
      expect(isUrlAttribute(attribute), name).toBe(false);
      expect(isSrcsetAttribute(attribute), name).toBe(false);
      expect(isDangerousHtmlAttribute(attribute), name).toBe(false);
      expect(isEventLikePropName(name), name).toBe(false);
      expect(isBooleanishStringAttribute(attribute), name).toBe(false);
      expect(isSelectControlAttributeName(name), name).toBe(false);
      expect(name, name).not.toBe("style");
      expect(name, name).not.toBe("dangerouslySetInnerHTML");
    }
  });

  test("never resolves a specialized binding for a name outside the allowlist", () => {
    for (const name of [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "Class",
      "CLASS",
      "class-",
      "classname",
    ]) {
      const code = compile(`export function App(props) {
  return <div ${name}={props.value} />;
}`);

      expect(code, name).not.toContain("bindElementProperty");
      expect(code, name).toContain(`bindProp(_root, ${JSON.stringify(name)}`);
    }
  });

  test("keeps every security-sensitive attribute on the generic prop binding", () => {
    const generic = [
      "href",
      "src",
      "srcSet",
      "action",
      "formAction",
      "poster",
      "data",
      "style",
      "dangerouslySetInnerHTML",
      "srcDoc",
      "contentEditable",
      "draggable",
      "spellCheck",
      "translate",
      "value",
      "checked",
      "aria-label",
      "data-state",
    ];

    for (const name of generic) {
      const code = compile(`export function App(props) {
  return <div ${name}={props.value} />;
}`);

      expect(code, name).toContain("bindProp(_root,");
      expect(code, name).not.toContain("bindElementProperty");
    }
  });

  test("routes event-like attributes to the event binding rather than any prop binding", () => {
    const code = compile(`export function App(props) {
  return <div onclick={props.value} onClick={props.other} />;
}`);

    expect(code).toContain('bindEvent(_root, "click"');
    expect(code).not.toContain("bindElementProperty");
    expect(code).not.toContain("bindProp");
  });

  test("keeps SVG element attributes on the generic prop binding", () => {
    const code = compile(`export function App(props) {
  return <svg><g class={props.value} id={props.id} /></svg>;
}`);

    expect(code).toContain("bindProp(");
    expect(code).not.toContain("bindElementProperty");
  });

  test("applies and removes a specialized class exactly like the generic binding", async () => {
    const specialized = mountAttribute("div", "className", '"first"');
    const generic = mountAttribute("div", "aria-label", '"first"');

    try {
      await flushEffects();
      expect(specialized.element.outerHTML).toBe('<div class="first"></div>');

      for (const next of ['"second"', "null", "undefined", "false", "0", "true"] as const) {
        const value = JSON.parse(next === "undefined" ? "null" : next) as unknown;
        specialized.value.set(next === "undefined" ? undefined : value);
        await flushEffects();
        expect(specialized.element.getAttribute("class"), next).toBe(
          expectedClassAttribute(next === "undefined" ? undefined : value),
        );
      }
    } finally {
      specialized.dispose();
      generic.dispose();
    }
  });

  test("removes a specialized property when the value carries a DOM node", async () => {
    const { dispose, element, value } = mountAttribute("div", "id", '"first"');

    try {
      await flushEffects();
      expect(element.getAttribute("id")).toBe("first");

      value.set(document.createElement("span"));
      await flushEffects();

      expect(element.hasAttribute("id")).toBe(false);
      expect((element as HTMLElement).id).toBe("");
    } finally {
      dispose();
    }
  });

  test("stops writing the specialized property after disposal", async () => {
    const { dispose, element, value } = mountAttribute("div", "title", '"first"');

    await flushEffects();
    expect(element.getAttribute("title")).toBe("first");
    dispose();
    value.set("second");
    await flushEffects();

    expect(element.getAttribute("title")).toBe("first");
  });
});

function expectedClassAttribute(value: unknown): string | null {
  if (value === null || value === undefined || value === false) {
    return null;
  }

  if (value === true) {
    return "";
  }

  return String(value);
}
