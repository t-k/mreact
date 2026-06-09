/** Reactive value that can be read and tracked as a dependency. */
export interface ReadonlyCell<T> {
  get(): T;
}

/** Mutable reactive value that notifies dependents when changed. */
export interface Cell<T> extends ReadonlyCell<T> {
  set(value: T | ((prev: T) => T)): void;
}
