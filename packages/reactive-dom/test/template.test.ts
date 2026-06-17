// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createTemplate, createTemplateElement } from "../src/index.js";

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

  test("returns independent cloned elements for single-root templates", () => {
    const clone = createTemplateElement<HTMLTableRowElement>(
      '<tr><td class="id">1</td></tr>',
    );

    const first = clone();
    const second = clone();

    expect(first).toBeInstanceOf(HTMLTableRowElement);
    expect(second).toBeInstanceOf(HTMLTableRowElement);
    expect(first).not.toBe(second);
    expect(first.firstChild).not.toBe(second.firstChild);
    expect(first.outerHTML).toBe('<tr><td class="id">1</td></tr>');
  });

  test("rejects templates without exactly one root element", () => {
    expect(() => createTemplateElement("")).toThrow("single root element");
    expect(() => createTemplateElement("<span>A</span><span>B</span>")).toThrow(
      "single root element",
    );
  });
});
