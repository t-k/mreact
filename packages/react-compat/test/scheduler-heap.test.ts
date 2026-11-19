import { describe, expect, test } from "vitest";
import { peek, pop, push } from "../src/scheduler-heap.js";

interface Item {
  id: number;
  sortIndex: number;
}

const compare = (left: Item, right: Item): number =>
  left.sortIndex - right.sortIndex || left.id - right.id;

describe("scheduler heap", () => {
  test("returns null for an empty heap", () => {
    const heap: Item[] = [];

    expect(peek(heap)).toBeNull();
    expect(pop(heap, compare)).toBeNull();
  });

  test("removes items in sort-index and id order", () => {
    const heap: Item[] = [];
    const items = [
      { id: 4, sortIndex: 2 },
      { id: 3, sortIndex: 1 },
      { id: 2, sortIndex: 2 },
      { id: 1, sortIndex: 1 },
    ];

    for (const item of items) {
      push(heap, item, compare);
    }

    expect(peek(heap)).toBe(items[3]);
    expect([
      pop(heap, compare),
      pop(heap, compare),
      pop(heap, compare),
      pop(heap, compare),
    ]).toEqual([items[3], items[1], items[2], items[0]]);
    expect(pop(heap, compare)).toBeNull();
  });

  test("preserves heap order across interleaved pushes and pops", () => {
    const heap: Item[] = [];
    const first = { id: 1, sortIndex: 1 };
    const second = { id: 2, sortIndex: 2 };
    const third = { id: 3, sortIndex: 0 };

    push(heap, second, compare);
    push(heap, first, compare);
    expect(pop(heap, compare)).toBe(first);
    push(heap, third, compare);
    expect(pop(heap, compare)).toBe(third);
    expect(pop(heap, compare)).toBe(second);
  });

  test("places a node after a partial sift-up", () => {
    const heap: Item[] = [];
    for (const sortIndex of [1, 2, 4, 5, 6, 7, 8, 3]) {
      push(heap, { id: sortIndex, sortIndex }, compare);
    }

    expect(Array.from({ length: 8 }, () => pop(heap, compare)?.sortIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});
