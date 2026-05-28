// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import { syncChildNodes } from "../src/dom-children.js";

describe("react-compat DOM child sync", () => {
  test("ignores a stale removal when an external DOM owner has already removed the child", () => {
    const parent = document.createElement("div");
    const stale = document.createElement("span");
    parent.appendChild(stale);

    const removeChild = parent.removeChild.bind(parent);
    vi.spyOn(parent, "removeChild").mockImplementation((child) => {
      if (child === stale && stale.parentNode === parent) {
        removeChild(stale);
      }

      return removeChild(child);
    });

    expect(() => syncChildNodes(parent, [])).not.toThrow();
    expect(parent.childNodes).toHaveLength(0);
  });
});
