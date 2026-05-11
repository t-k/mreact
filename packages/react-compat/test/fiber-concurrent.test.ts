// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "../src/element.js";
import { commitFiberRoot } from "../src/fiber-commit.js";
import { reconcileChildFibers } from "../src/fiber-child.js";
import { ChildDeletion, Placement } from "../src/fiber-flags.js";
import { createFiber, createFiberRoot } from "../src/fiber.js";
import { renderHostFiberRoot } from "../src/fiber-host.js";
import { SyncLane, TransitionLane } from "../src/fiber-lanes.js";
import { canReconcileConcurrently } from "../src/fiber-reconciler.js";
import {
  forceFrameRate,
  scheduleCallback,
  setSchedulerHostForTesting,
  type SchedulerHost,
} from "../src/fiber-scheduler.js";
import {
  performConcurrentWorkOnRoot,
  prepareFreshStack,
  renderRootConcurrent,
  scheduleConcurrentWorkOnRoot,
  shouldYieldAfterUnits,
} from "../src/fiber-work-loop.js";

function createDeadlineHost(
  autoAdvanceOnNow = 0,
  autoAdvanceAfterNowCalls = 0,
): SchedulerHost & {
  advance(ms: number): void;
  flushOneHostCallback(): void;
} {
  let time = 0;
  let nowCalls = 0;
  const callbacks: (() => void)[] = [];

  return {
    now: () => {
      nowCalls += 1;
      if (nowCalls > autoAdvanceAfterNowCalls) {
        time += autoAdvanceOnNow;
      }
      return time;
    },
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback) {
      callbacks.push(callback);
      return callback;
    },
    cancelHostTimeout() {},
    advance(ms) {
      time += ms;
    },
    flushOneHostCallback() {
      callbacks.shift()?.();
    },
  };
}

function treeWithItems(count: number) {
  return createElement(
    "ul",
    null,
    Array.from({ length: count }, (_, index) =>
      createElement("li", { key: String(index) }, String(index)),
    ),
  );
}

afterEach(() => {
  setSchedulerHostForTesting(undefined);
  forceFrameRate(0);
});

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

  it("resumes yielded host work from the next unit", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    prepareFreshStack(root, treeWithItems(2), TransitionLane);

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: shouldYieldAfterUnits(2),
      }).status,
    ).toBe("yielded");
    expect(root.finishedWork).toBeUndefined();
    expect(root.workInProgress?.tag).toBe("host-component");

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");
    expect(root.finishedWork?.child?.type).toBe("ul");
    expect(root.finishedWork?.child?.child?.type).toBe("li");
    expect(root.finishedWork?.child?.child?.sibling?.type).toBe("li");
    expect(container.innerHTML).toBe("");
  });

  it("resumes yielded function component work without replaying completed components", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const calls: string[] = [];

    function Item(props: { label: string }) {
      calls.push(props.label);
      return createElement("li", null, props.label);
    }

    prepareFreshStack(
      root,
      createElement(
        "ul",
        null,
        createElement(Item, { label: "A" }),
        createElement(Item, { label: "B" }),
      ),
      TransitionLane,
    );

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: shouldYieldAfterUnits(3),
      }).status,
    ).toBe("yielded");
    expect(calls).toEqual(["A"]);

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(calls).toEqual(["A", "B"]);
    expect(root.finishedWork?.child?.child?.tag).toBe("function-component");
    expect(root.finishedWork?.child?.child?.child?.type).toBe("li");
    expect(container.innerHTML).toBe("");
  });

  it("classifies function component trees as concurrent-capable", () => {
    function App() {
      return createElement("p", null, "ready");
    }

    expect(canReconcileConcurrently(createElement(App, null))).toBe(true);
  });

  it("uses browser deadline yielding when no test yield callback is provided", () => {
    const host = createDeadlineHost();
    setSchedulerHostForTesting(host);
    forceFrameRate(125);
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    prepareFreshStack(root, treeWithItems(4), TransitionLane);

    let status: string | undefined;
    scheduleCallback("normal", () => {
      const result = renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => {
          host.advance(9);
          return false;
        },
      });
      status = result.status;
    });
    host.flushOneHostCallback();

    expect(status).toBe("yielded");
    expect(root.finishedWork).toBeUndefined();
    expect(container.innerHTML).toBe("");
  });

  it("schedules yielded root work as a continuation callback", () => {
    const host = createDeadlineHost(9, 3);
    setSchedulerHostForTesting(host);
    forceFrameRate(125);
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    prepareFreshStack(root, treeWithItems(2), TransitionLane);

    scheduleConcurrentWorkOnRoot(root, TransitionLane);
    host.flushOneHostCallback();

    expect(root.finishedWork).toBeUndefined();
    expect(root.workInProgress).toBeDefined();

    forceFrameRate(1);
    host.flushOneHostCallback();

    expect(root.finishedWork?.child?.type).toBe("ul");
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

describe("fiber commit phase", () => {
  it("applies completed host work only during commit", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const finishedWork = renderHostFiberRoot(
      root,
      createElement("button", { id: "save" }, "Save"),
    );

    root.finishedWork = finishedWork;
    expect(container.innerHTML).toBe("");

    commitFiberRoot(root);

    expect(container.innerHTML).toBe('<button id="save">Save</button>');
    expect(root.current).toBe(finishedWork);
    expect(root.finishedWork).toBeUndefined();
  });

  it("runs ref cleanup for deleted host fibers before removal", () => {
    const calls: unknown[] = [];
    const container = document.createElement("div");
    const root = createFiberRoot(container);

    const first = renderHostFiberRoot(
      root,
      createElement(
        "div",
        null,
        createElement(
          "span",
          { ref: (node: unknown) => calls.push(node) },
          "A",
        ),
      ),
    );
    root.finishedWork = first;
    commitFiberRoot(root);
    expect(calls[0]).toBeInstanceOf(HTMLSpanElement);

    const second = renderHostFiberRoot(root, createElement("div", null, null));
    root.finishedWork = second;
    commitFiberRoot(root);

    expect(calls).toContain(null);
    expect(container.innerHTML).toBe("<div></div>");
  });
});

describe("fiber lane preemption", () => {
  it("aborts lower-priority work when a sync update is pending", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    prepareFreshStack(root, treeWithItems(30), TransitionLane);
    const yielded = renderRootConcurrent(root, TransitionLane, {
      shouldYield: shouldYieldAfterUnits(2),
    });
    const transitionWork = root.workInProgress;

    expect(yielded.status).toBe("yielded");
    expect(transitionWork).toBeDefined();

    root.pendingLanes |= SyncLane;
    root.workInProgressElement = createElement("p", null, "sync");
    const completed = performConcurrentWorkOnRoot(root, {
      shouldYield: () => false,
    });

    expect(completed.status).toBe("completed");
    expect(root.finishedWork?.child?.type).toBe("p");
    expect(root.finishedWork).not.toBe(transitionWork);
  });
});
