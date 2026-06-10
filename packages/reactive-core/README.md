# @reckona/mreact-reactive-core

`@reckona/mreact-reactive-core` provides the fine-grained reactive primitives
used across mreact. It is independent from the DOM and can be used by stores,
forms, query observers, and compiled runtime code.

## Basic Usage

```ts
import { batchAsync, cell, computed, effect } from "@reckona/mreact-reactive-core";

const count = cell(0);
const doubled = computed(() => count.get() * 2);
const selected = computed(() => ({ parity: count.get() % 2 }), {
  equals: (previous, next) => previous.parity === next.parity,
});

const dispose = effect(() => {
  console.log(doubled.get());
});

await batchAsync(async () => {
  count.set(1);
  await Promise.resolve();
  count.set(2);
});

selected.get();
dispose();
```

## Core APIs

- `cell()` creates a writable reactive value.
- `computed()` creates a derived readonly value. Pass `{ equals }` or an equality function as the second argument to skip downstream notifications for equivalent results.
- `effect()` runs side effects when dependencies change.
- `batch()` groups updates into one flush.
- `batchAsync()` groups updates across `await` points into one flush. Use it only around intentionally scoped async work because reactive flushes are deferred until the callback settles.
- `untrack()` reads values without subscribing.

## Update Scheduling

`cell.set()` updates the stored value immediately and propagates `computed` invalidation synchronously, but effects (including the DOM bindings emitted by the compiler) run in a single microtask scheduled at the first update. Reads through `.get()` always observe the latest value even before that flush runs.

Because browsers drain the microtask queue before any rendering steps, this scheduling is compatible with `document.startViewTransition()`: a `cell.set()` made inside the update callback is committed to the DOM before the browser captures the new-state snapshot, so no `flushSync` wrapper is required.

```ts
document.startViewTransition(() => {
  selectedMediaId.set(mediaId);
});
```

If you need the DOM committed synchronously before the current task continues, for example to measure layout right after an update, wrap the update in `flushSync` from the React DOM-compatible entrypoint (`react-dom` in mreact apps, `@reckona/mreact-dom` standalone), which drains pending reactive computations before returning. Updates deferred through `startTransition` or `useDeferredValue` run on a macrotask scheduler and are not guaranteed to land inside a view transition capture.

`batchAsync()` keeps effect flushing suspended for the full callback, including every awaited step, then releases the queued work once when the callback resolves or rejects. Use it for short transaction-style updates where intermediate effects would be misleading; avoid wrapping long I/O or user interaction flows because observers will not see effects until the batch finishes, even though direct `.get()` reads still see the latest cell values.

## Testing

`@reckona/mreact-reactive-core/testing` exports `flushMicrotasks()` and
`flushEffects()` for deterministic tests.
