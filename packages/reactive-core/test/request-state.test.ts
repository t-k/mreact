import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cell,
  computed,
  createCleanupScope,
  effect,
  requestState,
  runWithCleanupScope,
  runWithRequestState,
} from "../src/index.js";
import { installRequestStateStorage, type RequestStateScope } from "../src/internal.js";

beforeEach(() => installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>()));
afterEach(() => installRequestStateStorage(undefined));

describe("requestState", () => {
  test("shares one cleanup owner across independently initialized accessors", () => {
    const cleaned: string[] = [];
    const useFirst = requestState(() =>
      effect(() => () => {
        cleaned.push("first");
      }),
    );
    const useSecond = requestState(() =>
      effect(() => () => {
        cleaned.push("second");
      }),
    );
    runWithRequestState(() => {
      useFirst();
      useSecond();
      expect(cleaned).toEqual([]);
    });
    expect(cleaned).toEqual(["second", "first"]);
  });
  test.each(["sync", "async", "sync-error", "async-error"])(
    "cleans every resource and preserves the primary error on %s",
    async (mode) => {
      const cleaned: string[] = [];
      const useResource = requestState(() => {
        effect(() => () => {
          cleaned.push("first");
        });
        effect(() => () => {
          cleaned.push("second");
          throw new Error("cleanup");
        });
      });
      const work = () => {
        useResource();
        if (mode.endsWith("error")) throw new Error("primary");
        return 42;
      };
      const expected = mode.endsWith("error") ? "primary" : "cleanup";
      if (mode.startsWith("async"))
        await expect(runWithRequestState(async () => work())).rejects.toThrow(expected);
      else expect(() => runWithRequestState(work)).toThrow(expected);
      expect(cleaned).toEqual(["second", "first"]);
    },
  );

  // oxlint-disable-next-line unicorn/no-thenable -- Exercise a non-callable then property.
  test.each([undefined, null, 42, {}, () => 42, { then: "data" }])(
    "preserves synchronous return values without assimilating non-promises (%s)",
    (value) => {
      expect(runWithRequestState(() => value)).toBe(value);
    },
  );

  test("awaits a callable thenable and owns state initialized after an await", async () => {
    let cleaned = 0;
    const useResource = requestState(() =>
      effect(() => () => {
        cleaned++;
      }),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = runWithRequestState(() => {
      const pending = gate.then(() => {
        useResource();
        expect(cleaned).toBe(0);
        return 42;
      });
      // oxlint-disable-next-line unicorn/no-thenable -- Exercise callable promise-like values.
      return Object.assign(() => 0, { then: pending.then.bind(pending) });
    });
    expect(cleaned).toBe(0);
    release();
    expect(await result).toBe(42);
    expect(cleaned).toBe(1);
  });

  test("disposes partial initializers and rejects new resources during cleanup", () => {
    let cleaned = 0;
    const useLate = requestState(() => "late");
    const useBroken = requestState(() => {
      effect(() => () => {
        cleaned++;
        expect(useLate).toThrow(/ended/);
      });
      throw new Error("initializer");
    });
    expect(() => runWithRequestState(useBroken)).toThrow("initializer");
    expect(cleaned).toBe(1);
  });

  test("owns lazy graphs independently of the caller and disposes them with the request", () => {
    const name = cell("a");
    const seen: string[] = [];
    const useGraph = requestState(() => {
      effect(() => {
        seen.push(name.get());
      });
      return computed(() => name.get().toUpperCase());
    });
    let graph!: ReturnType<typeof useGraph>;
    runWithRequestState(() => {
      const renderScope = createCleanupScope();
      graph = runWithCleanupScope(renderScope, useGraph);
      expect(graph.get()).toBe("A");
      renderScope.dispose();
      name.set("b");
      expect(useGraph()).toBe(graph);
      expect(graph.get()).toBe("B");
    });
    const runs = seen.length;
    name.set("c");
    expect(seen).toHaveLength(runs);
    expect(() => graph.get()).toThrow(/disposed computed/);
  });

  test.each([false, true])("disposes synchronous request effects on exit (throw=%s)", (fail) => {
    const source = cell(0);
    let runs = 0;
    let cleanups = 0;
    const useResource = requestState(() =>
      effect(() => {
        source.get();
        runs++;
        return () => {
          cleanups++;
        };
      }),
    );
    const run = () =>
      runWithRequestState(() => {
        useResource();
        expect(cleanups).toBe(0);
        if (fail) throw new Error("callback");
        return 42;
      });
    if (fail) expect(run).toThrow("callback");
    else expect(run()).toBe(42);
    expect(cleanups).toBe(1);
    source.set(1);
    expect(runs).toBe(1);
  });

  test.each([false, true])("retains async resources until settlement (reject=%s)", async (fail) => {
    const source = cell(0);
    let cleanups = 0;
    const useResource = requestState(() => {
      effect(() => () => {
        cleanups++;
      });
      return computed(() => source.get());
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = runWithRequestState(async () => {
      const graph = useResource();
      await gate;
      expect(cleanups).toBe(0);
      source.set(1);
      expect(graph.get()).toBe(1);
      if (fail) throw new Error("callback");
      return 42;
    });
    expect(cleanups).toBe(0);
    release();
    if (fail) await expect(result).rejects.toThrow("callback");
    else expect(await result).toBe(42);
    expect(cleanups).toBe(1);
  });

  test("disposes nested requests independently and keeps cleanup in the original request", () => {
    const cleaned: string[] = [];
    const useName = requestState(() => cell("initial"));
    const useResource = requestState(() =>
      effect(() => () => {
        cleaned.push(useName().get());
      }),
    );
    runWithRequestState(() => {
      useName().set("outer");
      useResource();
      runWithRequestState(() => {
        useName().set("inner");
        useResource();
      });
      expect(cleaned).toEqual(["inner"]);
      expect(useName().get()).toBe("outer");
    });
    expect(cleaned).toEqual(["inner", "outer"]);
  });

  test("rejects late initialization even when the request never initialized state", async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const useLate = requestState(() => "late");
    let background!: Promise<void>;
    runWithRequestState(() => {
      background = gate.then(() => {
        expect(useLate).toThrow(/ended/);
      });
    });
    resume();
    await background;
  });

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
  const runtimeGlobal = globalThis as typeof globalThis & {
    AsyncLocalStorage?: typeof AsyncLocalStorage;
  };
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
