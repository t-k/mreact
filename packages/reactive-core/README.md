# @reckona/mreact-reactive-core

`@reckona/mreact-reactive-core` provides the fine-grained reactive primitives
used across mreact. It is independent from the DOM and can be used by stores,
forms, query observers, and compiled runtime code.

## Basic Usage

```ts
import { cell, computed, effect } from "@reckona/mreact-reactive-core";

const count = cell(0);
const doubled = computed(() => count.get() * 2);

const dispose = effect(() => {
  console.log(doubled.get());
});

count.set(1);
dispose();
```

## Core APIs

- `cell()` creates a writable reactive value.
- `computed()` creates a derived readonly value.
- `effect()` runs side effects when dependencies change.
- `batch()` groups updates into one flush.
- `untrack()` reads values without subscribing.

## Testing

`@reckona/mreact-reactive-core/testing` exports `flushMicrotasks()` and
`flushEffects()` for deterministic tests.
