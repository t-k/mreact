// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { syncChildNodes } from "../src/dom-children.js";

describe("dom children sync", () => {
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
});
