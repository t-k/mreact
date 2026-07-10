import {
  cancelCallback,
  forceFrameRate,
  getFirstCallbackNode,
  now,
  requestPaint,
  scheduleCallback,
  shouldYieldToHost,
  startLoggingSchedulerProfilingEvents,
  stopLoggingSchedulerProfilingEvents,
  type SchedulerProfilingEvent,
  type SchedulerCallback,
  type SchedulerPriority,
  type SchedulerTask,
} from "./fiber-scheduler.js";
export type {
  SchedulerCallback,
  SchedulerPriority,
  SchedulerProfilingEvent,
  SchedulerProfilingEventType,
  SchedulerTask,
} from "./fiber-scheduler.js";

/** Numeric priority level used by the scheduler-compatible API. */
export type unstable_PriorityLevel = 1 | 2 | 3 | 4 | 5;
/** Handle returned by unstable_scheduleCallback. */
export type unstable_CallbackNode = SchedulerTask;
/** Scheduled callback that may return a continuation. */
export type unstable_Callback = (
  didTimeout: boolean,
) => unstable_Callback | null | void;

/** Highest-priority scheduler task for immediate work. */
export const unstable_ImmediatePriority = 1;
/** Scheduler priority for user-blocking work. */
export const unstable_UserBlockingPriority = 2;
/** Scheduler priority for normal work. */
export const unstable_NormalPriority = 3;
/** Scheduler priority for low-priority work. */
export const unstable_LowPriority = 4;
/** Scheduler priority for idle work. */
export const unstable_IdlePriority = 5;
/** Profiling controls for scheduler-compatible tracing. */
export interface unstable_ProfilingControls {
  startLoggingProfilingEvents(): void;
  stopLoggingProfilingEvents(): readonly SchedulerProfilingEvent[] | null;
}

export const unstable_Profiling: unstable_ProfilingControls = {
  startLoggingProfilingEvents: startLoggingSchedulerProfilingEvents,
  stopLoggingProfilingEvents: stopLoggingSchedulerProfilingEvents,
};
/** Profiling event emitted by scheduler-compatible tracing. */
export type unstable_ProfilingEvent = SchedulerProfilingEvent;

let currentPriorityLevel: unstable_PriorityLevel = unstable_NormalPriority;

/** Returns the scheduler clock time in milliseconds. */
export function unstable_now(): number {
  return now();
}

/** Schedules a callback at the requested scheduler priority. */
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

/** Cancels a scheduled callback node. */
export function unstable_cancelCallback(task: unstable_CallbackNode): void {
  cancelCallback(task);
}

/** Returns true when the current scheduler task should yield to the host. */
export function unstable_shouldYield(): boolean {
  return shouldYieldToHost();
}

/** Requests a paint opportunity from the host scheduler. */
export function unstable_requestPaint(): void {
  requestPaint();
}

/** Sets the target frame rate for scheduler yielding. */
export function unstable_forceFrameRate(fps: number): void {
  forceFrameRate(fps);
}

/** Returns the priority currently active for scheduler-compatible callbacks. */
export function unstable_getCurrentPriorityLevel(): unstable_PriorityLevel {
  return currentPriorityLevel;
}

/** Runs a callback at the requested scheduler priority. */
export function unstable_runWithPriority<T>(
  priorityLevel: unstable_PriorityLevel,
  callback: () => T,
): T {
  return runWithPriorityLevel(priorityLevel, callback);
}

/** Runs a callback at normal priority when the current priority is higher. */
export function unstable_next<T>(callback: () => T): T {
  const nextPriority =
    currentPriorityLevel === unstable_ImmediatePriority ||
    currentPriorityLevel === unstable_UserBlockingPriority
      ? unstable_NormalPriority
      : currentPriorityLevel;
  return runWithPriorityLevel(nextPriority, callback);
}

/** Wraps a callback so it runs later with the current scheduler priority. */
export function unstable_wrapCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const capturedPriority = currentPriorityLevel;
  return (...args) => runWithPriorityLevel(capturedPriority, () => callback(...args));
}

/** Returns the first pending scheduler callback node, if one exists. */
export function unstable_getFirstCallbackNode(): unstable_CallbackNode | null {
  return getFirstCallbackNode();
}

/** Compatibility no-op for pausing global scheduler execution. */
export function unstable_pauseExecution(): void {
  // React exposes this as an unstable public hook; this scheduler has no global pause state.
}

/** Compatibility no-op for resuming global scheduler execution. */
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
