import { cell } from "./cell.js";
import { registerCleanup } from "./cleanup-scope.js";
import type { Cell, ReadonlyCell } from "./types.js";

/** Queue occupancy and loss since the last drain of one event observer. */
export interface EventResourceState {
  readonly queued: number;
  readonly dropped: number;
  readonly error?: unknown;
}

/** Events and loss since the last drain of one event observer. */
export interface EventResourceBatch<TEvent> {
  readonly events: readonly TEvent[];
  readonly dropped: number;
}

/** An independent bounded queue attached to a keyed event subscription. */
export interface EventResourceLease<TKey, TEvent> {
  readonly state: ReadonlyCell<EventResourceState>;
  drain(): EventResourceBatch<TEvent>;
  setKey(key: TKey): void;
  dispose(): void;
}

/** A factory that shares one upstream event subscription per active key. */
export interface EventResource<TKey, TEvent> {
  observe(key: TKey): EventResourceLease<TKey, TEvent>;
}

interface LeaseQueue<TEvent> {
  state: Cell<EventResourceState>;
  slots: Array<TEvent | undefined>;
  write: number;
  count: number;
  dropped: number;
  generation: number;
}

interface Binding<TEvent> {
  queue: LeaseQueue<TEvent>;
  generation: number;
  active: boolean;
}

interface Entry<TEvent> {
  active: boolean;
  dispose: (() => void) | undefined;
  leases: Set<Binding<TEvent>>;
}

const empty = { queued: 0, dropped: 0 } as const;

function sameKey<T>(left: T, right: T): boolean {
  return left === right || (left !== left && right !== right);
}

function clear<TEvent>(lease: LeaseQueue<TEvent>): void {
  lease.slots = [];
  lease.write = 0;
  lease.count = 0;
  lease.dropped = 0;
  lease.state.setValue(empty);
}

/** Creates a bounded event stream. Overflow evicts oldest events and reports their count. */
export function createEventResource<TKey, TEvent>(
  subscribe: (key: TKey, emit: (event: TEvent) => void) => () => void,
  options: { readonly capacity: number },
): EventResource<TKey, TEvent> {
  const capacity = options.capacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 0xffffffff) {
    throw new RangeError("Event resource capacity must be a positive array length");
  }
  const entries = new Map<TKey, Entry<TEvent>>();

  function attach(key: TKey, binding: Binding<TEvent>): Entry<TEvent> {
    let entry = entries.get(key);
    if (entry !== undefined) {
      entry.leases.add(binding);
      return entry;
    }

    entry = { active: true, dispose: undefined, leases: new Set([binding]) };
    entries.set(key, entry);
    const current = entry;
    try {
      current.dispose = subscribe(key, (event) => {
        if (!current.active) return;
        for (const connection of current.leases) {
          const observer = connection.queue;
          if (!connection.active || connection.generation !== observer.generation) continue;
          observer.slots[observer.write] = event;
          observer.write = (observer.write + 1) % capacity;
          if (observer.count < capacity) observer.count += 1;
          else observer.dropped += 1;
          observer.state.setValue({ queued: observer.count, dropped: observer.dropped });
        }
      });
    } catch (error) {
      current.active = false;
      if (entries.get(key) === current) entries.delete(key);
      for (const connection of current.leases) {
        connection.active = false;
        if (connection.generation === connection.queue.generation) {
          clear(connection.queue);
          connection.queue.state.setValue({ queued: 0, dropped: 0, error });
        }
      }
      current.leases.clear();
      throw error;
    }
    return current;
  }

  function release(key: TKey, entry: Entry<TEvent>, binding: Binding<TEvent>): void {
    binding.active = false;
    entry.leases.delete(binding);
    if (entry.leases.size !== 0) return;
    entry.active = false;
    if (entries.get(key) === entry) entries.delete(key);
    entry.dispose?.();
  }

  return {
    observe(key) {
      const queue: LeaseQueue<TEvent> = {
        state: cell<EventResourceState>(empty),
        slots: [],
        write: 0,
        count: 0,
        dropped: 0,
        generation: 0,
      };
      const readonlyState: ReadonlyCell<EventResourceState> = { get: () => queue.state.get() };
      let currentKey = key;
      let currentBinding: Binding<TEvent> = { queue, generation: ++queue.generation, active: true };
      let currentEntry: Entry<TEvent> | undefined = attach(key, currentBinding);
      let disposed = false;
      let keyChangeRevision = 0;
      let unregister: (() => void) | undefined;

      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        const currentUnregister = unregister;
        unregister = undefined;
        currentUnregister?.();
        const previous = currentEntry;
        currentEntry = undefined;
        ++queue.generation;
        clear(queue);
        if (previous !== undefined) release(currentKey, previous, currentBinding);
      };

      const registration = registerCleanup(dispose);
      if (disposed) registration?.();
      else unregister = registration;

      return {
        state: readonlyState,
        drain() {
          const events: TEvent[] = [];
          for (let index = 0; index < queue.count; index += 1) {
            const slot = (queue.write - queue.count + index + capacity) % capacity;
            events.push(queue.slots[slot] as TEvent);
          }
          const dropped = queue.dropped;
          if (queue.count !== 0 || dropped !== 0) {
            queue.write = 0;
            queue.count = 0;
            queue.dropped = 0;
            queue.slots = [];
            queue.state.setValue(empty);
          }
          return { events, dropped };
        },
        setKey(nextKey) {
          if (disposed || (currentEntry?.active === true && sameKey(currentKey, nextKey))) return;
          const revision = ++keyChangeRevision;
          const previous = currentEntry;
          currentEntry = undefined;
          ++queue.generation;
          clear(queue);
          if (previous !== undefined) release(currentKey, previous, currentBinding);
          if (disposed || revision !== keyChangeRevision) return;
          currentKey = nextKey;
          const nextBinding: Binding<TEvent> = { queue, generation: ++queue.generation, active: true };
          currentBinding = nextBinding;
          const nextEntry = attach(nextKey, nextBinding);
          if (disposed || revision !== keyChangeRevision) {
            release(nextKey, nextEntry, nextBinding);
            return;
          }
          currentEntry = nextEntry;
        },
        dispose,
      };
    },
  };
}
