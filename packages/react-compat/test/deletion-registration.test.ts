// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { reconcileChildFibers } from "../src/fiber-child.js";
import { ChildDeletion } from "../src/fiber-flags.js";
import { createFiber, createWorkInProgress, type Fiber } from "../src/fiber.js";
import { createElement, createRoot, useEffect } from "../src/index.js";

function children(count: number): Fiber[] {
  const result = Array.from({ length: count }, (_, index) => {
    const fiber = createFiber("host-component", undefined, String(index));
    fiber.type = "li";
    return fiber;
  });
  for (let index = 1; index < result.length; index += 1) {
    result[index - 1]!.sibling = result[index];
  }
  return result;
}

describe("deletion registration", () => {
  it("bounds membership work linearly for a full deletion", () => {
    const current = children(1000);
    const parent = createFiber("host-component");
    let reads = 0;
    parent.deletions = new Proxy<Fiber[]>([], {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads += 1;
        return Reflect.get(target, key, receiver);
      },
    });

    reconcileChildFibers(parent, current[0], []);

    expect(reads).toBeLessThanOrEqual(current.length * 2);
    expect(parent.flags & ChildDeletion).toBe(ChildDeletion);
    expect(parent.deletions).toEqual(current);
  });

  it.each([0, 1, 8, 31, 32, 33, 64, 1000])("preserves order and prevents duplicate registration for %i children", (count) => {
    const current = children(count);
    const parent = createFiber("host-component");
    reconcileChildFibers(parent, current[0], []);
    reconcileChildFibers(parent, current[0], []);

    expect(parent.deletions ?? []).toEqual(current);
    expect(new Set(parent.deletions).size).toBe(count);
  });

  it("seeds membership from an existing deletion list", () => {
    const current = children(80);
    const parent = createFiber("host-component");
    parent.deletions = current.slice(0, 40);

    reconcileChildFibers(parent, current[0], []);

    expect(parent.deletions).toEqual(current);
  });

  it("does not carry membership into reset or reused work-in-progress lists", () => {
    const current = children(80);
    const parent = createFiber("host-component");
    reconcileChildFibers(parent, current[0], []);
    const firstDeletions = parent.deletions;
    parent.deletions = undefined;
    reconcileChildFibers(parent, current[0], []);

    expect(parent.deletions).not.toBe(firstDeletions);
    expect(parent.deletions).toEqual(current);

    const work = createWorkInProgress(parent, undefined);
    reconcileChildFibers(work, current[0], []);
    const previousWorkDeletions = work.deletions;
    const reused = createWorkInProgress(parent, undefined);
    expect(reused).toBe(work);
    expect(reused.deletions).toBeUndefined();
    reconcileChildFibers(reused, current[0], []);
    expect(reused.deletions).not.toBe(previousWorkDeletions);
    expect(reused.deletions).toEqual(current);
  });

  it("cleans up effects and callback refs once across replacements and full deletion", () => {
    const effects: number[] = [];
    const refs: number[] = [];
    function Row({ id }: { id: number }) {
      useEffect(() => () => effects.push(id), []);
      return createElement("li", { ref: (node: unknown) => { if (node === null) refs.push(id); } }, String(id));
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    const rows = (offset: number) => createElement("ul", null, Array.from({ length: 80 }, (_, index) => createElement(Row, { key: String(index + offset), id: index + offset })));

    root.render(rows(0));
    root.render(rows(80));
    root.render(null);

    expect(effects.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 160 }, (_, index) => index));
    expect(refs.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 160 }, (_, index) => index));
    expect(container.innerHTML).toBe("");
    root.unmount();
  });
});
