// @vitest-environment happy-dom

import { expect, test } from "vitest";
import { normalizeRenderValue, registerRenderValueNormalizer } from "../src/normalize.js";
import type { RenderValue } from "../src/types.js";

const cases = (["Array", "Iterable"] as const).flatMap((container) =>
  (["Node", "Text", "Fragment", "Empty"] as const).flatMap((leaf) =>
    [1, 3].map((depth) => ({ container, leaf, depth })),
  ),
);

test.each(cases)("normalizes $leaf in $container with $depth nested wrappers", ({ container, leaf, depth }) => {
  const first = document.createElement("b");
  const last = document.createElement("i");
  const fragment = document.createDocumentFragment();
  const fragmentFirst = document.createElement("em");
  const fragmentLast = document.createTextNode("end");
  fragment.append(fragmentFirst, fragmentLast);
  const leaves = { Node: first, Text: 42, Fragment: fragment, Empty: false };

  let value: RenderValue = leaves[leaf];
  for (let level = 0; level < depth; level++) {
    const inner: RenderValue = value;
    if (container === "Array") {
      value = [inner, null];
    } else {
      value = (function* () {
        yield inner;
        yield null;
      })() as unknown as RenderValue;
    }
  }
  const nodes = normalizeRenderValue([value, last]);

  expect(nodes.at(-1)).toBe(last);
  const normalized = nodes.slice(0, -1);
  if (leaf === "Text") {
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toBeInstanceOf(Text);
    expect(normalized[0]?.textContent).toBe("42");
  } else if (leaf === "Fragment") {
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toBe(fragmentFirst);
    expect(normalized[1]).toBe(fragmentLast);
  } else if (leaf === "Node") {
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toBe(first);
  } else {
    expect(normalized).toEqual([]);
  }
});

test("flattens a large nested array without spreading children into call arguments", () => {
  const count = 200_000;
  const first = document.createElement("b");
  const last = document.createElement("i");
  const nodes = normalizeRenderValue([Array<Node>(count).fill(first), last]);

  expect(nodes).toHaveLength(count + 1);
  expect(nodes[count - 1]).toBe(first);
  expect(nodes[count]).toBe(last);
});

test("preserves a standalone element at the depth boundary", () => {
  const element = document.createElement("div");

  const nodes = normalizeRenderValue(element, 256);
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toBe(element);
  expect(() => normalizeRenderValue(element, 257)).toThrow("exceeded 256 levels");
});

test("preserves the depth boundary", () => {
  let value: RenderValue = "deep";
  for (let depth = 0; depth < 256; depth++) {
    value = [value];
  }

  expect(normalizeRenderValue(value)[0]?.textContent).toBe("deep");
  expect(() => normalizeRenderValue([value])).toThrow("exceeded 256 levels");
});

test("preserves custom normalizer results and iteration order", () => {
  const customValue = {} as RenderValue;
  const first = document.createElement("b");
  const second = document.createElement("i");
  const customNodes = [first, second];
  const depths: number[] = [];
  registerRenderValueNormalizer((value, depth) => {
    if (value !== customValue) return undefined;
    depths.push(depth);
    return customNodes;
  });

  expect(normalizeRenderValue(customValue)).toBe(customNodes);
  const following = document.createElement("em");
  const nested = normalizeRenderValue([[customValue], following]);
  expect(nested).toHaveLength(3);
  expect(nested[0]).toBe(first);
  expect(nested[1]).toBe(second);
  expect(nested[2]).toBe(following);
  expect(depths).toEqual([1, 3]);
});

test("normalizes built-in primitive values before consulting custom normalizers", () => {
  const fallback = document.createElement("i");
  registerRenderValueNormalizer((value) =>
    value === undefined || value === "plain text" || value === 42 ? [fallback] : undefined,
  );

  expect(normalizeRenderValue(undefined)).toEqual([]);
  const nodes = normalizeRenderValue(["plain text", [undefined, 42]]);
  expect(nodes).toHaveLength(2);
  expect(nodes.every((node) => node instanceof Text)).toBe(true);
  expect(nodes.map((node) => node.textContent)).toEqual(["plain text", "42"]);
});

test("closes an iterator when a nested render value throws", () => {
  const marker = new Error("coercion failed");
  const invalid = {
    toString() {
      throw marker;
    },
  } as unknown as RenderValue;
  let closed = false;
  const values = (function* () {
    try {
      yield [invalid];
    } finally {
      closed = true;
    }
  })();

  expect(() => normalizeRenderValue(values as unknown as RenderValue)).toThrow(marker);
  expect(closed).toBe(true);
});
