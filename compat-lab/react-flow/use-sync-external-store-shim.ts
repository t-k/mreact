import { useRef, useSyncExternalStore } from "react";

export { useSyncExternalStore };

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (left: Selection, right: Selection) => boolean,
): Selection {
  const selectedRef = useRef<{
    snapshot: Snapshot;
    selection: Selection;
  } | undefined>(undefined);
  const getSelection = () => {
    const snapshot = getSnapshot();
    const previous = selectedRef.current;
    const selection = selector(snapshot);

    if (previous !== undefined) {
      if (Object.is(previous.snapshot, snapshot)) {
        return previous.selection;
      }

      if (isEqual?.(previous.selection, selection) === true) {
        selectedRef.current = { snapshot, selection: previous.selection };
        return previous.selection;
      }
    }

    selectedRef.current = { snapshot, selection };
    return selection;
  };
  const getServerSelection =
    getServerSnapshot === undefined || getServerSnapshot === null
      ? undefined
      : () => selector(getServerSnapshot());

  return useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection,
  );
}

export default {
  useSyncExternalStore,
  useSyncExternalStoreWithSelector,
};
