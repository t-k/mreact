import { afterEach, describe, expect, test } from "vitest";
import {
  forceFrameRate,
  setSchedulerHostForTesting,
  type SchedulerHost,
} from "../src/fiber-scheduler.js";
import {
  unstable_cancelCallback,
  unstable_forceFrameRate,
  unstable_getCurrentPriorityLevel,
  unstable_getFirstCallbackNode,
  unstable_ImmediatePriority,
  unstable_LowPriority,
  unstable_next,
  unstable_NormalPriority,
  unstable_requestPaint,
  unstable_runWithPriority,
  unstable_scheduleCallback,
  unstable_shouldYield,
  unstable_UserBlockingPriority,
  unstable_wrapCallback,
} from "../src/scheduler.js";

interface TestSchedulerHost extends SchedulerHost {
  advance(ms: number): void;
  flushOneHostCallback(): void;
}

function createTestSchedulerHost(): TestSchedulerHost {
  let time = 0;
  const callbacks: (() => void)[] = [];
  return {
    now: () => time,
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback, ms) {
      time += ms;
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

describe("react-compat scheduler entrypoint", () => {
  afterEach(() => {
    setSchedulerHostForTesting(undefined);
    forceFrameRate(0);
  });

  test("exports React scheduler compatible priority constants", () => {
    expect(unstable_ImmediatePriority).toBe(1);
    expect(unstable_UserBlockingPriority).toBe(2);
    expect(unstable_NormalPriority).toBe(3);
    expect(unstable_LowPriority).toBe(4);
  });

  test("schedules callbacks by public priority and exposes the current priority", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const calls: number[] = [];

    const lowTask = unstable_scheduleCallback(unstable_LowPriority, () => {
      calls.push(unstable_getCurrentPriorityLevel());
    });
    unstable_scheduleCallback(unstable_UserBlockingPriority, () => {
      calls.push(unstable_getCurrentPriorityLevel());
    });

    expect(unstable_getFirstCallbackNode()).not.toBeNull();
    expect(unstable_getFirstCallbackNode()).not.toBe(lowTask);

    host.flushOneHostCallback();

    expect(calls).toEqual([
      unstable_UserBlockingPriority,
      unstable_LowPriority,
    ]);
    expect(unstable_getFirstCallbackNode()).toBeNull();
  });

  test("cancels scheduled callbacks", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    const task = unstable_scheduleCallback(unstable_NormalPriority, () => {
      calls.push("cancelled");
    });
    unstable_cancelCallback(task);
    unstable_scheduleCallback(unstable_NormalPriority, () => {
      calls.push("kept");
    });

    host.flushOneHostCallback();

    expect(calls).toEqual(["kept"]);
  });

  test("runs callbacks with explicit and captured priority", () => {
    const calls: number[] = [];
    const wrapped = unstable_runWithPriority(unstable_UserBlockingPriority, () => {
      const callback = unstable_wrapCallback(() => {
        calls.push(unstable_getCurrentPriorityLevel());
      });
      calls.push(unstable_getCurrentPriorityLevel());
      return callback;
    });

    unstable_runWithPriority(unstable_LowPriority, () => {
      calls.push(unstable_getCurrentPriorityLevel());
      wrapped();
    });

    expect(calls).toEqual([
      unstable_UserBlockingPriority,
      unstable_LowPriority,
      unstable_UserBlockingPriority,
    ]);
  });

  test("unstable_next lowers blocking priority to normal for the callback", () => {
    const priority = unstable_runWithPriority(unstable_UserBlockingPriority, () =>
      unstable_next(() => unstable_getCurrentPriorityLevel()),
    );

    expect(priority).toBe(unstable_NormalPriority);
  });

  test("forwards shouldYield, requestPaint, and forceFrameRate", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    unstable_forceFrameRate(125);
    const yields: boolean[] = [];

    unstable_scheduleCallback(unstable_NormalPriority, () => {
      yields.push(unstable_shouldYield());
      host.advance(9);
      yields.push(unstable_shouldYield());
      unstable_requestPaint();
      yields.push(unstable_shouldYield());
    });

    host.flushOneHostCallback();

    expect(yields).toEqual([false, true, true]);
  });
});
