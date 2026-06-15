// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import { syncChildNodes } from "../src/dom-children.js";

describe("react-compat DOM child sync", () => {
  test("removes a single missing child without moving the following sibling", () => {
    const parent = document.createElement("div");
    const nodes = Array.from({ length: 20 }, () => document.createElement("span"));
    const removed = nodes[10]!;
    parent.append(...nodes);
    const nextNodes = nodes.filter((node) => node !== removed);
    let insertions = 0;
    const originalInsertBefore = parent.insertBefore.bind(parent);
    parent.insertBefore = ((node, child) => {
      insertions += 1;
      return originalInsertBefore(node, child);
    }) as typeof parent.insertBefore;

    syncChildNodes(parent, nextNodes);

    expect(insertions).toBe(0);
    expect([...parent.childNodes]).toEqual(nextNodes);
    expect(removed.parentNode).toBeNull();
  });

  test("bulk replaces disjoint full child lists", () => {
    const parent = document.createElement("div");
    const previousNodes = Array.from({ length: 20 }, () => document.createElement("span"));
    const nextNodes = Array.from({ length: 20 }, () => document.createElement("button"));
    parent.append(...previousNodes);
    let replacements = 0;
    const originalReplaceChildren = parent.replaceChildren.bind(parent);
    parent.replaceChildren = ((...nodes) => {
      replacements += 1;
      originalReplaceChildren(...nodes);
    }) as typeof parent.replaceChildren;

    syncChildNodes(parent, nextNodes);

    expect(replacements).toBe(1);
    expect([...parent.childNodes]).toEqual(nextNodes);
    expect(previousNodes.every((node) => node.parentNode === null)).toBe(true);
  });

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
