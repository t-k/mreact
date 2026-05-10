// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createRoot } from "../src/index.js";
import { NoFlags } from "../src/fiber-flags.js";
import {
  ContinuousEventLane,
  DiscreteEventLane,
  HydrationLane,
  NoLane,
  SyncLane,
  TransitionLane,
  getHighestPriorityLane,
  includesLane,
  mergeLanes,
  removeLanes,
} from "../src/fiber-lanes.js";
import {
  createFiberRoot,
  createHostRootFiber,
  createWorkInProgress,
} from "../src/fiber.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";

describe("fiber lanes", () => {
  it("selects the highest priority lane from a pending lane set", () => {
    const lanes = mergeLanes(
      TransitionLane,
      mergeLanes(ContinuousEventLane, SyncLane),
    );

    expect(getHighestPriorityLane(lanes)).toBe(SyncLane);
  });

  it("keeps hydration ahead of continuous and transition work", () => {
    const lanes = mergeLanes(
      TransitionLane,
      mergeLanes(ContinuousEventLane, HydrationLane),
    );

    expect(getHighestPriorityLane(lanes)).toBe(HydrationLane);
  });

  it("can merge, test, and remove lanes", () => {
    const lanes = mergeLanes(DiscreteEventLane, TransitionLane);

    expect(includesLane(lanes, DiscreteEventLane)).toBe(true);
    expect(includesLane(lanes, SyncLane)).toBe(false);
    expect(removeLanes(lanes, DiscreteEventLane)).toBe(TransitionLane);
    expect(getHighestPriorityLane(NoLane)).toBe(NoLane);
  });
});

describe("fiber model", () => {
  it("creates a FiberRoot with a host-root current fiber", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);

    expect(root.container).toBe(container);
    expect(root.current.tag).toBe("host-root");
    expect(root.current.stateNode).toBe(root);
    expect(root.current.return).toBeUndefined();
    expect(root.pendingLanes).toBe(NoLane);
  });

  it("creates and reuses alternate work-in-progress fibers", () => {
    const current = createHostRootFiber();
    current.memoizedProps = { children: "old" };
    current.memoizedState = { value: 1 };

    const first = createWorkInProgress(current, { children: "next" });
    expect(first).not.toBe(current);
    expect(first.alternate).toBe(current);
    expect(current.alternate).toBe(first);
    expect(first.pendingProps).toEqual({ children: "next" });
    expect(first.memoizedProps).toEqual({ children: "old" });
    expect(first.memoizedState).toEqual({ value: 1 });

    first.flags = 1;
    const second = createWorkInProgress(current, { children: "again" });
    expect(second).toBe(first);
    expect(second.flags).toBe(NoFlags);
    expect(second.pendingProps).toEqual({ children: "again" });
  });
});

describe("fiber root work-loop adapter", () => {
  it("attaches a FiberRoot to createRoot containers", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render("hello");

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot).toBeDefined();
    expect(fiberRoot?.current.memoizedProps).toEqual({ children: "hello" });
    expect(fiberRoot?.pendingLanes).toBe(NoLane);
    expect(container.textContent).toBe("hello");
  });
});
