// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createTemplate, createTemplateElement } from "../src/index.js";
import { createSvgTemplate, createSvgTemplateElement } from "../src/template.js";

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

  test("creates SVG template nodes in SVG namespace with XHTML foreignObject children", () => {
    const cloneFragment = createSvgTemplate(
      '<g data-row><rect width="10"></rect></g><foreignObject><div data-html>HTML</div></foreignObject><text data-tail>tail</text>',
    );
    const cloneElement = createSvgTemplateElement<SVGGElement>(
      '<g data-single><circle r="4"></circle></g>',
    );
    const fragment = cloneFragment();
    const group = fragment.querySelector("[data-row]");
    const foreignObject = fragment.querySelector("foreignObject");
    const html = fragment.querySelector("[data-html]");
    const tail = fragment.querySelector("[data-tail]");
    const single = cloneElement();

    expect(group?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(group?.firstElementChild?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(foreignObject?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(html?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(tail?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(single.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(single.firstElementChild?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});
