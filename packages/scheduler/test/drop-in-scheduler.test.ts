import { describe, expect, test } from "vitest";
import {
  unstable_NormalPriority,
  unstable_cancelCallback,
  unstable_getCurrentPriorityLevel,
  unstable_runWithPriority,
  unstable_scheduleCallback,
} from "../src/index.js";

describe("scheduler drop-in entrypoint", () => {
  test("exports React scheduler unstable API shape", async () => {
    const calls: number[] = [];
    const task = unstable_scheduleCallback(unstable_NormalPriority, () => {
      calls.push(unstable_getCurrentPriorityLevel());
    });

    expect(task).toBeDefined();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(calls).toEqual([unstable_NormalPriority]);

    const cancelled = unstable_scheduleCallback(unstable_NormalPriority, () => {
      calls.push(99);
    });
    unstable_cancelCallback(cancelled);

    expect(unstable_runWithPriority(unstable_NormalPriority, () => "ok")).toBe("ok");
  });
});
