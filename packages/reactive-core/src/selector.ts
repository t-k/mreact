import { effect } from "./effect.js";
import { notifySubscribers, trackSource } from "./tracking.js";
import { untrack } from "./untrack.js";
import type { Source } from "./state.js";
import type { ReadonlyCell } from "./types.js";

/** Equality function used by selector keys. */
export type SelectorEquality<TValue, TKey> = (value: TValue, key: TKey) => boolean;

/** A keyed boolean selector with an explicit disposer for the source subscription. */
export interface Selector<TValue, TKey = TValue> {
  (key: TKey): boolean;
  dispose(): void;
}

interface SelectorSource<TKey> extends Source {
  key: TKey;
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

  const select = ((key: TKey): boolean => {
    let selectorSource = sources.get(key);

    if (selectorSource === undefined) {
      selectorSource = {
        key,
        onNoSubscribers() {
          if (selectorSource?.subscribers === null) {
            sources.delete(key);
          }
        },
        selected: equals(current, key) === true,
        subscribers: null,
      };
      sources.set(key, selectorSource);
    }

    trackSource(selectorSource);
    return selectorSource.selected;
  }) as Selector<TValue, TKey>;

  select.dispose = () => {
    disposeSourceEffect();
    sources.clear();
  };

  return select;
}

function defaultSelectorEquality<TValue, TKey>(value: TValue, key: TKey): boolean {
  return Object.is(value, key);
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
  notifySubscribers(selectorSource);
}
