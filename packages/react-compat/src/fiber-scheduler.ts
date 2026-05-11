export type SchedulerPriority =
  | "immediate"
  | "user-blocking"
  | "normal"
  | "low"
  | "idle";

export type SchedulerCallback = (
  didTimeout: boolean,
) => SchedulerCallback | void;

export interface SchedulerTask {
  id: number;
  callback: SchedulerCallback | null;
  priority: SchedulerPriority;
  startTime: number;
  expirationTime: number;
  sortIndex: number;
}

export interface SchedulerHost {
  now(): number;
  scheduleHostCallback(callback: () => void): unknown;
  scheduleHostTimeout(callback: () => void, ms: number): unknown;
  cancelHostTimeout(id: unknown): void;
  isInputPending?(): boolean;
}

const maxSigned31BitInt = 1073741823;
const defaultFrameInterval = 5;
const priorityTimeouts: Record<SchedulerPriority, number> = {
  immediate: -1,
  "user-blocking": 250,
  normal: 5000,
  low: 10000,
  idle: maxSigned31BitInt,
};

let taskIdCounter = 1;
let taskQueue: SchedulerTask[] = [];
let timerQueue: SchedulerTask[] = [];
let currentTask: SchedulerTask | null = null;
let isPerformingWork = false;
let isHostCallbackScheduled = false;
let isHostTimeoutScheduled = false;
let isMessageLoopRunning = false;
let taskTimeoutId: unknown;
let frameInterval = defaultFrameInterval;
let startTime = -1;
let needsPaint = false;
let testHost: SchedulerHost | undefined;

export function scheduleCallback(
  priority: SchedulerPriority,
  callback: SchedulerCallback,
  options?: { delay?: number },
): SchedulerTask {
  const currentTime = now();
  const delay = options?.delay;
  const start =
    typeof delay === "number" && delay > 0 ? currentTime + delay : currentTime;
  const timeout = priorityTimeouts[priority];
  const expirationTime = start + timeout;
  const task: SchedulerTask = {
    id: taskIdCounter,
    callback,
    priority,
    startTime: start,
    expirationTime,
    sortIndex: start > currentTime ? start : expirationTime,
  };
  taskIdCounter += 1;

  if (start > currentTime) {
    timerQueue.push(task);
    sortQueue(timerQueue);
    if (taskQueue.length === 0 && timerQueue[0] === task) {
      if (isHostTimeoutScheduled) {
        getHost().cancelHostTimeout(taskTimeoutId);
      }
      isHostTimeoutScheduled = true;
      taskTimeoutId = getHost().scheduleHostTimeout(
        handleTimeout,
        start - currentTime,
      );
    }
  } else {
    taskQueue.push(task);
    sortQueue(taskQueue);
    requestHostCallbackIfNeeded();
  }

  return task;
}

export function cancelCallback(task: SchedulerTask): void {
  task.callback = null;
}

export function getFirstCallbackNode(): SchedulerTask | null {
  return peek(taskQueue);
}

export function shouldYieldToHost(): boolean {
  if (startTime < 0) {
    return false;
  }

  if (needsPaint) {
    return true;
  }

  if (getHost().isInputPending?.() === true) {
    return true;
  }

  return now() - startTime >= frameInterval;
}

export function requestPaint(): void {
  needsPaint = true;
}

export function forceFrameRate(fps: number): void {
  if (fps < 0 || fps > 125) {
    return;
  }

  frameInterval = fps > 0 ? Math.floor(1000 / fps) : defaultFrameInterval;
}

export function now(): number {
  return getHost().now();
}

export function setSchedulerHostForTesting(
  host: SchedulerHost | undefined,
): void {
  testHost = host;
  resetSchedulerState();
}

function flushWork(initialTime: number): boolean {
  isHostCallbackScheduled = false;

  if (isHostTimeoutScheduled) {
    isHostTimeoutScheduled = false;
    getHost().cancelHostTimeout(taskTimeoutId);
  }

  isPerformingWork = true;

  try {
    return workLoop(initialTime);
  } finally {
    currentTask = null;
    isPerformingWork = false;
  }
}

