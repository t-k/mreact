export interface ReadonlyCell<T> {
  get(): T;
}

export interface Cell<T> extends ReadonlyCell<T> {
  set(value: T | ((prev: T) => T)): void;
}

export function cell<T>(_initial: T): Cell<T> {
  throw new Error("cell is not implemented yet");
}

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
