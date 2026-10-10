import { describe, expect, test, vi } from "vitest";
import {
  createRootRuntime,
  renderWithRootRuntime,
  runWithHostCommit,
  useEffect,
  useState,
  useSyncExternalStore,
} from "../src/hooks.js";

function hasRetainedBaseline(runtime: ReturnType<typeof createRootRuntime>): boolean {
  const state = (globalThis as Record<symbol, unknown>)[Symbol.for("modular.react.hook_render_state")] as {
    hostCommitStateBaselines?: WeakMap<object, unknown>;
  };
  return state.hostCommitStateBaselines?.has(runtime) === true;
}

function stateRuntime() {
  const rerender = vi.fn();
  const runtime = createRootRuntime(rerender);
  let setValue!: (value: unknown) => void;
  runtime.beginRender();
  renderWithRootRuntime(runtime, "0", () => {
    [, setValue] = useState<unknown>(0);
  });
  runtime.endRender();
  const slot = runtime.instances.get("0")!.hooks[0]!;
  return { runtime, rerender, setValue, slot };
}

describe("commit rerender work", () => {
  test("host commits check dirty instances without materializing a root-sized array", () => {
    const { runtime, rerender, setValue } = stateRuntime();
    runWithHostCommit(() => setValue(1));
    const from = vi.spyOn(Array, "from");
    try {
      runtime.flushEffects();
      expect(rerender).toHaveBeenCalledExactlyOnceWith("sync");
      expect(from).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
      runtime.dispose();
    }
  });

  test("effect callback updates check dirty instances without a root-sized array", () => {
    const { runtime, rerender, setValue } = stateRuntime();
    const from = vi.spyOn(Array, "from");
    try {
      runtime.beginRender();
      renderWithRootRuntime(runtime, "0", () => {
        useState(0);
        useEffect(() => setValue(1), []);
      });
      runtime.endRender();
      runtime.flushEffects();
      expect(rerender).toHaveBeenCalledExactlyOnceWith("sync");
      expect(from).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
      runtime.dispose();
    }
  });
});

