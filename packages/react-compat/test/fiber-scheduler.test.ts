import { afterEach, describe, expect, test } from "vitest";
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

interface TestHost extends SchedulerHost {
  advance(ms: number): void;
  advanceTo(time: number): void;
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

  test("does not expose a cancelled ready task as the first callback", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const cancelled = scheduleCallback("user-blocking", () => {});
    const kept = scheduleCallback("normal", () => {});

    cancelCallback(cancelled);

    expect(getFirstCallbackNode()).toBe(kept);
  });

  test("does not expose cancelled ready tasks at either the root or below it", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    const root = scheduleCallback("user-blocking", () => calls.push("root"));
    const kept = scheduleCallback("normal", () => calls.push("kept"));
    const belowRoot = scheduleCallback("low", () => calls.push("below-root"));

    cancelCallback(root);
    cancelCallback(belowRoot);

    expect(getFirstCallbackNode()).toBe(kept);
    host.flushAllHostCallbacks();
    expect(calls).toEqual(["kept"]);
  });

  test("promotes delayed tasks only when their start time is reached", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];
    scheduleCallback("normal", () => calls.push("ten"), { delay: 10 });
    scheduleCallback("normal", () => calls.push("twenty-first"), { delay: 20 });
    scheduleCallback("normal", () => calls.push("twenty-second"), { delay: 20 });

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
    const root = scheduleCallback("normal", () => calls.push("cancelled"), { delay: 10 });
    scheduleCallback("normal", () => calls.push("kept"), { delay: 30 });
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
    scheduleCallback("normal", () => calls.push("ten"), { delay: 10 });
    const cancelled = scheduleCallback("normal", () => calls.push("cancelled"), { delay: 20 });
    scheduleCallback("normal", () => calls.push("thirty"), { delay: 30 });
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

  test("yields to pending input after the current task", () => {
    const host = createTestHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    scheduleCallback("normal", () => {
      calls.push("first");
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
