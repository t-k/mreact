import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cancelCallback,
  forceFrameRate,
  getFirstCallbackNode,
  requestPaint,
  scheduleCallback,
  setSchedulerHostForTesting,
  shouldYieldToHost,
  type SchedulerCallback,
  type SchedulerHost,
} from "../src/fiber-scheduler.js";

import * as schedulerHeap from "../src/scheduler-heap.js";

interface TestHost extends SchedulerHost {
  advance(ms: number): void;
  advanceTo(time: number): void;
  deliverDueTimeoutsAt(time: number): void;
  flushAllHostCallbacks(): void;
  flushOneHostCallback(): void;
  pendingTimeouts(): Array<{ due: number; id: number }>;
  setInputPending(pending: boolean): void;
  scheduledHostCallbackCount(): number;
}

function createTestHost(): TestHost {
  let time = 0;
  let inputPending = false;
  const callbacks: (() => void)[] = [];
  const timeouts = new Map<number, { callback: () => void; due: number }>();
  let nextTimeoutId = 1;

  return {
    now: () => time,
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback, ms) {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      timeouts.set(id, { callback, due: time + ms });
      return id;
    },
    cancelHostTimeout(id) {
      timeouts.delete(id as number);
    },
    isInputPending: () => inputPending,
    advance(ms) {
      this.advanceTo(time + ms);
    },
    advanceTo(target) {
      while (true) {
        const next = [...timeouts.entries()]
          .filter(([, timeout]) => timeout.due <= target)
          .sort(([leftId, left], [rightId, right]) => left.due - right.due || leftId - rightId)[0];
        if (next === undefined) break;
        const [id, timeout] = next;
        time = timeout.due;
        timeouts.delete(id);
        timeout.callback();
      }
      time = target;
    },
    deliverDueTimeoutsAt(target) {
      time = target;
      const pending = [...timeouts];
      for (const [id, timeout] of pending) {
        if (timeout.due <= target && timeouts.delete(id)) timeout.callback();
      }
    },
    flushAllHostCallbacks() {
      while (callbacks.length > 0) callbacks.shift()?.();
    },
    flushOneHostCallback() {
      callbacks.shift()?.();
    },
    pendingTimeouts() {
      return [...timeouts.entries()]
        .map(([id, timeout]) => ({ due: timeout.due, id }))
        .sort((left, right) => left.due - right.due || left.id - right.id);
    },
    setInputPending(pending) {
      inputPending = pending;
    },
    scheduledHostCallbackCount() {
      return callbacks.length;
    },
  };
}

