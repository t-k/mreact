import type { Selector } from "@reckona/mreact-reactive-core";
import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export interface BindSelectorClassOptions {
  preserveInitial?: boolean;
}

export function bindSelectorClass<TValue, TKey>(
  element: Element,
  className: string,
  selector: Selector<TValue, TKey>,
  key: TKey,
  options?: BindSelectorClassOptions,
): Dispose {
  const initial = selector(key);
  let previous = options?.preserveInitial === true ? initial : undefined;

  const apply = (selected: boolean): void => {
    if (previous === selected) {
      return;
    }

    previous = selected;

    if (selected) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  };

  apply(initial);

  return registerDispose(selector.subscribe(key, apply));
}
