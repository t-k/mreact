import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCleanupScope, createEventResource, effect, runWithCleanupScope } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("createEventResource", () => {
  it("shares a connection while each observer drains every event in order", () => {
    let emit!: (event: number) => void;
    let connections = 0;
    let disconnections = 0;
    const resource = createEventResource<string, number>((_key, next) => {
      emit = next;
      connections += 1;
      return () => { disconnections += 1; };
    }, { capacity: 4 });
    const first = resource.observe("a");
    const second = resource.observe("a");
    emit(1);
    emit(2);

    expect(connections).toBe(1);
    expect(first.state.get()).toEqual({ queued: 2, dropped: 0 });
    expect(second.state.get()).toEqual({ queued: 2, dropped: 0 });
    expect(first.drain()).toEqual({ events: [1, 2], dropped: 0 });
    expect(second.drain()).toEqual({ events: [1, 2], dropped: 0 });
    expect(first.state.get()).toEqual({ queued: 0, dropped: 0 });
    first.dispose();
    expect(disconnections).toBe(0);
    second.dispose();
    expect(disconnections).toBe(1);
  });

  it("does not replay events from before a new observer joined", () => {
    let emit!: (event: number) => void;
    const resource = createEventResource<string, number>((_key, next) => {
      emit = next;
      return () => {};
    }, { capacity: 3 });
    const first = resource.observe("a");
    emit(1);
    const second = resource.observe("a");
    emit(2);
    expect(first.drain().events).toEqual([1, 2]);
    expect(second.drain().events).toEqual([2]);
    first.dispose();
    second.dispose();
  });

  it("keeps each observer's overflow accounting independent", () => {
    let emit!: (event: number) => void;
    const resource = createEventResource<string, number>((_key, next) => {
      emit = next;
      return () => {};
    }, { capacity: 2 });
    const fast = resource.observe("a");
    const slow = resource.observe("a");
    emit(1);
    emit(2);
    expect(fast.drain()).toEqual({ events: [1, 2], dropped: 0 });
    emit(3);
    emit(4);
    expect(fast.drain()).toEqual({ events: [3, 4], dropped: 0 });
    expect(slow.drain()).toEqual({ events: [3, 4], dropped: 2 });
    fast.dispose();
    slow.dispose();
  });

  it("evicts the oldest events at capacity and reports every loss", () => {
    let emit!: (event: number) => void;
    const resource = createEventResource<string, number>((_key, next) => {
      emit = next;
      return () => {};
    }, { capacity: 2 });
    const lease = resource.observe("a");
    for (const event of [1, 2, 3, 4]) emit(event);
    expect(lease.state.get()).toEqual({ queued: 2, dropped: 2 });
    expect(lease.drain()).toEqual({ events: [3, 4], dropped: 2 });
    expect(lease.drain()).toEqual({ events: [], dropped: 0 });
    emit(5);
    expect(lease.drain()).toEqual({ events: [5], dropped: 0 });
    lease.dispose();
  });

  it("matches a bounded FIFO model across short event and drain traces", () => {
    const action = fc.oneof(
      fc.integer({ min: -2, max: 2 }).map((value) => ({ type: "emit" as const, value })),
      fc.constant({ type: "drain" as const }),
    );
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5 }),
      fc.array(action, { minLength: 1, maxLength: 30 }),
      (capacity, actions) => {
        let emit!: (event: number) => void;
        const resource = createEventResource<string, number>((_key, next) => {
          emit = next;
          return () => {};
        }, { capacity });
        const lease = resource.observe("a");
        const expected: number[] = [];
        let dropped = 0;
        for (const item of actions) {
          if (item.type === "emit") {
            if (expected.length === capacity) {
              expected.shift();
              dropped += 1;
            }
            expected.push(item.value);
            emit(item.value);
          } else {
            expect(lease.drain()).toEqual({ events: expected, dropped });
            expected.length = 0;
            dropped = 0;
          }
          expect(lease.state.get()).toEqual({ queued: expected.length, dropped });
        }
        expect(lease.drain()).toEqual({ events: expected, dropped });
        lease.dispose();
      },
    ), { numRuns: 100 });
  });

  it("notifies reactive consumers of queued events and overflow", async () => {
    let emit!: (event: number) => void;
    const resource = createEventResource<string, number>((_key, next) => {
      emit = next;
      return () => {};
    }, { capacity: 1 });
    const lease = resource.observe("a");
    const seen: Array<{ queued: number; dropped: number }> = [];
    const stop = effect(() => { seen.push(lease.state.get()); });
    emit(1);
    await flushEffects();
    emit(2);
    await flushEffects();
    expect(seen).toEqual([
      { queued: 0, dropped: 0 },
      { queued: 1, dropped: 0 },
      { queued: 1, dropped: 1 },
    ]);
    stop();
    lease.dispose();
  });

  it("clears the old queue before switching keys and ignores late emissions", () => {
    const emitters = new Map<string, (event: number) => void>();
    const lifecycle: string[] = [];
    const resource = createEventResource<string, number>((key, emit) => {
      lifecycle.push(`connect:${key}`);
      emitters.set(key, emit);
      return () => { lifecycle.push(`disconnect:${key}`); };
    }, { capacity: 2 });
    const lease = resource.observe("a");
    const oldEmit = emitters.get("a")!;
    oldEmit(1);
    lease.setKey("b");
    oldEmit(2);
    emitters.get("b")?.(3);
    expect(lifecycle).toEqual(["connect:a", "disconnect:a", "connect:b"]);
    expect(lease.drain()).toEqual({ events: [3], dropped: 0 });
    lease.dispose();
  });

  it("does not attach an outer target after unsubscribe reenters a key change", () => {
    const emitters = new Map<string, (event: number) => void>();
    const lifecycle: string[] = [];
    let lease!: ReturnType<ReturnType<typeof createEventResource<string, number>>["observe"]>;
    const resource = createEventResource<string, number>((key, emit) => {
      lifecycle.push(`connect:${key}`);
      emitters.set(key, emit);
      return () => {
        lifecycle.push(`disconnect:${key}`);
        if (key === "a") lease.setKey("c");
      };
    }, { capacity: 2 });
    lease = resource.observe("a");

    lease.setKey("b");
    emitters.get("b")?.(1);
    emitters.get("c")?.(2);
    expect(lease.drain()).toEqual({ events: [2], dropped: 0 });
    lease.dispose();
    expect(lifecycle).toEqual(["connect:a", "disconnect:a", "connect:c", "disconnect:c"]);
  });

  it("releases an outer subscription when subscribe reenters a key change", () => {
    const emitters = new Map<string, (event: number) => void>();
    const lifecycle: string[] = [];
    let lease!: ReturnType<ReturnType<typeof createEventResource<string, number>>["observe"]>;
    const resource = createEventResource<string, number>((key, emit) => {
      lifecycle.push(`connect:${key}`);
      emitters.set(key, emit);
      if (key === "b") {
        emit(0);
        lease.setKey("c");
        emit(1);
      }
      if (key === "c") emit(2);
      return () => { lifecycle.push(`disconnect:${key}`); };
    }, { capacity: 2 });
    lease = resource.observe("a");

    lease.setKey("b");
    emitters.get("b")?.(3);
    expect(lease.drain()).toEqual({ events: [2], dropped: 0 });
    lease.dispose();
    expect(lifecycle).toEqual([
      "connect:a", "disconnect:a", "connect:b", "connect:c", "disconnect:b", "disconnect:c",
    ]);
  });

  it("disconnects a subscription that completes after its lease is disposed", () => {
    const lifecycle: string[] = [];
    let emitB!: (event: number) => void;
    let lease!: ReturnType<ReturnType<typeof createEventResource<string, number>>["observe"]>;
    const resource = createEventResource<string, number>((key, emit) => {
      lifecycle.push(`connect:${key}`);
      if (key === "b") {
        emitB = emit;
        lease.dispose();
        emit(1);
      }
      return () => { lifecycle.push(`disconnect:${key}`); };
    }, { capacity: 2 });
    lease = resource.observe("a");

    lease.setKey("b");
    emitB(2);
    expect(lease.drain()).toEqual({ events: [], dropped: 0 });
    expect(lifecycle).toEqual(["connect:a", "disconnect:a", "connect:b", "disconnect:b"]);
  });

  it("preserves a newer key when an older reentrant subscription throws", () => {
    const lifecycle: string[] = [];
    let emitC!: (event: number) => void;
    let lease!: ReturnType<ReturnType<typeof createEventResource<string, number>>["observe"]>;
    const resource = createEventResource<string, number>((key, emit) => {
      lifecycle.push(`connect:${key}`);
      if (key === "b") {
        lease.setKey("c");
        throw new Error("b failed");
      }
      if (key === "c") emitC = emit;
      return () => { lifecycle.push(`disconnect:${key}`); };
    }, { capacity: 2 });
    lease = resource.observe("a");

    expect(() => lease.setKey("b")).toThrow("b failed");
    emitC(3);
    expect(lease.drain()).toEqual({ events: [3], dropped: 0 });
    lease.dispose();
    expect(lifecycle).toEqual(["connect:a", "disconnect:a", "connect:b", "connect:c", "disconnect:c"]);
  });

  it("keeps a reentrant second observer connected when the first switches away", () => {
    const lifecycle: string[] = [];
    let emitB!: (event: number) => void;
    let first!: ReturnType<ReturnType<typeof createEventResource<string, number>>["observe"]>;
    let second!: typeof first;
    const resource = createEventResource<string, number>((key, emit) => {
      lifecycle.push(`connect:${key}`);
      if (key === "b") {
        emitB = emit;
        second = resource.observe("b");
        first.setKey("c");
      }
      return () => { lifecycle.push(`disconnect:${key}`); };
    }, { capacity: 2 });
    first = resource.observe("a");

    first.setKey("b");
    emitB(4);
    expect(first.drain()).toEqual({ events: [], dropped: 0 });
    expect(second.drain()).toEqual({ events: [4], dropped: 0 });
    first.dispose();
    second.dispose();
    expect(lifecycle).toEqual([
      "connect:a", "disconnect:a", "connect:b", "connect:c", "disconnect:c", "disconnect:b",
    ]);
  });

  it("retains values including undefined through a wrapped queue", () => {
    let emit!: (event: number | undefined) => void;
    const resource = createEventResource<string, number | undefined>((_key, next) => {
      emit = next;
      return () => {};
    }, { capacity: 3 });
    const lease = resource.observe("a");
    emit(1);
    expect(lease.drain()).toEqual({ events: [1], dropped: 0 });
    emit(undefined);
    emit(2);
    emit(3);
    emit(4);
    expect(lease.drain()).toEqual({ events: [2, 3, 4], dropped: 1 });
    lease.dispose();
  });

  it("lets one lease switch keys while another continues receiving the old key", () => {
    const emitters = new Map<string, (event: number) => void>();
    const resource = createEventResource<string, number>((key, emit) => {
      emitters.set(key, emit);
      return () => {};
    }, { capacity: 2 });
    const first = resource.observe("a");
    const second = resource.observe("a");
    first.setKey("b");
    emitters.get("a")?.(1);
    emitters.get("b")?.(2);
    expect(first.drain().events).toEqual([2]);
    expect(second.drain().events).toEqual([1]);
    first.dispose();
    second.dispose();
  });

  it("releases a lease with its cleanup scope and ignores its former emitter", () => {
    const scope = createCleanupScope();
    let emit!: (event: number) => void;
    let disconnections = 0;
    const resource = createEventResource<string, number>((_key, next) => {
      emit = next;
      return () => { disconnections += 1; };
    }, { capacity: 2 });
    const lease = runWithCleanupScope(scope, () => resource.observe("a"));
    emit(1);
    scope.dispose();
    emit(2);
    expect(disconnections).toBe(1);
    expect(lease.drain()).toEqual({ events: [], dropped: 0 });
    lease.setKey("b");
    expect(disconnections).toBe(1);
  });

  it("does not resubscribe for Map-equivalent keys or after disposal", () => {
    let connections = 0;
    let disconnections = 0;
    const resource = createEventResource<number, number>(() => {
      connections += 1;
      return () => { disconnections += 1; };
    }, { capacity: 1 });
    const lease = resource.observe(-0);
    lease.setKey(+0);
    lease.setKey(Number.NaN);
    lease.setKey(Number.NaN);
    lease.setKey(1);
    lease.dispose();
    lease.dispose();
    lease.setKey(2);
    expect(connections).toBe(3);
    expect(disconnections).toBe(3);
    expect(lease.state.get()).toEqual({ queued: 0, dropped: 0 });
  });

  it("accepts synchronous subscription events", () => {
    const resource = createEventResource<string, number>((_key, emit) => {
      emit(9);
      return () => {};
    }, { capacity: 1 });
    const lease = resource.observe("a");
    expect(lease.drain()).toEqual({ events: [9], dropped: 0 });
    lease.dispose();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x100000000])("rejects invalid capacity %s", (capacity) => {
    expect(() => createEventResource<string, number>(() => () => {}, { capacity })).toThrow(RangeError);
  });

  it("allows a later observer to retry after a failed subscription", () => {
    let attempts = 0;
    const resource = createEventResource<string, number>(() => {
      if (++attempts === 1) throw new Error("offline");
      return () => {};
    }, { capacity: 2 });
    expect(() => resource.observe("a")).toThrow("offline");
    const lease = resource.observe("a");
    expect(attempts).toBe(2);
    lease.dispose();
  });

  it("clears a reentrant observer when its initial subscription fails and lets it retry", () => {
    let joined!: ReturnType<ReturnType<typeof createEventResource<string, number>>["observe"]>;
    let emit!: (event: number) => void;
    let attempts = 0;
    const resource = createEventResource<string, number>((key, next) => {
      attempts += 1;
      if (attempts === 1) {
        joined = resource.observe(key);
        next(1);
        throw new Error("offline");
      }
      emit = next;
      return () => {};
    }, { capacity: 2 });
    expect(() => resource.observe("a")).toThrow("offline");
    expect(joined.drain()).toEqual({ events: [], dropped: 0 });
    expect(joined.state.get().error).toEqual(new Error("offline"));
    joined.setKey("a");
    expect(joined.state.get().error).toBeUndefined();
    emit(2);
    expect(joined.drain()).toEqual({ events: [2], dropped: 0 });
    joined.dispose();
  });

  it("clears its queue and permits retry if disconnect throws during a key change", () => {
    const resource = createEventResource<string, number>((key, emit) => {
      emit(1);
      return () => {
        if (key === "a") throw new Error("cleanup failed");
      };
    }, { capacity: 2 });
    const lease = resource.observe("a");
    expect(() => lease.setKey("b")).toThrow("cleanup failed");
    expect(lease.drain()).toEqual({ events: [], dropped: 0 });
    lease.setKey("b");
    expect(lease.drain()).toEqual({ events: [1], dropped: 0 });
    lease.dispose();
  });
});
