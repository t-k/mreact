import type { ReadonlyCell } from "./types.js";

export type { Cell, ReadonlyCell } from "./types.js";
export { cell } from "./cell.js";

export function computed<T>(_fn: () => T): ReadonlyCell<T> {
  throw new Error("computed is not implemented yet");
}

export function effect(_fn: () => void | (() => void)): () => void {
  throw new Error("effect is not implemented yet");
}

export function batch<T>(_fn: () => T): T {
  throw new Error("batch is not implemented yet");
}

export function untrack<T>(_fn: () => T): T {
  throw new Error("untrack is not implemented yet");
}
