// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { commitFiberRoot, detachFiberRefs } from "../src/fiber-commit.js";
import { createFiber, createFiberRoot, type Fiber } from "../src/fiber.js";
import { createElement, createRoot } from "../src/index.js";
import { attachRef } from "../src/ref-lifecycle.js";
import * as refLifecycle from "../src/ref-lifecycle.js";

function refFiber(ref: unknown): Fiber {
  const fiber = createFiber("host-component", { ref });
  fiber.type = "div";
  fiber.stateNode = document.createElement("div");
  fiber.hasRefSubtree = true;
  return fiber;
}

describe("ref cleanup traversal", () => {
  it.each([null, undefined])("does not invoke ref cleanup for nodes without a ref (%s)", (ref) => {
    const root = createFiberRoot(document.createElement("div"));
    root.current.pendingProps = { ref };
    root.finishedWork = createFiber("host-root", { children: null, ref });
    const fiber = createFiber("host-component", { ref });
    const detach = vi.spyOn(refLifecycle, "detachRef");
    try {
      commitFiberRoot(root);
      detachFiberRefs(fiber);

      expect(detach).not.toHaveBeenCalled();
    } finally {
      detach.mockRestore();
    }
  });

  it("does not allocate ref membership Sets for an empty unknown-summary commit", () => {
    const root = createFiberRoot(document.createElement("div"));
    root.finishedWork = createFiber("host-root", { children: null });
    const allocations: unknown[][] = [];
    const originalSet = globalThis.Set;
    vi.stubGlobal("Set", new Proxy(originalSet, {
      construct(target, args, newTarget) {
        allocations.push(args);
        return Reflect.construct(target, args, newTarget);
      },
    }));
    try {
      commitFiberRoot(root);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(allocations).toEqual([]);
  });

  it("skips ref-free subtrees when host summaries are known", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const empty = createFiber("fragment");
    const child = createFiber("host-component");
    let reads = 0;
    Object.defineProperty(empty, "memoizedProps", { get: () => { reads += 1; return {}; } });
    Object.defineProperty(child, "memoizedProps", { get: () => { reads += 1; return {}; } });
    empty.child = child;
    const calls: unknown[] = [];
    empty.sibling = refFiber((node: unknown) => calls.push(node));
    root.current.child = empty;
    root.current.hasRefSubtree = true;
    root.refCleanupKnown = true;
    root.finishedWork = createFiber("host-root", { children: null });

    commitFiberRoot(root);

    expect(reads).toBe(0);
    expect(calls).toEqual([null]);
  });

  it("examines unflagged refs when summaries are unknown", () => {
    const root = createFiberRoot(document.createElement("div"));
    const calls: unknown[] = [];
    const child = refFiber((node: unknown) => calls.push(node));
    child.hasRefSubtree = false;
    root.current.child = child;
    root.finishedWork = createFiber("host-root", { children: null });

    commitFiberRoot(root);

    expect(calls).toEqual([null]);
  });

  it("collects parent, child, and sibling refs in preorder without requiring summaries for disposal", () => {
    const calls: string[] = [];
    const parent = refFiber(() => calls.push("parent"));
    const child = refFiber(() => calls.push("child"));
    const sibling = refFiber(() => calls.push("sibling"));
    parent.child = child;
    parent.sibling = sibling;
    parent.hasRefSubtree = false;
    child.hasRefSubtree = false;
    sibling.hasRefSubtree = false;

    detachFiberRefs(parent);

    expect(calls).toEqual(["parent", "child", "sibling"]);
  });

  it("continues detaching refs after cleanup errors and reports the first error", () => {
    const failure = new Error("cleanup");
    const first = refFiber(() => () => { throw failure; });
    const calls: unknown[] = [];
    first.sibling = refFiber((node: unknown) => calls.push(node));
    attachRef(first.pendingProps && (first.pendingProps as { ref: unknown }).ref, first.stateNode);

    expect(() => detachFiberRefs(first)).toThrow(failure);
    expect(calls).toEqual([null]);
  });

  it("collects commit cleanup errors while continuing to detach sibling refs", () => {
    const root = createFiberRoot(document.createElement("div"));
    const failure = new Error("commit cleanup");
    const first = refFiber(() => () => { throw failure; });
    const calls: unknown[] = [];
    first.sibling = refFiber((node: unknown) => calls.push(node));
    attachRef((first.pendingProps as { ref: unknown }).ref, first.stateNode);
    root.current.child = first;
    root.current.hasRefSubtree = true;
    root.refCleanupKnown = true;
    root.finishedWork = createFiber("host-root", { children: null });

    const errors = commitFiberRoot(root);

    expect(errors).toEqual([failure]);
    expect(calls).toEqual([null]);
  });

  it("preserves retained refs while deleting sparse nested refs", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const log: string[] = [];
    const a = (node: unknown) => { if (node === null) log.push("a"); };
    const b = (node: unknown) => { if (node === null) log.push("b"); };
    const tree = (includeA: boolean) => createElement("section", null, [
      createElement("div", { key: "empty" }, createElement("p", null, "no ref")),
      ...(includeA ? [createElement("div", { key: "a" }, createElement("span", { ref: a }, "A"))] : []),
      createElement("div", { key: "b" }, createElement("span", { ref: b }, "B")),
    ]);

    root.render(tree(true));
    const retained = container.querySelectorAll("span")[1];
    root.render(tree(false));

    expect(log).toEqual(["a"]);
    expect(container.querySelector("span")).toBe(retained);
    root.unmount();
    expect(log).toEqual(["a", "b"]);
  });
});