function workLoop(initialTime: number): boolean {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);

  while (currentTask !== null) {
    if (
      currentTask.expirationTime > currentTime &&
      shouldYieldToHost()
    ) {
      break;
    }

    const callback = currentTask.callback;

    if (typeof callback === "function") {
      currentTask.callback = null;
      const didTimeout = currentTask.expirationTime <= currentTime;
      const continuation = callback(didTimeout);
      currentTime = now();

      if (typeof continuation === "function") {
        currentTask.callback = continuation;
        advanceTimers(currentTime);
        return true;
      }

      if (currentTask === peek(taskQueue)) {
        taskQueue.shift();
      }
      advanceTimers(currentTime);
    } else {
      taskQueue.shift();
    }

    currentTask = peek(taskQueue);
  }

  if (currentTask !== null) {
    return true;
  }

  const firstTimer = peek(timerQueue);
  if (firstTimer !== null) {
    isHostTimeoutScheduled = true;
    taskTimeoutId = getHost().scheduleHostTimeout(
      handleTimeout,
      firstTimer.startTime - currentTime,
    );
  }

  return false;
}

function handleTimeout(): void {
  isHostTimeoutScheduled = false;
  advanceTimers(now());

  if (!isHostCallbackScheduled) {
    if (peek(taskQueue) !== null) {
      requestHostCallbackIfNeeded();
      return;
    }

    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      isHostTimeoutScheduled = true;
      taskTimeoutId = getHost().scheduleHostTimeout(
        handleTimeout,
        firstTimer.startTime - now(),
      );
    }
  }
}

function advanceTimers(currentTime: number): void {
  let timer = peek(timerQueue);

  while (timer !== null) {
    if (timer.callback === null) {
      timerQueue.shift();
    } else if (timer.startTime <= currentTime) {
      timerQueue.shift();
      timer.sortIndex = timer.expirationTime;
      taskQueue.push(timer);
      sortQueue(taskQueue);
    } else {
      return;
    }

    timer = peek(timerQueue);
  }
}

function requestHostCallbackIfNeeded(): void {
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback();
  }
}

function requestHostCallback(): void {
  if (isMessageLoopRunning) {
    return;
  }

  isMessageLoopRunning = true;
  getHost().scheduleHostCallback(performWorkUntilDeadline);
}

function performWorkUntilDeadline(): void {
  needsPaint = false;

  if (!isMessageLoopRunning) {
    return;
  }

  startTime = now();
  let hasMoreWork = true;

  try {
    hasMoreWork = flushWork(startTime);
  } finally {
    if (hasMoreWork) {
      getHost().scheduleHostCallback(performWorkUntilDeadline);
    } else {
      isMessageLoopRunning = false;
    }
  }
}

function peek(queue: SchedulerTask[]): SchedulerTask | null {
  return queue[0] ?? null;
}

function sortQueue(queue: SchedulerTask[]): void {
  queue.sort((left, right) => left.sortIndex - right.sortIndex || left.id - right.id);
}

function getHost(): SchedulerHost {
  return testHost ?? defaultHost;
}

function resetSchedulerState(): void {
  taskQueue = [];
  timerQueue = [];
  currentTask = null;
  isPerformingWork = false;
  isHostCallbackScheduled = false;
  isHostTimeoutScheduled = false;
  isMessageLoopRunning = false;
  taskTimeoutId = undefined;
  startTime = -1;
  needsPaint = false;
}

const defaultInputPendingChecker = createInputPendingChecker();
const defaultHost: SchedulerHost = {
  now() {
    if (
      typeof performance === "object" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }

    return Date.now();
  },
  scheduleHostCallback: createDefaultHostCallbackScheduler(),
  scheduleHostTimeout(callback, ms) {
    return setTimeout(callback, ms);
  },
  cancelHostTimeout(id) {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  },
  ...(defaultInputPendingChecker === undefined
    ? {}
    : { isInputPending: defaultInputPendingChecker }),
};

function createDefaultHostCallbackScheduler(): (
  callback: () => void,
) => unknown {
  const immediate = (globalThis as { setImmediate?: (callback: () => void) => unknown })
    .setImmediate;

  if (typeof immediate === "function") {
    return (callback) => immediate(callback);
  }

  if (typeof MessageChannel !== "undefined") {
    const channel = new MessageChannel();
    const callbacks: (() => void)[] = [];
    channel.port1.onmessage = () => {
      callbacks.shift()?.();
    };

    return (callback) => {
      callbacks.push(callback);
      channel.port2.postMessage(null);
      return callback;
    };
  }

  return (callback) => setTimeout(callback, 0);
}

function createInputPendingChecker(): (() => boolean) | undefined {
  const scheduling = (globalThis.navigator as
    | { scheduling?: { isInputPending?: () => boolean } }
    | undefined)?.scheduling;

  if (typeof scheduling?.isInputPending === "function") {
    return () => scheduling.isInputPending?.() === true;
  }

  return undefined;
}
