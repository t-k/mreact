import { afterEach, describe, expect, test } from "vitest";
import { installDevtools, type Devtools } from "@reckona/mreact-devtools";
import { cell, effect } from "../src/index.js";
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
