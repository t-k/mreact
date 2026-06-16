import { describe, expect, test } from "vitest";
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
});
