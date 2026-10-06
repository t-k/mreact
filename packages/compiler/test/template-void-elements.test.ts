// @vitest-environment happy-dom

import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

describe("native HTML template void elements", () => {
  test.each([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ])("does not emit an end tag for HTML %s", (tag) => {
    const output = transform({
      code: `export function App() { return <div><${tag} /><span>after</span></div>; }`,
      filename: "void-elements.tsx",
      target: "client",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain(`</${tag}>`);
  });

  test("binds a controlled select after a line break to the select node", async () => {
    const output = transform({
      code: `export function App(props) {
        return <label>Plan<br /><select value={props.value} onChange={props.onChange}><option value="basic">Basic</option><option value="pro">Pro</option></select></label>;
      }`,
      filename: "select-after-break.tsx",
      target: "client",
    });
    expect(output.diagnostics).toEqual([]);
    const App = compileClientComponent(output.code) as unknown as (props: {
      value: string;
      onChange: (event: Event) => void;
    }) => Node;
    const value = cell("pro");
    const changes: string[] = [];
    const host = document.createElement("div");
    const dispose = createRoot(host, () =>
      App({
        get value() {
          return value.get();
        },
        onChange(event) {
          changes.push((event.target as HTMLSelectElement).value);
        },
      }),
    );

    try {
      await flushEffects();
      expect(host.querySelectorAll("br")).toHaveLength(1);
      const select = host.querySelector("select")!;
      expect(select.value).toBe("pro");
      value.set("basic");
      await flushEffects();
      expect(select.value).toBe("basic");
      select.value = "pro";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      expect(changes).toEqual(["pro"]);
    } finally {
      dispose();
    }
  });

  test("keeps end tags for foreign elements with HTML void names", () => {
    const output = transform({
      code: "export function App() { return <svg><source /><path /></svg>; }",
      filename: "svg-source.tsx",
      target: "client",
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("<source></source><path></path>");
  });
});
