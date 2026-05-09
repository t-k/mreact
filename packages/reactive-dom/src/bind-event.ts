import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export function bindEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): Dispose {
  const listener = (event: Event) => {
    handler(event as HTMLElementEventMap[K]);
  };

  element.addEventListener(type, listener);

  return registerDispose(() => {
    element.removeEventListener(type, listener);
  });
}
