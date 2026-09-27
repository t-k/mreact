import { batch, cell, untrack, type Cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";

/** A keyed collection with independent row, order, and count dependencies. */
export interface Collection<TRow extends object, TKey> {
  readonly order: ReadonlyCell<readonly TKey[]>;
  readonly count: ReadonlyCell<number>;
  row(key: TKey): ReadonlyCell<TRow | undefined> | undefined;
  append(item: TRow): void;
  patch(key: TKey, values: Partial<TRow>): void;
  move(key: TKey, options: { before: TKey }): void;
  remove(key: TKey): void;
  toArray(): TRow[];
}

interface RowEntry<TRow extends object> {
  value: Cell<TRow | undefined>;
  readonlyValue: ReadonlyCell<TRow | undefined>;
}

function sameKey<TKey>(left: TKey, right: TKey): boolean {
  return left === right || (left !== left && right !== right);
}

function missingKey(): Error {
  return new Error("Collection key is missing");
}

/** Creates an opt-in keyed collection for plain row objects. */
export function createCollection<TRow extends object, TKey>(
  initial: Iterable<TRow>,
  options: { key: (item: TRow) => TKey },
): Collection<TRow, TKey> {
  const rows = new Map<TKey, RowEntry<TRow>>();
  let keys: TKey[] = [];

  function createEntry(item: TRow): RowEntry<TRow> {
    const value = cell<TRow | undefined>(item);
    return { value, readonlyValue: { get: () => value.get() } };
  }

  for (const item of initial) {
    const key = options.key(item);
    if (rows.has(key)) throw new Error("Duplicate collection key");
    rows.set(key, createEntry(item));
    keys.push(key);
  }

  const orderCell = cell<readonly TKey[]>(keys);
  const countCell = cell(keys.length);
  const order: ReadonlyCell<readonly TKey[]> = { get: () => orderCell.get() };
  const count: ReadonlyCell<number> = { get: () => countCell.get() };

  return {
    order,
    count,
    row(key) {
      return rows.get(key)?.readonlyValue;
    },
    append(item) {
      const key = options.key(item);
      if (rows.has(key)) throw new Error("Duplicate collection key");
      batch(() => {
        rows.set(key, createEntry(item));
        keys = [...keys, key];
        orderCell.setValue(keys);
        countCell.setValue(keys.length);
      });
    },
    patch(key, values) {
      const entry = rows.get(key);
      if (entry === undefined) throw missingKey();
      const previous = untrack(() => entry.value.get());
      if (previous === undefined) throw missingKey();
      const next = { ...previous, ...values } as TRow;
      if (!sameKey(options.key(next), key)) throw new Error("Collection key cannot be changed");
      entry.value.setValue(next);
    },
    move(key, { before }) {
      if (!rows.has(key) || !rows.has(before)) throw missingKey();
      if (sameKey(key, before)) return;
      const source = keys.findIndex((candidate) => sameKey(candidate, key));
      const target = keys.findIndex((candidate) => sameKey(candidate, before));
      if (source + 1 === target) return;
      const next = [...keys];
      next.splice(source, 1);
      const destination = next.findIndex((candidate) => sameKey(candidate, before));
      next.splice(destination, 0, key);
      keys = next;
      orderCell.setValue(keys);
    },
    remove(key) {
      const entry = rows.get(key);
      if (entry === undefined) throw missingKey();
      batch(() => {
        rows.delete(key);
        keys = keys.filter((candidate) => !sameKey(candidate, key));
        entry.value.setValue(undefined);
        orderCell.setValue(keys);
        countCell.setValue(keys.length);
      });
    },
    toArray() {
      return orderCell.get().map((key) => {
        const entry = rows.get(key);
        if (entry === undefined) throw missingKey();
        const item = entry.value.get();
        if (item === undefined) throw missingKey();
        return item;
      });
    },
  };
}
