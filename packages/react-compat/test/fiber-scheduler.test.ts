import { afterEach, describe, expect, test } from "vitest";
import {
  cancelCallback,
  forceFrameRate,
  requestPaint,
  scheduleCallback,
  setSchedulerHostForTesting,
  shouldYieldToHost,
  type SchedulerCallback,
  type SchedulerHost,
} from "../src/fiber-scheduler.js";

interface TestHost extends SchedulerHost {
  advance(ms: number): void;
  flushOneHostCallback(): void;
  setInputPending(pending: boolean): void;
  scheduledHostCallbackCount(): number;
}

function createTestHost(): TestHost {
  let time = 0;
  let inputPending = false;
  const callbacks: (() => void)[] = [];
  const timeouts = new Map<number, () => void>();
  let nextTimeoutId = 1;

  return {
    now: () => time,
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback, _ms) {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      timeouts.set(id, callback);
      return id;
    },
    cancelHostTimeout(id) {
      timeouts.delete(id as number);
    },
    isInputPending: () => inputPending,
    advance(ms) {
      time += ms;
      for (const callback of Array.from(timeouts.values())) {
        callback();
      }
      timeouts.clear();
    },
    flushOneHostCallback() {
      callbacks.shift()?.();
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
