// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import type { Cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { runClientComponent, runServerComponent, runServerStreamComponent } from "./helpers.js";

declare global {
  // eslint-disable-next-line no-var
  var __innerHtmlDirect: Cell<{ __html: string }> | undefined;
  // eslint-disable-next-line no-var
  var __innerHtmlSpread: Cell<Record<string, unknown>> | undefined;
}

afterEach(() => {
  delete globalThis.__innerHtmlDirect;
  delete globalThis.__innerHtmlSpread;
});

describe("compiler dangerouslySetInnerHTML", () => {
  test.each([
    'dangerouslySetInnerHTML="<em>invalid</em>"',
    "dangerouslySetInnerHTML",
  ])("clears children for invalid static %s", async (attribute) => {
    const source = `export function App() {
      return <div ${attribute}><span>child</span></div>;
    }`;
    const serverOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const clientOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(runServerComponent(serverOutput.code)).toBe("<div></div>");
    const element = (await runClientComponent(clientOutput.code)) as HTMLElement;
    expect(element.innerHTML).toBe("");
    expect(element.hasAttribute("dangerouslySetInnerHTML")).toBe(false);
  });

  test("reactive client applies direct HTML and clears invalid or null values", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        export function App() {
          const value = cell({ __html: "<strong>first</strong>" });
          globalThis.__innerHtmlDirect = value;
          return <div dangerouslySetInnerHTML={value.get()} />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    const element = (await runClientComponent(output.code)) as HTMLElement;
    expect(element.innerHTML).toBe("<strong>first</strong>");

    globalThis.__innerHtmlDirect?.set({ __html: "<em>second</em>" });
    await flushEffects();
    expect(element.innerHTML).toBe("<em>second</em>");

    (globalThis.__innerHtmlDirect as Cell<unknown>).set({ __html: 1 });
    await flushEffects();
    expect(element.innerHTML).toBe("");

    (globalThis.__innerHtmlDirect as Cell<unknown>).set(null);
    await flushEffects();
    expect(element.innerHTML).toBe("");
  });

  test("direct HTML takes precedence over JSX children on server and client", async () => {
    const source = `export function App() {
        return <div dangerouslySetInnerHTML={{ __html: "<strong>raw</strong>" }}><span>{Date.now()}</span></div>;
      }`;
    const serverOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const clientOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(runServerComponent(serverOutput.code)).toBe("<div><strong>raw</strong></div>");
    const element = (await runClientComponent(clientOutput.code)) as HTMLElement;
    expect(element.innerHTML).toBe("<strong>raw</strong>");
  });

  test("direct and spread bindings apply initially in source order and updates use last write", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        export function App() {
          const direct = cell({ __html: "<b>direct</b>" });
          const spread = cell({ dangerouslySetInnerHTML: { __html: "<i>spread</i>" } });
          globalThis.__innerHtmlDirect = direct;
          globalThis.__innerHtmlSpread = spread;
          return <main>
            <div data-order="direct-spread" dangerouslySetInnerHTML={direct.get()} {...spread.get()} />
            <div data-order="spread-direct" {...spread.get()} dangerouslySetInnerHTML={direct.get()} />
          </main>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    const main = (await runClientComponent(output.code)) as HTMLElement;
    const directSpread = main.querySelector('[data-order="direct-spread"]');
    const spreadDirect = main.querySelector('[data-order="spread-direct"]');
    expect(directSpread?.innerHTML).toBe("<i>spread</i>");
    expect(spreadDirect?.innerHTML).toBe("<b>direct</b>");

    globalThis.__innerHtmlDirect?.set({ __html: "<u>direct update</u>" });
    await flushEffects();
    expect(directSpread?.innerHTML).toBe("<u>direct update</u>");
    expect(spreadDirect?.innerHTML).toBe("<u>direct update</u>");

    globalThis.__innerHtmlSpread?.set({
      dangerouslySetInnerHTML: { __html: "<mark>spread update</mark>" },
    });
    await flushEffects();
    expect(directSpread?.innerHTML).toBe("<mark>spread update</mark>");
    expect(spreadDirect?.innerHTML).toBe("<mark>spread update</mark>");
  });

  test("spread-only HTML replaces children and removal clears without restoring them", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        export function App() {
          const spread = cell({ dangerouslySetInnerHTML: { __html: "<b>raw</b>" } });
          globalThis.__innerHtmlSpread = spread;
          return <div {...spread.get()}><span>child</span></div>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    const element = (await runClientComponent(output.code)) as HTMLElement;
    expect(element.innerHTML).toBe("<b>raw</b>");

    globalThis.__innerHtmlSpread?.set({});
    await flushEffects();
    expect(element.innerHTML).toBe("");

    globalThis.__innerHtmlSpread?.set({ dangerouslySetInnerHTML: { __html: 1 } });
    await flushEffects();
    expect(element.innerHTML).toBe("");
  });

  test("server string and stream merge direct and spread HTML in source order", async () => {
    const source = `export function App(props) {
      return <main>
        <div data-case="spread-only" {...props.spread}>child</div>
        <div data-case="direct-spread" dangerouslySetInnerHTML={props.direct} {...props.spread}>child</div>
        <div data-case="spread-direct" {...props.spread} dangerouslySetInnerHTML={props.direct}>child</div>
      </main>;
    }`;
    const stringOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const streamOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      serverOutput: "stream",
      dev: false,
    });
    const props = {
      direct: { __html: "<b>direct</b>" },
      spread: { dangerouslySetInnerHTML: { __html: "<i>spread</i>" } },
    };
    const expected =
      '<main><div data-case="spread-only"><i>spread</i></div><div data-case="direct-spread"><i>spread</i></div><div data-case="spread-direct"><b>direct</b></div></main>';

    expect(runServerComponent(stringOutput.code, "App", props)).toBe(expected);
    await expect(runServerStreamComponent(streamOutput.code, "App", props)).resolves.toBe(expected);
    expect(stringOutput.code).not.toContain('dangerouslySetInnerHTML="');
    expect(streamOutput.code).not.toContain('dangerouslySetInnerHTML="');

    const withoutHtml = { direct: null, spread: {} };
    expect(runServerComponent(stringOutput.code, "App", withoutHtml)).toContain(
      '<div data-case="spread-only">child</div>',
    );
    const invalidSpread = {
      direct: null,
      spread: { dangerouslySetInnerHTML: { __html: "<b>invalid</b>", extra: true } },
    };
    expect(runServerComponent(stringOutput.code, "App", invalidSpread)).toContain(
      '<div data-case="spread-only"></div>',
    );
    await expect(
      runServerStreamComponent(streamOutput.code, "App", invalidSpread),
    ).resolves.toContain('<div data-case="spread-only"></div>');
  });

  test("server string and stream output reject non-exact opt-in objects without coercion", async () => {
    const output = transform({
      code: `export function App(props) {
        return <div dangerouslySetInnerHTML={props.value}>children</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const streamOutput = transform({
      code: `export function App(props) {
        return <div dangerouslySetInnerHTML={props.value}>children</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      serverOutput: "stream",
      dev: false,
    });

    expect(runServerComponent(output.code, "App", { value: { __html: "<b>ok</b>" } })).toBe(
      "<div><b>ok</b></div>",
    );
    expect(
      runServerComponent(output.code, "App", {
        value: { __html: "<b>extra</b>", extra: true },
      }),
    ).toBe("<div></div>");
    expect(runServerComponent(output.code, "App", { value: { __html: 1 } })).toBe("<div></div>");
    expect(runServerComponent(output.code, "App", { value: null })).toBe("<div></div>");
    await expect(
      runServerStreamComponent(streamOutput.code, "App", {
        value: { __html: "<b>ok</b>" },
      }),
    ).resolves.toBe("<div><b>ok</b></div>");
    await expect(
      runServerStreamComponent(streamOutput.code, "App", {
        value: { __html: "<b>extra</b>", extra: true },
      }),
    ).resolves.toBe("<div></div>");
  });
});
