import { describe, expect, test } from "vitest";
import { cell, effect, untrack } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("untrack", () => {
  test("read inside untrack is not subscribed", async () => {
    const calls: number[] = [];
    const tracked = cell(1);
    const ignored = cell(10);

    effect(() => {
      calls.push(tracked.get() + untrack(() => ignored.get()));
    });

    ignored.set(20);
    await flushEffects();
    tracked.set(2);
    await flushEffects();

    expect(calls).toEqual([11, 22]);
  });

  test("restores previous tracker if callback throws", () => {
    const tracked = cell(1);
    const calls: number[] = [];

    expect(() => {
      effect(() => {
        calls.push(tracked.get());
        untrack(() => {
          throw new Error("boom");
        });
      });
    }).toThrow("boom");

    expect(calls).toEqual([1]);
  });
});
