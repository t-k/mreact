import { effect } from "./effect.js";
import { notifySubscribers, trackSource } from "./tracking.js";
import { untrack } from "./untrack.js";
import type { Source } from "./state.js";
import type { ReadonlyCell } from "./types.js";

/** Equality function used by selector keys. */
export type SelectorEquality<TValue, TKey> = (value: TValue, key: TKey) => boolean;
type SelectorCallback = (selected: boolean) => void;
type SelectorCallbacks = SelectorCallback | Set<SelectorCallback>;

/** A keyed boolean selector with an explicit disposer for the source subscription. */
export interface Selector<TValue, TKey = TValue> {
  (key: TKey): boolean;
  subscribe(key: TKey, listener: (selected: boolean) => void): () => void;
  dispose(): void;
}

interface SelectorSource<TKey> extends Source {
  callbacks?: SelectorCallbacks | undefined;
  key: TKey;
  owner: Map<TKey, SelectorSource<TKey>>;
  selected: boolean;
}

/** Creates keyed boolean cells that update only for the previous and next selected keys. */
export function selector<TValue, TKey = TValue>(
  source: ReadonlyCell<TValue>,
  options?: { equals?: SelectorEquality<TValue, TKey> | undefined },
): Selector<TValue, TKey> {
  const usesDefaultEquality = options?.equals === undefined;
  const equals = options?.equals ?? defaultSelectorEquality<TValue, TKey>;
  const sources = new Map<TKey, SelectorSource<TKey>>();
  let current = untrack(() => source.get());

  const disposeSourceEffect = effect(() => {
    const next = source.get();

    if (Object.is(current, next)) {
      return;
    }

    const previous = current;
    current = next;

    if (usesDefaultEquality) {
      updateSelectorSource(sources.get(previous as unknown as TKey), false);
      updateSelectorSource(sources.get(next as unknown as TKey), true);
      return;
    }

    for (const selectorSource of sources.values()) {
      const nextSelected =
        equals(next, selectorSource.key) === true;

      updateSelectorSource(selectorSource, nextSelected);
    }
  });

  function getOrCreateSelectorSource(key: TKey): SelectorSource<TKey> {
    let selectorSource = sources.get(key);

    if (selectorSource === undefined) {
      selectorSource = {
        key,
        onNoSubscribers: cleanupSelectorSource,
        owner: sources,
        selected: equals(current, key) === true,
        subscribers: null,
      };
      sources.set(key, selectorSource);
    }

    return selectorSource;
  }

  const select = ((key: TKey): boolean => {
    const selectorSource = getOrCreateSelectorSource(key);

    trackSource(selectorSource);
    return selectorSource.selected;
  }) as Selector<TValue, TKey>;

  select.subscribe = (key, listener) => {
    const selectorSource = getOrCreateSelectorSource(key);
    const callbacks = selectorSource.callbacks;

    if (callbacks === undefined) {
      selectorSource.callbacks = listener;
    } else if (typeof callbacks === "function") {
      if (callbacks !== listener) {
        selectorSource.callbacks = new Set([callbacks, listener]);
      }
    } else {
      callbacks.add(listener);
    }

    return () => {
      const currentCallbacks = selectorSource.callbacks;

      if (currentCallbacks === listener) {
        selectorSource.callbacks = undefined;
      } else if (currentCallbacks instanceof Set) {
        currentCallbacks.delete(listener);

        if (currentCallbacks.size === 0) {
          selectorSource.callbacks = undefined;
        }
      }

      cleanupSelectorSource.call(selectorSource);
    };
  };

  select.dispose = () => {
    disposeSourceEffect();
    sources.clear();
  };

  return select;
}

function defaultSelectorEquality<TValue, TKey>(value: TValue, key: TKey): boolean {
  return Object.is(value, key);
}

function cleanupSelectorSource<TKey>(this: SelectorSource<TKey>): void {
  if (this.subscribers === null && this.callbacks === undefined) {
    this.owner.delete(this.key);
  }
}

function updateSelectorSource<TKey>(
  selectorSource: SelectorSource<TKey> | undefined,
  selected: boolean,
): void {
  if (
    selectorSource === undefined ||
    selectorSource.selected === selected
  ) {
    return;
  }

  selectorSource.selected = selected;
  const callbacks = selectorSource.callbacks;

  if (typeof callbacks === "function") {
    callbacks(selected);
  } else if (callbacks !== undefined) {
    for (const callback of callbacks) {
      callback(selected);
    }
  }

  notifySubscribers(selectorSource);
}
