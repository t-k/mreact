import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { peek, pop, push } from "../src/scheduler-heap.js";

interface Item {
  id: number;
  sortIndex: number;
}

interface Model {
  items: Item[];
}

interface Real {
  heap: Item[];
}

const compare = (left: Item, right: Item): number =>
  left.sortIndex - right.sortIndex || left.id - right.id;
const item = fc.record({ id: fc.integer(), sortIndex: fc.integer() });

function expectHeapInvariant(heap: readonly Item[]): void {
  for (let child = 1; child < heap.length; child += 1) {
    const parent = (child - 1) >>> 1;

    expect(compare(heap[parent]!, heap[child]!)).toBeLessThanOrEqual(0);
  }
}

const pushCommand = item.map(
  (next) =>
    ({
      check: () => true,
      run(model: Model, real: Real) {
        model.items.push(next);
        push(real.heap, next, compare);

        expectHeapInvariant(real.heap);
        expect(peek(real.heap)).toEqual([...model.items].sort(compare)[0] ?? null);
      },
      toString: () => `push(${next.id},${next.sortIndex})`,
    }) satisfies fc.Command<Model, Real>,
);

const popCommand = fc.constant({
  check: () => true,
  run(model: Model, real: Real) {
    const expected = [...model.items].sort(compare)[0] ?? null;
    if (expected !== null) {
      model.items.splice(model.items.indexOf(expected), 1);
    }

    expect(pop(real.heap, compare)).toEqual(expected);
    expectHeapInvariant(real.heap);
  },
  toString: () => "pop()",
} satisfies fc.Command<Model, Real>);

describe("scheduler heap properties", () => {
  test("matches a sorted multiset model across generated operation sequences", () => {
    fc.assert(
      fc.property(fc.commands([pushCommand, popCommand], { maxCommands: 100 }), (commands) => {
        fc.modelRun(() => ({ model: { items: [] }, real: { heap: [] } }), commands);
      }),
      { numRuns: 500 },
    );
  });

  test("pops every generated item in comparator order", () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 200 }), (items) => {
        const heap: Item[] = [];
        for (const entry of items) {
          push(heap, entry, compare);
        }

        const popped = Array.from({ length: items.length }, () => pop(heap, compare));

        expect(popped).toEqual([...items].sort(compare));
        expect(pop(heap, compare)).toBeNull();
      }),
      { numRuns: 500 },
    );
  });
});
