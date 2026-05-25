import { createStreamingBufferSink } from "./buffer-sink.js";
import type { StreamRender } from "./sink.js";

export interface RenderToReadableStreamOptions {
  logAbortedDeferredErrors?: boolean;
}

const streamQueuedChunkSoftLimitBytes = 1024 * 1024;

export function renderToReadableStream(
  render: StreamRender,
  options: RenderToReadableStreamOptions = {},
): ReadableStream<Uint8Array> {
  // Issue 084: append calls go into a coalescing Node Buffer sink. The
  // previous implementation called `controller.enqueue(encoder.encode(chunk))`
  // per `sink.append` - one TextEncoder allocation + one WHATWG queue trip
  // per call. Now we emit one chunk per flush boundary:
  //   1. After the sync portion of `render` returns - the "shell"
  //      pre-flush. Done synchronously so it lands before any deferred
  //      task body fires in a microtask.
  //   2. Whenever the accumulated buffer crosses the flushThreshold
  //      mid-render (e.g. a single very large list rendering).
  //   3. Each `sink.append` made during the deferred phase flushes
  //      immediately - gives each OOB fragment its own HTTP chunk so
  //      the browser can swap it in as soon as it arrives.
  //   4. End of stream - any tail bytes.
  const abortController = new AbortController();
  const queuedChunks: Uint8Array[] = [];
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  let cancelled = false;
  let complete = false;
  let queuedBytes = 0;
  let warnedQueuedBytes = false;
  let backpressurePromise: Promise<void> | undefined;
  let resolveBackpressure: (() => void) | undefined;

  const enqueueOrQueue = (buffer: Uint8Array) => {
    if (cancelled || abortController.signal.aborted) {
      return;
    }

    const controller = controllerRef;
    if (controller === undefined) {
      queueChunk(buffer);
      return;
    }

    if (queuedChunks.length === 0 && (controller.desiredSize ?? 0) > 0) {
      controller.enqueue(buffer);
      resolveBackpressureIfReady();
      return;
    }

    queueChunk(buffer);
  };
  const drainQueuedChunks = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    while (!cancelled && queuedChunks.length > 0 && (controller.desiredSize ?? 0) > 0) {
      const chunk = queuedChunks.shift();
      if (chunk !== undefined) {
        queuedBytes -= chunk.byteLength;
        controller.enqueue(chunk);
      }
    }

    if (!cancelled && complete && queuedChunks.length === 0) {
      controller.close();
    }

    resolveBackpressureIfReady();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const sink = createStreamingBufferSink({
        onFlush(buffer) {
          enqueueOrQueue(buffer);
        },
      });
      const deferredTasks: PromiseLike<void>[] = [];
      let inDeferredPhase = false;
      let renderResult: void | PromiseLike<void>;

      try {
        renderResult = render({
          append(chunk) {
            if (abortController.signal.aborted) {
              return;
            }
            sink.append(chunk);
            if (inDeferredPhase) {
              // OOB pattern: each deferred task ends with exactly one
              // `sink.append("<template ...>...")`. Flushing here
              // promotes that single append to its own chunk so the
              // browser's MutationObserver can apply it without
              // waiting for other deferred fragments.
              sink.flush();
            }
          },
          backpressure() {
            return waitForBackpressure();
          },
          defer(task) {
            deferredTasks.push(ignoreAfterAbort(task, abortController.signal, options));
          },
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        controller.error(error);
        return;
      }

      // Shell pre-flush - synchronous, BEFORE we yield to microtasks.
      // If we awaited render first the deferred tasks' bodies would
      // already have appended their bytes to the same buffer and we
      // would emit one merged chunk.
      sink.flush();

      void continueAfterShell();

      async function continueAfterShell(): Promise<void> {
        try {
          if (renderResult !== undefined && renderResult !== null) {
            await raceAbort(renderResult, abortController.signal);
            // Async render may have written more before its tail returned.
            // That tail is also "shell" - flush it before entering the
            // deferred phase.
            sink.flush();
          }

          inDeferredPhase = true;
          await raceAbort(Promise.all(deferredTasks), abortController.signal);
          // Tail flush in case the render closure (or a deferred task)
          // somehow left bytes in the buffer past the per-append flushes.
          sink.flush();
          complete = true;
          drainQueuedChunks(controller);
        } catch (error) {
          if (abortController.signal.aborted) {
            return;
          }
          controller.error(error);
        }
      }
    },
    pull(controller) {
      drainQueuedChunks(controller);
      resolveBackpressureAfterPull();
    },
    cancel(reason) {
      cancelled = true;
      queuedChunks.length = 0;
      queuedBytes = 0;
      abortController.abort(reason);
      resolveBackpressureIfReady();
    },
  });

  function hasBackpressure(): boolean {
    if (cancelled || abortController.signal.aborted) {
      return false;
    }

    if (queuedChunks.length > 0) {
      return true;
    }

    const controller = controllerRef;
    return controller !== undefined && (controller.desiredSize ?? 0) <= 0;
  }

  function waitForBackpressure(): Promise<void> {
    if (!hasBackpressure()) {
      return Promise.resolve();
    }

    if (backpressurePromise === undefined) {
      backpressurePromise = new Promise<void>((resolve) => {
        resolveBackpressure = resolve;
      });
    }

    return backpressurePromise;
  }

  function resolveBackpressureIfReady(): void {
    if (resolveBackpressure === undefined || hasBackpressure()) {
      return;
    }

    resolveBackpressureWaiter();
  }

  function resolveBackpressureAfterPull(): void {
    if (
      resolveBackpressure === undefined ||
      queuedChunks.length > 0 ||
      cancelled ||
      abortController.signal.aborted
    ) {
      return;
    }

    resolveBackpressureWaiter();
  }

  function resolveBackpressureWaiter(): void {
    const resolve = resolveBackpressure;
    if (resolve === undefined) {
      return;
    }

    backpressurePromise = undefined;
    resolveBackpressure = undefined;
    resolve();
  }

  function queueChunk(buffer: Uint8Array): void {
    queuedChunks.push(buffer);
    queuedBytes += buffer.byteLength;

    if (
      !warnedQueuedBytes &&
      queuedBytes > streamQueuedChunkSoftLimitBytes &&
      shouldWarnAboutQueuedStreamBytes()
    ) {
      warnedQueuedBytes = true;
      console.warn(
        `[mreact] renderToReadableStream queued ${queuedBytes} bytes because the downstream reader is slower than the renderer.`,
      );
    }
  }
}

function shouldWarnAboutQueuedStreamBytes(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env !== undefined &&
    process.env.NODE_ENV !== "production"
  );
}

async function raceAbort<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) {
    return undefined;
  }

  return Promise.race([
    task,
    new Promise<undefined>((resolve) => {
      signal.addEventListener("abort", () => resolve(undefined), { once: true });
    }),
  ]);
}

function ignoreAfterAbort(
  task: PromiseLike<void>,
  signal: AbortSignal,
  options: RenderToReadableStreamOptions,
): Promise<void> {
  return Promise.resolve(task).catch((error) => {
    if (!signal.aborted) {
      throw error;
    }

    if (options.logAbortedDeferredErrors === true && process.env.NODE_ENV !== "production") {
      console.warn("[mreact] ignored deferred task error after abort:", error);
    }
  });
}
