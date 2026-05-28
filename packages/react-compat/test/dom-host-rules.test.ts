// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createHostElement,
  serializeClientStyleValue,
  styleNameToCssName,
} from "../src/dom-host-rules.js";

describe("react-compat DOM host rules", () => {
  test("serializes numeric style values using React client unit rules", () => {
    expect(serializeClientStyleValue("height", 300)).toBe("300px");
    expect(serializeClientStyleValue("width", 640)).toBe("640px");
    expect(serializeClientStyleValue("opacity", 0.5)).toBe("0.5");
    expect(serializeClientStyleValue("zIndex", 2)).toBe("2");
    expect(serializeClientStyleValue("lineHeight", 1.5)).toBe("1.5");
    expect(serializeClientStyleValue("flex", 1)).toBe("1");
    expect(serializeClientStyleValue("marginTop", 0)).toBe("0");
    expect(serializeClientStyleValue("--gap", 4)).toBe("4");
    expect(serializeClientStyleValue("height", "12rem")).toBe("12rem");
  });

  test("normalizes style property names for setProperty and removal", () => {
    expect(styleNameToCssName("backgroundColor")).toBe("background-color");
    expect(styleNameToCssName("msTransition")).toBe("-ms-transition");
    expect(styleNameToCssName("--gap")).toBe("--gap");
  });

  test("creates SVG elements with namespace context and returns to HTML inside foreignObject", () => {
    const svg = createHostElement(document, "svg", "html");
    const rect = createHostElement(document, "rect", "svg");
    const html = createHostElement(document, "div", "html");
    const foreignDiv = createHostElement(document, "div", "html");

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(rect.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(html.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(foreignDiv.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });
});
