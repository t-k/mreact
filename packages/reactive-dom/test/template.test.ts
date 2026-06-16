// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElementTemplate, createTemplate } from "../src/index.js";

describe("createTemplate", () => {
  test("returns independent cloned fragments", () => {
    const clone = createTemplate("<section><span>count</span></section>");

    const first = clone();
    const second = clone();

    expect(first).toBeInstanceOf(DocumentFragment);
    expect(second).toBeInstanceOf(DocumentFragment);
    expect(first).not.toBe(second);
    expect(first.firstChild).not.toBe(second.firstChild);
    expect((first.firstChild as Element).outerHTML).toBe(
      "<section><span>count</span></section>",
    );
  });
});

describe("createElementTemplate", () => {
  test("clones a single root element", () => {
    const createRow = createElementTemplate<HTMLTableRowElement>(
      '<tr><td>1</td><td><span>label</span></td></tr>',
    );
    const first = createRow();
    const second = createRow();

    expect(first.tagName).toBe("TR");
    expect(first).not.toBe(second);
    expect(first.innerHTML).toBe("<td>1</td><td><span>label</span></td>");
  });

  test("rejects templates without exactly one root element", () => {
    expect(() => createElementTemplate("")).toThrow(
      "createElementTemplate requires exactly one root element",
    );
    expect(() => createElementTemplate("<span></span><span></span>")).toThrow(
      "createElementTemplate requires exactly one root element",
    );
  });
});