describe("fiber scheduler", () => {
  afterEach(() => {
    setSchedulerHostForTesting(undefined);
    forceFrameRate(0);
    vi.restoreAllMocks();
  });

  test("runs higher priority tasks before lower priority tasks", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    scheduleCallback("low", () => {
      calls.push("low");
    });
    scheduleCallback("user-blocking", () => {
      calls.push("user-blocking");
    });

    host.flushOneHostCallback();

    expect(calls).toEqual(["user-blocking", "low"]);
  });

  test("does not run cancelled tasks", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    const task = scheduleCallback("normal", () => {
      calls.push("cancelled");
    });

    cancelCallback(task);
    scheduleCallback("normal", () => {
      calls.push("kept");
    });
    host.flushOneHostCallback();

    expect(calls).toEqual(["kept"]);
  });

  test("inspects a cancelled root without mutating the queue", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const cancelled = scheduleCallback("user-blocking", () => {});
    scheduleCallback("normal", () => {});

    cancelCallback(cancelled);

    expect(getFirstCallbackNode()).toBe(cancelled);
    expect(getFirstCallbackNode()).toBe(cancelled);

    host.flushOneHostCallback();
    expect(getFirstCallbackNode()).toBeNull();
  });

  test("does not execute cancelled ready tasks at either the root or below it", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    const root = scheduleCallback("user-blocking", () => {
      calls.push("root");
    });
    scheduleCallback("normal", () => {
      calls.push("kept");
    });
    const belowRoot = scheduleCallback("low", () => {
      calls.push("below-root");
    });

    cancelCallback(root);
    cancelCallback(belowRoot);

    expect(getFirstCallbackNode()).toBe(root);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["kept"]);
  });

  test("preserves a continuation when the running task inspects the queue", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    scheduleCallback("normal", () => {
      calls.push("first");
      expect(getFirstCallbackNode()).not.toBeNull();
      expect(getFirstCallbackNode()).not.toBeNull();
      return () => {
        calls.push("continuation");
      };
    });

    host.flushAllHostCallbacks();

    expect(calls).toEqual(["first", "continuation"]);
  });

  const timerCases = (["All", "Some", "None"] as const).flatMap((due) =>
    (["Empty", "Occupied"] as const).flatMap((ready) =>
      (["No", "Yes"] as const).map((cancel) => ({ due, ready, cancel })),
    ),
  );

  test.each(timerCases)("preserves $due due timers with $ready ready work and $cancel cancellation", ({
    due, ready, cancel,
  }) => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    const bulk = vi.spyOn(schedulerHeap, "heapify");
    const record = (name: string) => () => { calls.push(name); };

    if (ready === "Occupied") scheduleCallback("normal", record("ready"));
    const cancelled = scheduleCallback("normal", record("normal A"), { delay: 5 });
    scheduleCallback("normal", record("normal B"), { delay: 5 });
    scheduleCallback("user-blocking", record("priority"), { delay: 5 });
    scheduleCallback("immediate", record("later"), { delay: 15 });
    if (cancel === "Yes") cancelCallback(cancelled);

    const early = [
      "priority",
      ...(ready === "Occupied" ? ["ready"] : []),
      ...(cancel === "No" ? ["normal A"] : []),
      "normal B",
    ];
    host.deliverDueTimeoutsAt({ All: 20, Some: 10, None: 0 }[due]);
    host.flushAllHostCallbacks();
    const first = due === "All" ? ["later", ...early]
      : due === "Some" ? early
        : ready === "Occupied" ? ["ready"] : [];
    expect(calls).toEqual(first);
    expect(bulk).toHaveBeenCalledTimes(due === "All" && ready === "Empty" ? 1 : 0);

    host.deliverDueTimeoutsAt(20);
    host.flushAllHostCallbacks();
    const second = due === "All" ? [] : due === "Some" ? ["later"]
      : ["later", ...early.filter((name) => name !== "ready")];
    expect(calls).toEqual([...first, ...second]);
  });

  test("does not promote a timer whose handle now has a later start time", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    scheduleCallback("normal", () => { calls.push("first"); }, { delay: 5 });
    const later = scheduleCallback("immediate", () => { calls.push("later"); }, { delay: 6 });
    later.startTime = 20;

    host.deliverDueTimeoutsAt(6);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["first"]);

    host.deliverDueTimeoutsAt(20);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["first", "later"]);
  });

  test("preserves timer order when task handles have equal IDs", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    scheduleCallback("normal", () => { calls.push("first"); }, { delay: 5 });
    const second = scheduleCallback("normal", () => { calls.push("second"); }, { delay: 5 });
    const third = scheduleCallback("normal", () => { calls.push("third"); }, { delay: 5 });
    second.id = third.id;

    host.deliverDueTimeoutsAt(5);
    host.flushAllHostCallbacks();

    expect(calls).toEqual(["first", "second", "third"]);
  });

  test("promotes delayed tasks only when their start time is reached", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    scheduleCallback(
      "normal",
      () => {
        calls.push("ten");
      },
      { delay: 10 },
    );
    scheduleCallback(
      "normal",
      () => {
        calls.push("twenty-first");
      },
      { delay: 20 },
    );
    scheduleCallback(
      "normal",
      () => {
        calls.push("twenty-second");
      },
      { delay: 20 },
    );

    host.advanceTo(9);
    host.flushAllHostCallbacks();
    expect(calls).toEqual([]);
    host.advanceTo(10);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["ten"]);
    host.advanceTo(20);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["ten", "twenty-first", "twenty-second"]);
  });

  test("skips a cancelled delayed root and reschedules the next timeout", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    const root = scheduleCallback(
      "normal",
      () => {
        calls.push("cancelled");
      },
      { delay: 10 },
    );
    scheduleCallback(
      "normal",
      () => {
        calls.push("kept");
      },
      { delay: 30 },
    );
    cancelCallback(root);

    expect(host.pendingTimeouts().map(({ due }) => due)).toEqual([10]);
    host.advanceTo(10);
    expect(host.pendingTimeouts().map(({ due }) => due)).toEqual([30]);
    host.advanceTo(29);
    host.flushAllHostCallbacks();
    expect(calls).toEqual([]);
    host.advanceTo(30);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["kept"]);
  });

  test("skips a cancelled delayed timer below the heap root", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    scheduleCallback(
      "normal",
      () => {
        calls.push("ten");
      },
      { delay: 10 },
    );
    const cancelled = scheduleCallback(
      "normal",
      () => {
        calls.push("cancelled");
      },
      { delay: 20 },
    );
    scheduleCallback(
      "normal",
      () => {
        calls.push("thirty");
      },
      { delay: 30 },
    );
    cancelCallback(cancelled);

    host.advanceTo(10);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["ten"]);
    expect(host.pendingTimeouts().map(({ due }) => due)).toEqual([30]);
    host.advanceTo(30);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["ten", "thirty"]);
  });

  test("yields when the frame interval is exhausted and resumes continuation on the next host callback", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    forceFrameRate(125);
    const calls: string[] = [];
    let continuation: SchedulerCallback | undefined;

    continuation = () => {
      calls.push("slice");
      host.advance(9);
      return continuation;
    };
    scheduleCallback("normal", continuation);

    host.flushOneHostCallback();
    expect(calls).toEqual(["slice"]);
    expect(host.scheduledHostCallbackCount()).toBe(1);

    continuation = undefined;
    host.flushOneHostCallback();
    expect(calls).toEqual(["slice", "slice"]);
  });

  test("runs expired tasks even when the deadline has passed", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: boolean[] = [];

    scheduleCallback("immediate", (didTimeout) => {
      calls.push(didTimeout);
    });
    host.advance(100);
    host.flushOneHostCallback();

    expect(calls).toEqual([true]);
  });

  test("requestPaint forces shouldYieldToHost during the current host callback", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const yields: boolean[] = [];

    scheduleCallback("normal", () => {
      yields.push(shouldYieldToHost());
      requestPaint();
      yields.push(shouldYieldToHost());
    });
    host.flushOneHostCallback();

    expect(yields).toEqual([false, true]);
  });

  test("makes progress when input is already pending at the start of a slice", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    host.setInputPending(true);
    const calls: string[] = [];

    scheduleCallback("normal", () => {
      calls.push("first");
    });
    scheduleCallback("normal", () => {
      calls.push("second");
    });

    host.flushOneHostCallback();

    expect(calls).toEqual(["first", "second"]);
    expect(host.scheduledHostCallbackCount()).toBe(0);
  });

  test("yields after the frame interval even when input is pending", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    scheduleCallback("normal", () => {
      calls.push("first");
      host.advance(5);
      host.setInputPending(true);
    });
    scheduleCallback("normal", () => {
      calls.push("second");
    });

    host.flushOneHostCallback();

    expect(calls).toEqual(["first"]);
    expect(host.scheduledHostCallbackCount()).toBe(1);

    host.setInputPending(false);
    host.flushOneHostCallback();

    expect(calls).toEqual(["first", "second"]);
  });

  test("reschedules remaining work after a task throws", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    scheduleCallback("normal", () => {
      throw new Error("boom");
    });
    scheduleCallback("normal", () => {
      calls.push("after");
    });

    expect(() => host.flushOneHostCallback()).toThrow("boom");
    host.flushOneHostCallback();

    expect(calls).toEqual(["after"]);
  });
});
