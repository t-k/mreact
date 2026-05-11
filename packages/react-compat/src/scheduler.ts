import {
  cancelCallback,
  forceFrameRate,
  getFirstCallbackNode,
  now,
  requestPaint,
  scheduleCallback,
  shouldYieldToHost,
  type SchedulerCallback,
  type SchedulerPriority,
  type SchedulerTask,
} from "./fiber-scheduler.js";

export type unstable_PriorityLevel = 1 | 2 | 3 | 4 | 5;
export type unstable_CallbackNode = SchedulerTask;
export type unstable_Callback = (
  didTimeout: boolean,
) => unstable_Callback | null | void;

export const unstable_ImmediatePriority = 1;
export const unstable_UserBlockingPriority = 2;
export const unstable_NormalPriority = 3;
export const unstable_LowPriority = 4;
export const unstable_IdlePriority = 5;
export const unstable_Profiling = null;

let currentPriorityLevel: unstable_PriorityLevel = unstable_NormalPriority;

export function unstable_now(): number {
  return now();
}

export function unstable_scheduleCallback(
  priorityLevel: unstable_PriorityLevel,
  callback: unstable_Callback,
  options?: { delay?: number },
): unstable_CallbackNode {
  return scheduleCallback(
    toSchedulerPriority(priorityLevel),
    wrapScheduledCallback(priorityLevel, callback),
    options,
  );
}

export function unstable_cancelCallback(task: unstable_CallbackNode): void {
  cancelCallback(task);
}

export function unstable_shouldYield(): boolean {
  return shouldYieldToHost();
}

export function unstable_requestPaint(): void {
  requestPaint();
}

export function unstable_forceFrameRate(fps: number): void {
  forceFrameRate(fps);
}

export function unstable_getCurrentPriorityLevel(): unstable_PriorityLevel {
  return currentPriorityLevel;
}

export function unstable_runWithPriority<T>(
  priorityLevel: unstable_PriorityLevel,
  callback: () => T,
): T {
  return runWithPriorityLevel(priorityLevel, callback);
}

export function unstable_next<T>(callback: () => T): T {
  const nextPriority =
    currentPriorityLevel === unstable_ImmediatePriority ||
    currentPriorityLevel === unstable_UserBlockingPriority
      ? unstable_NormalPriority
      : currentPriorityLevel;
  return runWithPriorityLevel(nextPriority, callback);
}

export function unstable_wrapCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const capturedPriority = currentPriorityLevel;
  return (...args) => runWithPriorityLevel(capturedPriority, () => callback(...args));
}

export function unstable_getFirstCallbackNode(): unstable_CallbackNode | null {
  return getFirstCallbackNode();
}

export function unstable_pauseExecution(): void {
  // React exposes this as an unstable public hook; this scheduler has no global pause state.
}

export function unstable_continueExecution(): void {
  // Host callbacks are requested eagerly by scheduleCallback, so there is no paused queue to resume.
}

function wrapScheduledCallback(
  priorityLevel: unstable_PriorityLevel,
  callback: unstable_Callback,
): SchedulerCallback {
  return (didTimeout) =>
    runWithPriorityLevel(priorityLevel, () => {
      const continuation = callback(didTimeout);

      if (typeof continuation === "function") {
        return wrapScheduledCallback(priorityLevel, continuation);
      }

      return undefined;
    });
}

function runWithPriorityLevel<T>(
  priorityLevel: unstable_PriorityLevel,
  callback: () => T,
): T {
  const previousPriority = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return callback();
  } finally {
    currentPriorityLevel = previousPriority;
  }
}

function toSchedulerPriority(
  priorityLevel: unstable_PriorityLevel,
): SchedulerPriority {
  if (priorityLevel === unstable_ImmediatePriority) {
    return "immediate";
  }

  if (priorityLevel === unstable_UserBlockingPriority) {
    return "user-blocking";
  }

  if (priorityLevel === unstable_LowPriority) {
    return "low";
  }

  if (priorityLevel === unstable_IdlePriority) {
    return "idle";
  }

  return "normal";
}
