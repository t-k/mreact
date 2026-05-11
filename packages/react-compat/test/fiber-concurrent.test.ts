// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import {
  Suspense,
  SuspenseList,
  createElement,
  createErrorBoundary,
  forwardRef,
  lazy,
  memo,
} from "../src/element.js";
import { createContext } from "../src/context.js";
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

  it("resumes yielded forwardRef work without replaying completed wrappers", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const calls: string[] = [];
    const Button = forwardRef<{ label: string }, HTMLButtonElement>(
      (props, ref) => {
        calls.push(props.label);
        return createElement("button", { ref }, props.label);
      },
    );

    prepareFreshStack(
      root,
      createElement(
        "div",
        null,
        createElement(Button, { label: "A" }),
        createElement(Button, { label: "B" }),
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
    expect(root.finishedWork?.child?.child?.tag).toBe("forward-ref");
    expect(root.finishedWork?.child?.child?.child?.type).toBe("button");
  });

  it("skips memo work with equal props during concurrent render", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const calls: string[] = [];
    const Label = memo((props: { value: string }) => {
      calls.push(props.value);
      return createElement("span", null, props.value);
    });

    prepareFreshStack(root, createElement(Label, { value: "A" }), SyncLane);
    expect(
      renderRootConcurrent(root, SyncLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");
    commitFiberRoot(root);

    prepareFreshStack(root, createElement(Label, { value: "A" }), TransitionLane);
    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(calls).toEqual(["A"]);
    expect(root.finishedWork?.child?.tag).toBe("memo");
    expect(root.finishedWork?.child?.child).toBe(root.current.child?.child);
  });

  it("keeps provider context across yield and restores it after completion", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const Theme = createContext("outer");

    prepareFreshStack(
      root,
      createElement(
        Theme.Provider,
        { value: "inner" },
        createElement(Theme.Consumer, null, (value: unknown) =>
          createElement("span", null, String(value)),
        ),
      ),
      TransitionLane,
    );

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: shouldYieldAfterUnits(2),
      }).status,
    ).toBe("yielded");
    expect(Theme.values).toEqual(["inner"]);

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(Theme.values).toEqual([]);
    expect(root.finishedWork?.child?.tag).toBe("context-provider");
    expect(root.finishedWork?.child?.child?.tag).toBe("context-consumer");
    expect(root.finishedWork?.child?.child?.child?.type).toBe("span");
  });

  it("cleans yielded provider context when lower priority work is aborted", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const Theme = createContext("outer");

    prepareFreshStack(
      root,
      createElement(
        Theme.Provider,
        { value: "inner" },
        createElement("span", null, "inner"),
      ),
      TransitionLane,
    );
    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: shouldYieldAfterUnits(2),
      }).status,
    ).toBe("yielded");
    expect(Theme.values).toEqual(["inner"]);

    root.pendingLanes |= SyncLane;
    root.workInProgressElement = createElement("p", null, "sync");
    expect(
      performConcurrentWorkOnRoot(root, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(Theme.values).toEqual([]);
    expect(root.finishedWork?.child?.type).toBe("p");
  });

  it("captures pending lazy work in suspense and renders resolved work on retry", async () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    let resolveModule: (module: { default: (props: { label: string }) => unknown }) => void =
      () => {};
    const LazyLabel = lazy(
      () =>
        new Promise<{ default: (props: { label: string }) => unknown }>(
          (resolve) => {
            resolveModule = resolve;
          },
        ),
    );

    const element = createElement(
      Suspense,
      { fallback: createElement("em", null, "loading") },
      createElement(LazyLabel, { label: "ready" }),
    );

    prepareFreshStack(root, element, TransitionLane);
    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");
    expect(root.finishedWork?.child?.tag).toBe("suspense");
    expect(root.finishedWork?.child?.memoizedState).toEqual({
      didSuspend: true,
    });
    expect(root.finishedWork?.child?.child?.type).toBe("em");

    resolveModule({
      default: (props: { label: string }) =>
        createElement("span", null, props.label),
    });
    await LazyLabel.promise;

    prepareFreshStack(root, element, TransitionLane);
    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(root.finishedWork?.child?.memoizedState).toEqual({
      didSuspend: false,
    });
    expect(root.finishedWork?.child?.child?.tag).toBe("lazy");
    expect(root.finishedWork?.child?.child?.child?.tag).toBe(
      "function-component",
    );
    expect(root.finishedWork?.child?.child?.child?.child?.type).toBe("span");
  });

  it("routes rejected lazy work to an error boundary fallback", async () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const LazyBroken = lazy(() =>
      Promise.reject<{ default: () => unknown }>(new Error("boom")),
    );
    const errors: string[] = [];

    prepareFreshStack(
      root,
      createErrorBoundary(
        {
          fallback: (error) => createElement("strong", null, error.message),
          onError: (error) => {
            errors.push(error.message);
          },
        },
        createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement(LazyBroken, null),
        ),
      ),
      TransitionLane,
    );

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");
    await LazyBroken.promise?.catch(() => undefined);

    prepareFreshStack(root, root.workInProgressElement, TransitionLane);
    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(root.finishedWork?.child?.tag).toBe("error-boundary");
    expect(root.finishedWork?.child?.child?.type).toBe("strong");
    expect(errors).toEqual(["boom"]);
  });

  it("captures thrown errors in concurrent error boundaries", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);

    function Broken() {
      throw new Error("broken");
    }

    prepareFreshStack(
      root,
      createErrorBoundary(
        {
          fallback: (error) => createElement("strong", null, error.message),
        },
        createElement(Broken, null),
      ),
      TransitionLane,
    );

    expect(
      renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      }).status,
    ).toBe("completed");

    expect(root.finishedWork?.child?.tag).toBe("error-boundary");
    expect(root.finishedWork?.child?.child?.type).toBe("strong");
  });

  it("applies suspense list reveal order during concurrent capture", () => {
    const pending = new Promise<{ default: () => unknown }>(() => {});
    const Pending = lazy(() => pending);

    const renderList = (revealOrder: string) => {
      const root = createFiberRoot(document.createElement("div"));
      prepareFreshStack(
        root,
        createElement(
          SuspenseList,
          { revealOrder },
          [
            createElement(
              Suspense,
              {
                fallback: createElement("em", { key: "loading" }, "loading"),
                key: "pending",
              },
              createElement(Pending, null),
            ),
            createElement(
              Suspense,
              { fallback: null, key: "ready" },
              createElement("strong", null, "ready"),
            ),
          ],
        ),
        TransitionLane,
      );
      const result = renderRootConcurrent(root, TransitionLane, {
        shouldYield: () => false,
      });

      expect(result.status).toBe("completed");
      return root.finishedWork?.child;
    };

    const forwards = renderList("forwards");
    expect(forwards?.tag).toBe("suspense-list");
    expect(forwards?.child?.tag).toBe("suspense");
    expect(forwards?.child?.sibling).toBeUndefined();

    const together = renderList("together");
    expect(together?.child?.tag).toBe("suspense");
    expect(together?.child?.sibling?.tag).toBe("suspense");
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
