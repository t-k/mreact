import { describe, expect, test } from "vitest";
import { createElement, renderToString } from "../src/index.js";
import { renderReactNodeToString } from "../../server/src/html-helpers.js";

const invalidNames = [
  "",
  "1div",
  " div",
  "div ",
  "div\n",
  "div\r",
  "div\t",
  "div\0",
  'div data-probe="injected"',
  "div><script",
  "div/",
  "div=",
  'div"',
  "div'",
  "div<",
  "div>",
];

describe("SSR host tag names", () => {
  test.each(invalidNames)("rejects %j in both renderers before evaluating props", async (name) => {
    let propReads = 0;
    const node = createElement(name, null, "probe");
    Object.defineProperty(node.props, "title", {
      enumerable: true,
      get() {
        propReads += 1;
        return "title";
      },
    });
    expect(() => renderToString(() => node)).toThrow("Invalid HTML tag name");
    await expect(renderReactNodeToString(node)).rejects.toThrow("Invalid HTML tag name");
    expect(propReads).toBe(0);
  });

  test.each(["div", "DIV", "my-widget", "svg", "linearGradient", "svg:path", "x_a.b-2"])(
    "preserves valid HTML SVG and custom tag %s",
    async (name) => {
      const node = createElement(name, null, "probe");
      expect(renderToString(() => node)).toBe(`<${name}>probe</${name}>`);
      await expect(renderReactNodeToString(node)).resolves.toBe(`<${name}>probe</${name}>`);
    },
  );
});
