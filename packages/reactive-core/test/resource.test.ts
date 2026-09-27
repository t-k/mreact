import { describe, expect, it } from "vitest";
import { createCleanupScope, createResource, effect, runWithCleanupScope } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("createResource", () => {
  it("shares one connection per key and disconnects after its last lease", () => {
    const callbacks = new Map<string, (value: number) => void>();
    const disconnected: string[] = [];
    const resource = createResource<string, number>((key, emit) => {
      callbacks.set(key, emit);
      return () => {
        disconnected.push(key);
        callbacks.delete(key);
      };
    });

    const first = resource.observe("a");
    const second = resource.observe("a");
    expect("set" in first.state).toBe(false);
    expect(callbacks.size).toBe(1);
    expect(first.state.get()).toEqual({ status: "pending" });
    callbacks.get("a")?.(42);
    expect(first.state.get()).toEqual({ status: "ready", value: 42 });
    expect(second.state.get()).toEqual({ status: "ready", value: 42 });

    first.dispose();
    first.dispose();
    expect(disconnected).toEqual([]);
    second.dispose();
    expect(disconnected).toEqual(["a"]);
  });

  it("replays the latest value to a later lease", () => {
    let emit!: (value: number) => void;
    let connections = 0;
    const resource = createResource<string, number>((_key, next) => {
      emit = next;
      connections += 1;
      return () => {};
    });
    const first = resource.observe("a");
    emit(7);
    const second = resource.observe("a");

    expect(second.state.get()).toEqual({ status: "ready", value: 7 });
    expect(connections).toBe(1);
    first.dispose();
    second.dispose();
  });

  it("notifies reactive dependents of updates", async () => {
    let emit!: (value: number) => void;
    const resource = createResource<string, number>((_key, next) => {
      emit = next;
      return () => {};
    });
    const lease = resource.observe("a");
    const seen: unknown[] = [];
    const stop = effect(() => {
      seen.push(lease.state.get());
    });

    emit(3);
    await flushEffects();
    expect(seen).toEqual([{ status: "pending" }, { status: "ready", value: 3 }]);
    stop();
    lease.dispose();
  });

  it("tears down the old key before subscribing to a new one and ignores late emissions", () => {
    const emitters = new Map<string, (value: number) => void>();
    const events: string[] = [];
    const resource = createResource<string, number>((key, emit) => {
      events.push(`connect:${key}`);
      emitters.set(key, emit);
      return () => events.push(`disconnect:${key}`);
    });
    const lease = resource.observe("a");
    const oldEmit = emitters.get("a")!;
    oldEmit(1);
    lease.setKey("b");
    expect(events).toEqual(["connect:a", "disconnect:a", "connect:b"]);
    expect(lease.state.get()).toEqual({ status: "pending" });
    oldEmit(9);
    expect(lease.state.get()).toEqual({ status: "pending" });
    emitters.get("b")?.(2);
    expect(lease.state.get()).toEqual({ status: "ready", value: 2 });
    lease.dispose();
  });

  it("keeps other leases connected when one lease changes key", () => {
    const emitters = new Map<string, (value: number) => void>();
    const disconnected: string[] = [];
    const resource = createResource<string, number>((key, emit) => {
      emitters.set(key, emit);
      return () => disconnected.push(key);
    });
    const first = resource.observe("a");
    const second = resource.observe("a");
    first.setKey("b");
    expect(disconnected).toEqual([]);
    emitters.get("a")?.(5);
    expect(second.state.get()).toEqual({ status: "ready", value: 5 });
    expect(first.state.get()).toEqual({ status: "pending" });
    second.dispose();
    expect(disconnected).toEqual(["a"]);
    first.dispose();
  });

  it("registers a lease with the active cleanup scope", () => {
    const scope = createCleanupScope();
    let connections = 0;
    let disconnected = 0;
    const resource = createResource<string, number>(() => {
      connections += 1;
      return () => {
        disconnected += 1;
      };
    });
    const lease = runWithCleanupScope(scope, () => resource.observe("a"));
    scope.dispose();
    expect(disconnected).toBe(1);
    lease.dispose();
    lease.setKey("b");
    expect(connections).toBe(1);
    expect(disconnected).toBe(1);
  });

  it("removes a failed connection so a later observer can retry", () => {
    let attempts = 0;
    const resource = createResource<string, number>(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return () => {};
    });

    expect(() => resource.observe("a")).toThrow("offline");
    const lease = resource.observe("a");
    expect(attempts).toBe(2);
    lease.dispose();
  });

  it("treats keys with Map equality when changing an existing lease", () => {
    let connections = 0;
    let disconnections = 0;
    const resource = createResource<number, number>(() => {
      connections += 1;
      return () => {
        disconnections += 1;
      };
    });
    const lease = resource.observe(-0);

    lease.setKey(+0);
    lease.setKey(Number.NaN);
    lease.setKey(Number.NaN);
    lease.setKey(1);

    expect(connections).toBe(3);
    expect(disconnections).toBe(2);
    lease.dispose();
  });

  it("ignores a disconnected emitter when the same key is observed again", () => {
    const emitters: Array<(value: number) => void> = [];
    const resource = createResource<string, number>((_key, emit) => {
      emitters.push(emit);
      return () => {};
    });
    const oldLease = resource.observe("a");
    oldLease.dispose();
    const newLease = resource.observe("a");
    emitters[0]?.(1);
    expect(newLease.state.get()).toEqual({ status: "pending" });
    emitters[1]?.(2);
    expect(newLease.state.get()).toEqual({ status: "ready", value: 2 });
    expect(emitters).toHaveLength(2);
    newLease.dispose();
  });

  it("can retry the same key after a failed key change", () => {
    let attempts = 0;
    const resource = createResource<string, number>((key) => {
      if (key === "b" && ++attempts === 1) throw new Error("offline");
      return () => {};
    });
    const lease = resource.observe("a");
    expect(() => lease.setKey("b")).toThrow("offline");
    expect(lease.state.get()).toEqual({ status: "pending" });
    lease.setKey("b");
    expect(attempts).toBe(2);
    lease.dispose();
  });

  it("lets a reentrant observer retry when the first subscription fails", () => {
    let attempts = 0;
    let joined!: ReturnType<ReturnType<typeof createResource<string, number>>["observe"]>;
    let emit!: (value: number) => void;
    const resource = createResource<string, number>((key, next) => {
      attempts += 1;
      if (attempts === 1) {
        joined = resource.observe(key);
        throw new Error("offline");
      }
      emit = next;
      return () => {};
    });

    expect(() => resource.observe("a")).toThrow("offline");
    expect(joined.state.get()).toEqual({ status: "pending" });
    joined.setKey("a");
    emit(4);
    expect(attempts).toBe(2);
    expect(joined.state.get()).toEqual({ status: "ready", value: 4 });
    joined.dispose();
  });

  it("clears the old value if disconnect throws during a key change", () => {
    const resource = createResource<string, number>((key, emit) => {
      if (key === "a") emit(1);
      return () => {
        if (key === "a") throw new Error("cleanup failed");
      };
    });
    const lease = resource.observe("a");
    expect(() => lease.setKey("b")).toThrow("cleanup failed");
    expect(lease.state.get()).toEqual({ status: "pending" });
    lease.setKey("b");
    lease.dispose();
  });
});
