// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createTemplate } from "../src/index.js";

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
