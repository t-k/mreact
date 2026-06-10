import { afterEach, describe, expect, test } from "vitest";
import { installDevtools, type Devtools } from "@reckona/mreact-devtools";
import { batch, cell, effect } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

let activeDevtools: Devtools | undefined;

afterEach(() => {
  activeDevtools?.dispose();
  activeDevtools = undefined;
});

describe("reactive-core devtools instrumentation", () => {
  test("emits opt-in cell and effect events through the global devtools hook", async () => {
    const devtools = installDevtools();
    activeDevtools = devtools;
    const count = cell(0);
    const dispose = effect(() => {
      count.get();
    });

    count.set(1);
    await flushEffects();
    dispose();

    expect(devtools.events().map((event) => event.type)).toContain("reactive:cell:set");
    expect(devtools.events().map((event) => event.type)).toContain("reactive:effect:run");
  });

  test("observes a late devtools attach from the next batch boundary", () => {
    const count = cell(0);
    // A write before any devtools exists primes the no-devtools write fast path.
    count.set(1);

    const devtools = installDevtools();
    activeDevtools = devtools;

    // Attach visibility contract: a null-sampled writer re-samples the global
    // hook at the next batch or effect-flush boundary, not mid-sequence.
    batch(() => {
      count.set(2);
    });

    expect(devtools.events().map((event) => event.type)).toContain("reactive:cell:set");
  });

  test("stops emitting immediately after the global hook detaches", () => {
    const globalWithHook = globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: (event: Record<string, unknown>) => void } | undefined;
    };
    const events: Record<string, unknown>[] = [];

    try {
      globalWithHook.__mreactDevtools = {
        emit: (event) => {
          events.push(event);
        },
      };
      const count = cell(0);

      count.set(1);
      const eventsBeforeDetach = events.length;
      expect(eventsBeforeDetach).toBeGreaterThan(0);

      // Detach mirrors devtools.dispose(): the global hook is cleared. Cached
      // writers must observe the detach on the very next write.
      globalWithHook.__mreactDevtools = undefined;

      count.set(2);
      expect(events.length).toBe(eventsBeforeDetach);
    } finally {
      globalWithHook.__mreactDevtools = undefined;
    }
  });

  test("keeps notifying after subscribers detach and a new subscriber attaches", async () => {
    // Guards subscriber-presence bookkeeping on the write fast path: a cell
    // whose last subscriber was removed must still notify a later subscriber.
    const count = cell(0);
    let observed = -1;

    const disposeFirst = effect(() => {
      count.get();
    });
    await flushEffects();
    disposeFirst();

    count.set(1);

    const disposeSecond = effect(() => {
      observed = count.get();
    });
    await flushEffects();

    count.set(2);
    await flushEffects();
    disposeSecond();

    expect(observed).toBe(2);
  });

  test("effect devtools emission does not allocate a bound emitter per run", async () => {
    const devtools = installDevtools();
    activeDevtools = devtools;
    const count = cell(0);
    const originalBind = devtools.emit.bind;
    let bindCalls = 0;
    (devtools.emit as typeof devtools.emit & { bind: typeof originalBind }).bind =
      ((thisArg: unknown, ...args: unknown[]) => {
        bindCalls += 1;
        return originalBind.call(devtools.emit, thisArg, ...args);
      }) as typeof originalBind;

    const dispose = effect(() => {
      count.get();
    });
    count.set(1);
    await flushEffects();
    dispose();

    expect(devtools.events().map((event) => event.type)).toContain("reactive:effect:run");
    expect(bindCalls).toBe(0);
  });
});
