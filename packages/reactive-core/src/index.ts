import type { ReadonlyCell } from "./types.js";

export type { Cell, ReadonlyCell } from "./types.js";
export { batch } from "./batch.js";
export { cell } from "./cell.js";
export { effect } from "./effect.js";

export function computed<T>(_fn: () => T): ReadonlyCell<T> {
  throw new Error("computed is not implemented yet");
}

export function untrack<T>(_fn: () => T): T {
  throw new Error("untrack is not implemented yet");
}