describe("host commit baseline ownership", () => {
  test("stops the dirty search at the first dirty instance", () => {
    const { runtime, setValue } = stateRuntime();
    runtime.beginRender();
    renderWithRootRuntime(runtime, "0", () => useState(0));
    renderWithRootRuntime(runtime, "1", () => useState(0));
    runtime.endRender();
    Object.defineProperty(runtime.instances.get("1")!, "dirty", {
      get() {
        throw new Error("Unnecessary dirty read");
      },
    });
    runWithHostCommit(() => setValue(1));
    expect(() => runtime.flushEffects()).not.toThrow();
    runtime.dispose();
  });

  test("clears only touched slots, including a removed instance", () => {
    const { runtime, setValue, slot, rerender } = stateRuntime();
    runtime.beginRender();
    renderWithRootRuntime(runtime, "0", () => useState(0));
    renderWithRootRuntime(runtime, "1", () => useState("untouched"));
    runtime.endRender();
    const untouched = runtime.instances.get("1")!.hooks;
    const iterate = vi.spyOn(untouched, Symbol.iterator);
    runWithHostCommit(() => setValue(1));
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(true);
    runtime.instances.delete("0");
    try {
      runtime.flushEffects();
      expect(rerender).not.toHaveBeenCalled();
      expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
      expect(hasRetainedBaseline(runtime)).toBe(false);
      expect(iterate).not.toHaveBeenCalled();
    } finally {
      iterate.mockRestore();
      runtime.dispose();
    }
  });

  test("dispose releases a queued baseline even if cleanup throws", () => {
    const { runtime, setValue, slot } = stateRuntime();
    const error = new Error("cleanup");
    runtime.beginRender();
    renderWithRootRuntime(runtime, "0", () => {
      useState(0);
      useEffect(
        () => () => {
          throw error;
        },
        [],
      );
    });
    runtime.endRender();
    runtime.flushEffects();
    runWithHostCommit(() => setValue(1));
    expect(() => runtime.dispose()).toThrow(error);
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    expect(hasRetainedBaseline(runtime)).toBe(false);
    runtime.flushEffects();
  });

  test("preserves the first undefined baseline and clears it before rerender", () => {
    const { runtime, setValue, slot } = stateRuntime();
    if (slot.kind !== "state") throw new Error("Expected state");
    slot.value = undefined;
    slot.baseState = undefined;
    runtime.rerender = () => {
      expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    };
    runWithHostCommit(() => {
      setValue(1);
      setValue(2);
    });
    expect(slot.hostCommitValue).toBeUndefined();
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(true);
    runtime.flushEffects();
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    runtime.dispose();
  });

  test("retains every touched slot in one root until the commit flush", () => {
    const runtime = createRootRuntime(() => {});
    let setFirst!: (value: number) => void;
    let setSecond!: (value: number) => void;
    runtime.beginRender();
    renderWithRootRuntime(runtime, "0", () => {
      [, setFirst] = useState(0);
      [, setSecond] = useState(0);
    });
    runtime.endRender();
    const slots = runtime.instances.get("0")!.hooks;
    runWithHostCommit(() => { setFirst(1); setSecond(2); });
    expect(slots.every(slot => Object.hasOwn(slot, "hostCommitValue"))).toBe(true);
    runtime.flushEffects();
    expect(slots.some(slot => Object.hasOwn(slot, "hostCommitValue"))).toBe(false);
    expect(hasRetainedBaseline(runtime)).toBe(false);
    runtime.dispose();
  });

  test("isolates roots and clears pending roots when a rerender throws", () => {
    const first = stateRuntime();
    const second = stateRuntime();
    const error = new Error("render");
    first.runtime.rerender = () => {
      throw error;
    };
    runWithHostCommit(() => {
      first.setValue(1);
      second.setValue(2);
    });
    expect(() => first.runtime.flushEffects()).toThrow(error);
    expect(Object.hasOwn(first.slot, "hostCommitValue")).toBe(false);
    expect(Object.hasOwn(second.slot, "hostCommitValue")).toBe(false);
    first.runtime.dispose();
    second.runtime.dispose();
  });

  test("a failed rerender preserves a newly queued update on another root", () => {
    const first = stateRuntime();
    const second = stateRuntime();
    const error = new Error("failed first render");
    first.runtime.rerender = () => {
      runWithHostCommit(() => second.setValue(2));
      throw error;
    };
    runWithHostCommit(() => first.setValue(1));
    try {
      expect(() => first.runtime.flushEffects()).toThrow(error);
      expect(second.rerender).toHaveBeenCalledOnce();
      expect(Object.hasOwn(second.slot, "hostCommitValue")).toBe(false);
      expect(hasRetainedBaseline(second.runtime)).toBe(false);
    } finally {
      first.runtime.dispose();
      second.runtime.dispose();
    }
  });

  test("shares baseline ownership across duplicated hook modules", async () => {
    const renderer =
      // @ts-expect-error Intentionally evaluate a separate renderer module.
      (await import("../src/hooks.ts?baseline-renderer")) as typeof import("../src/hooks.js");
    const component =
      // @ts-expect-error Intentionally evaluate a separate hook module.
      (await import("../src/hooks.ts?baseline-component")) as typeof import("../src/hooks.js");
    const runtime = renderer.createRootRuntime(() => {});
    let setValue!: (value: number) => void;
    runtime.beginRender();
    renderer.renderWithRootRuntime(runtime, "0", () => {
      [, setValue] = component.useState(0);
    });
    runtime.endRender();
    const slot = runtime.instances.get("0")!.hooks[0]!;
    renderer.runWithHostCommit(() => setValue(1));
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(true);
    runtime.flushEffects();
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    runtime.dispose();
  });

  test("clears baselines queued during failure and after the bounded rerender limit", () => {
    const { runtime, setValue, slot } = stateRuntime();
    const error = new Error("reentrant render");
    runtime.rerender = () => {
      runWithHostCommit(() => setValue(2));
      throw error;
    };
    runWithHostCommit(() => setValue(1));
    expect(() => runtime.flushEffects()).toThrow(error);
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    let renders = 0;
    runtime.rerender = () => {
      renders++;
      runWithHostCommit(() => setValue(3 + renders));
    };
    runWithHostCommit(() => setValue(3));
    runtime.flushEffects();
    expect(renders).toBe(3);
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    runtime.dispose();
  });

  test("external stores retain their first baseline and support a reentrant commit", () => {
    let snapshot = "initial";
    let notify!: () => void;
    const runtime = createRootRuntime(() => {});
    const render = () => {
      runtime.beginRender();
      renderWithRootRuntime(runtime, "0", () =>
        useSyncExternalStore(
          (callback) => {
            notify = callback;
            return () => {};
          },
          () => snapshot,
        ),
      );
      runtime.endRender();
    };
    render();
    runtime.flushEffects();
    const slot = runtime.instances.get("0")!.hooks[0]!;
    if (slot.kind !== "store") throw new Error("Expected store");
    runWithHostCommit(() => {
      snapshot = "next";
      notify();
      snapshot = "initial";
      notify();
    });
    expect(slot.hostCommitValue).toBe("initial");
    expect(runtime.instances.get("0")!.dirty).toBe(false);
    runtime.flushEffects();
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    let rerenders = 0;
    runtime.rerender = () => {
      expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
      rerenders++;
      if (rerenders === 1)
        runWithHostCommit(() => {
          snapshot = "reentrant";
          notify();
        });
    };
    runWithHostCommit(() => {
      snapshot = "next";
      notify();
    });
    runtime.flushEffects();
    expect(rerenders).toBe(2);
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    snapshot = "outside commit";
    notify();
    expect(Object.hasOwn(slot, "hostCommitValue")).toBe(false);
    expect(hasRetainedBaseline(runtime)).toBe(false);
    runtime.dispose();
  });
});
