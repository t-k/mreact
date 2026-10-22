import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

describe("named render prop security", () => {
  for (const name of ["header", "fallback", "sidebar", "element"]) {
    for (const serverOutput of ["string", "stream"] as const) {
      test(`${serverOutput} escapes ordinary ${name} values and preserves JSX`, async () => {
        const render = async (code: string, props: Record<string, unknown>) => {
          const output = transform({ code, filename: "named-prop.tsx", target: "server", serverOutput, dev: false });
          expect(output.diagnostics).toEqual([]);
          return serverOutput === "stream"
            ? runServerStreamComponent(output.code, "App", props)
            : runServerComponent(output.code, "App", props);
        };
        expect(await render(`export function App(props) { return <main>{props.${name}}</main>; }`, {
          [name]: '<img src=x onerror=alert(1)>',
        })).toBe("<main>&lt;img src=x onerror=alert(1)&gt;</main>");
        expect(await render(`function Panel(props) { return <main>{props.${name}}</main>; }
          export function App(props) { return <Panel ${name}={<b>{props.label}</b>} />; }`, {
          label: "<safe>",
        })).toBe("<main><b>&lt;safe&gt;</b></main>");
      });
    }
  }
});
