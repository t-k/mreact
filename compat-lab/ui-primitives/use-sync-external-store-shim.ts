import { useRef, useSyncExternalStore } from "react";

export { useSyncExternalStore };

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (left: Selection, right: Selection) => boolean,
): Selection {
  const selectedRef = useRef<Selection | undefined>(undefined);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getSnapshot(),
    getServerSnapshot === undefined || getServerSnapshot === null
      ? undefined
      : () => getServerSnapshot(),
  );
  const selected = selector(snapshot);
  const previous = selectedRef.current;

  if (previous === undefined || isEqual?.(previous, selected) !== true) {
    selectedRef.current = selected;
    return selected;
  }

  return previous;
}
