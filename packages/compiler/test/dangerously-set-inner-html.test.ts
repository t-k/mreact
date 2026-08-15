// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import type { Cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import {
  runAsyncServerComponent,
  runClientComponent,
  runServerComponent,
  runServerStreamComponent,
} from "./helpers.js";

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
  test.each(['dangerouslySetInnerHTML="<em>invalid</em>"', "dangerouslySetInnerHTML"])(
    "clears children for invalid static %s",
    async (attribute) => {
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
    },
  );

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
    const extraKeySpread = {
      direct: null,
      spread: { dangerouslySetInnerHTML: { __html: "<b>extra</b>", extra: true } },
    };
    expect(runServerComponent(stringOutput.code, "App", extraKeySpread)).toContain(
      '<div data-case="spread-only"><b>extra</b></div>',
    );
    await expect(
      runServerStreamComponent(streamOutput.code, "App", extraKeySpread),
    ).resolves.toContain('<div data-case="spread-only"><b>extra</b></div>');
  });

  test("server string and stream evaluate merged HTML attributes once in source order", async () => {
    const source = `export function App(props) {
      return <div data-first={props.nextAttribute()} dangerouslySetInnerHTML={props.nextDirect()} {...props.nextSpread()} data-last={props.nextTrailing()}>child</div>;
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
    const createProps = () => {
      const calls: string[] = [];
      return {
        calls,
        props: {
          nextAttribute: () => {
            calls.push("attribute");
            return "first";
          },
          nextDirect: () => {
            calls.push("direct");
            return { __html: "<b>direct</b>" };
          },
          nextSpread: () => {
            calls.push("spread");
            return { dangerouslySetInnerHTML: { __html: "<i>spread</i>" }, title: "spread" };
          },
          nextTrailing: () => {
            calls.push("trailing");
            return "last";
          },
        },
      };
    };
    const stringCase = createProps();
    const streamCase = createProps();
    const expected = '<div data-first="first" title="spread" data-last="last"><i>spread</i></div>';

    expect(runServerComponent(stringOutput.code, "App", stringCase.props)).toBe(expected);
    expect(stringCase.calls).toEqual(["attribute", "direct", "spread", "trailing"]);
    await expect(
      runServerStreamComponent(streamOutput.code, "App", streamCase.props),
    ).resolves.toBe(expected);
    expect(streamCase.calls).toEqual(["attribute", "direct", "spread", "trailing"]);
  });

  test("server string and stream preserve async children behind an HTML spread fallback", async () => {
    const source = `async function Child() {
      return <span>async child</span>;
    }
    export async function App() {
      const spread = {};
      return <div {...spread}><Child /></div>;
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

    await expect(runAsyncServerComponent(stringOutput.code)).resolves.toBe(
      "<div><span>async child</span></div>",
    );
    await expect(runServerStreamComponent(streamOutput.code)).resolves.toBe(
      "<div><span>async child</span></div>",
    );
  });

  test("server string and stream accept extra keys but reject accessors and inherited HTML", async () => {
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
    ).toBe("<div><b>extra</b></div>");
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
    ).resolves.toBe("<div><b>extra</b></div>");

    const getterPayload = Object.defineProperty({}, "__html", {
      get: () => "<b>getter</b>",
    });
    const inheritedPayload = Object.create({ __html: "<b>inherited</b>" }) as object;
    expect(runServerComponent(output.code, "App", { value: getterPayload })).toBe("<div></div>");
    expect(runServerComponent(output.code, "App", { value: inheritedPayload })).toBe("<div></div>");
  });

  test.each([
    ["dangerouslySetInnerHTML", "<div dangerouslySetInnerHTML={next()} />"],
    ["srcDoc", "<iframe srcDoc={next()} />"],
  ])("does not swallow user expression errors for %s", async (_name, elementSource) => {
    const source = `function next() { throw new Error("expression failed"); }
export function App() { return ${elementSource}; }`;
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
    const clientOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(() => runServerComponent(stringOutput.code)).toThrow("expression failed");
    await expect(runServerStreamComponent(streamOutput.code)).rejects.toThrow("expression failed");
    await expect(runClientComponent(clientOutput.code)).rejects.toThrow("expression failed");
  });
});
