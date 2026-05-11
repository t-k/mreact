// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createElement } from "../src/element.js";
import { createFiberRoot } from "../src/fiber.js";
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
