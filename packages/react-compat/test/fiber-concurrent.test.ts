// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createElement } from "../src/element.js";
import { reconcileChildFibers } from "../src/fiber-child.js";
import { ChildDeletion, Placement } from "../src/fiber-flags.js";
import { createFiber, createFiberRoot } from "../src/fiber.js";
import { SyncLane, TransitionLane } from "../src/fiber-lanes.js";
import {
  prepareFreshStack,
  renderRootConcurrent,
  shouldYieldAfterUnits,
} from "../src/fiber-work-loop.js";

function treeWithItems(count: number) {
  return createElement(
    "ul",
    null,
    Array.from({ length: count }, (_, index) =>
      createElement("li", { key: String(index) }, String(index)),
    ),
  );
}

describe("concurrent fiber work loop", () => {
  it("yields before commit when the unit budget is exhausted", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    prepareFreshStack(root, treeWithItems(20), TransitionLane);

    const result = renderRootConcurrent(root, TransitionLane, {
      shouldYield: shouldYieldAfterUnits(3),
    });

    expect(result.status).toBe("yielded");
    expect(root.workInProgress).toBeDefined();
    expect(root.finishedWork).toBeUndefined();
    expect(container.innerHTML).toBe("");
  });

  it("finishes work without mutating the container before commit", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    prepareFreshStack(root, createElement("p", null, "ready"), SyncLane);

    const result = renderRootConcurrent(root, SyncLane, {
      shouldYield: () => false,
    });

    expect(result.status).toBe("completed");
    expect(root.finishedWork?.child?.tag).toBe("host-component");
    expect(container.innerHTML).toBe("");
  });
});

describe("fiber child reconciliation", () => {
  it("reuses matching key and type alternates", () => {
    const parent = createFiber("host-component", { children: null });
    const current = createFiber("host-component", { id: "old" }, "a");
    current.type = "li";

    const first = reconcileChildFibers(parent, current, [
      createElement("li", { key: "a", id: "next" }, "A"),
    ]);

    expect(first?.alternate).toBe(current);
    expect(first?.flags & Placement).toBe(0);
    expect(parent.deletions).toBeUndefined();
  });

  it("marks mismatched keyed children as deletion plus placement", () => {
    const parent = createFiber("host-component", { children: null });
    const current = createFiber("host-component", { id: "old" }, "a");
    current.type = "li";

    const first = reconcileChildFibers(parent, current, [
      createElement("section", { key: "a" }, "A"),
    ]);

    expect(first?.alternate).toBeUndefined();
    expect(first?.flags & Placement).toBe(Placement);
    expect(parent.flags & ChildDeletion).toBe(ChildDeletion);
    expect(parent.deletions).toEqual([current]);
  });
});
