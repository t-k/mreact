import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cell, effect, selector } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("selector", () => {
  test("reruns only subscribers for the previous and next selected keys", async () => {
    const selected = cell<number | null>(null);
    const selectedFor = selector<number | null, number>(selected);
    const calls = new Map<number, boolean[]>();
    const disposers = [1, 2, 3].map((id) =>
      effect(() => {
        const values = calls.get(id) ?? [];
        values.push(selectedFor(id));
        calls.set(id, values);
      }),
    );

    expect(calls).toEqual(
      new Map([
        [1, [false]],
        [2, [false]],
        [3, [false]],
      ]),
    );

    selected.set(2);
    await flushEffects();

    expect(calls).toEqual(
      new Map([
        [1, [false]],
        [2, [false, true]],
        [3, [false]],
      ]),
    );

    selected.set(3);
    await flushEffects();

    expect(calls).toEqual(
      new Map([
        [1, [false]],
        [2, [false, true, false]],
        [3, [false, true]],
      ]),
    );

    for (const dispose of disposers) {
      dispose();
    }
    selectedFor.dispose();
  });

  test("uses a shared selector source cleanup function", async () => {
    const source = await readFile(
      join(process.cwd(), "packages/reactive-core/src/selector.ts"),
      "utf8",
    );

    expect(source).toContain("function cleanupSelectorSource");
    expect(source).not.toContain("onNoSubscribers() {");
  });

  test("notifies key subscriptions only for previous and next selected keys", async () => {
    const selected = cell<number | null>(null);
    const selectedFor = selector<number | null, number>(selected);
    const calls = new Map<number, boolean[]>();
    const disposers = [1, 2, 3].map((id) =>
      selectedFor.subscribe(id, (isSelected) => {
        const values = calls.get(id) ?? [];
        values.push(isSelected);
        calls.set(id, values);
      }),
    );

    selected.set(2);
    await flushEffects();

    expect(calls).toEqual(new Map([[2, [true]]]));

    selected.set(3);
    await flushEffects();

    expect(calls).toEqual(
      new Map([
        [2, [true, false]],
        [3, [true]],
      ]),
    );

    disposers[1]?.();
    selected.set(2);
    await flushEffects();

    expect(calls).toEqual(
      new Map([
        [2, [true, false]],
        [3, [true, false]],
      ]),
    );

    disposers[0]?.();
    disposers[2]?.();
    selectedFor.dispose();
  });

  test("supports multiple key subscriptions without dropping remaining callbacks", async () => {
    const selected = cell<number | null>(null);
    const selectedFor = selector<number | null, number>(selected);
    const firstCalls: boolean[] = [];
    const secondCalls: boolean[] = [];
    const disposeFirst = selectedFor.subscribe(1, (isSelected) => {
      firstCalls.push(isSelected);
    });
    const disposeSecond = selectedFor.subscribe(1, (isSelected) => {
      secondCalls.push(isSelected);
    });

    selected.set(1);
    await flushEffects();

    expect(firstCalls).toEqual([true]);
    expect(secondCalls).toEqual([true]);

    disposeFirst();
    selected.set(null);
    await flushEffects();

    expect(firstCalls).toEqual([true]);
    expect(secondCalls).toEqual([true, false]);

    disposeSecond();
    selectedFor.dispose();
  });

});
