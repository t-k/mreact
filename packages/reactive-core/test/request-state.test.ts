import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cell, computed, requestState, runWithRequestState } from "../src/index.js";
import { installRequestStateStorage, type RequestStateScope } from "../src/internal.js";

beforeEach(() => installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>()));
afterEach(() => installRequestStateStorage(undefined));

describe("requestState", () => {
  test("isolates a module-owned cell graph and mutable initial values between requests", () => {
    let calls = 0;
    const useState = requestState(() => {
      calls++;
      const name = cell("empty");
      return { name, label: computed(() => name.get().toUpperCase()), items: [] as string[] };
    });
    expect(calls).toBe(0);
    runWithRequestState(() => {
      const state = useState();
      expect(useState()).toBe(state);
      state.name.set("alice");
      state.items.push("signed-url-alice");
      expect(state.label.get()).toBe("ALICE");
    });
    runWithRequestState(() => {
      expect(useState().name.get()).toBe("empty");
      expect(useState().label.get()).toBe("EMPTY");
      expect(useState().items).toEqual([]);
    });
    expect(calls).toBe(2);
  });

  test("keeps concurrent async requests and nested scopes separate", async () => {
    const useState = requestState(() => cell("initial"));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runWithRequestState(async () => {
      useState().set("alice");
      await gate;
      expect(useState().get()).toBe("alice");
      runWithRequestState(() => {
        expect(useState().get()).toBe("initial");
        useState().set("nested");
      });
      return useState().get();
    });
    const second = runWithRequestState(async () => {
      useState().set("bob");
      release();
      await Promise.resolve();
      return useState().get();
    });
    expect(await Promise.all([first, second])).toEqual(["alice", "bob"]);
  });

  test("fails closed outside the server request and restores scope after failures", async () => {
    const useState = requestState(() => "secret");
    expect(() => useState()).toThrow(/request state.*scope/i);
    expect(() =>
      runWithRequestState(() => {
        useState();
        throw new Error("sync");
      }),
    ).toThrow("sync");
    await expect(
      runWithRequestState(async () => {
        useState();
        throw new Error("async");
      }),
    ).rejects.toThrow("async");
    expect(() => useState()).toThrow(/request state.*scope/i);
    installRequestStateStorage(undefined);
    expect(() => runWithRequestState(() => "unsafe")).toThrow(/AsyncLocalStorage/);
  });

  test("caches undefined and retries a failed initializer without poisoning another request", () => {
    let calls = 0;
    const useState = requestState(() => {
      calls++;
      if (calls === 1) throw new Error("init");
      return undefined;
    });
    runWithRequestState(() => {
      expect(() => useState()).toThrow("init");
      expect(useState()).toBeUndefined();
      expect(useState()).toBeUndefined();
    });
    expect(calls).toBe(2);
    runWithRequestState(() => expect(useState()).toBeUndefined());
    expect(calls).toBe(3);
  });
});

test("discovers and reuses a runtime-provided AsyncLocalStorage constructor", () => {
  installRequestStateStorage(undefined);
  const runtimeGlobal = globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage };
  const previous = runtimeGlobal.AsyncLocalStorage;
  runtimeGlobal.AsyncLocalStorage = AsyncLocalStorage;
  try {
    const useState = requestState(() => cell("initial"));
    runWithRequestState(() => {
      useState().set("alice");
      expect(useState().get()).toBe("alice");
    });
    runWithRequestState(() => expect(useState().get()).toBe("initial"));
    expect(() => useState()).toThrow(/scope/);
  } finally {
    if (previous === undefined) delete runtimeGlobal.AsyncLocalStorage;
    else runtimeGlobal.AsyncLocalStorage = previous;
  }
});
