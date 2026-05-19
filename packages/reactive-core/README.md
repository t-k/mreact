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

## Testing

`@reckona/mreact-reactive-core/testing` exports `flushMicrotasks()` and
`flushEffects()` for deterministic tests.
