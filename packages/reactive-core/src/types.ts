/** Reactive value that can be read and tracked as a dependency. */
export interface ReadonlyCell<T> {
  get(): T;
}

/** Mutable reactive value that notifies dependents when changed. */
export interface Cell<T> extends ReadonlyCell<T> {
  set(value: T | ((prev: T) => T)): void;
  /** Writes a value literally, including when T itself is a function. */
  setValue(value: T): void;
  /** Applies an updater function to the current value. */
  update(updater: (prev: T) => T): void;
}
