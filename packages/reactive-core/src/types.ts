export interface ReadonlyCell<T> {
  get(): T;
}

export interface Cell<T> extends ReadonlyCell<T> {
  set(value: T | ((prev: T) => T)): void;
}
