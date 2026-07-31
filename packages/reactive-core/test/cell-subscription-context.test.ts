import { describe, expect, test } from "vitest";
import { batch, cell } from "../src/index.js";
import { subscribeCellWithContext } from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("context cell subscriptions", () => {
  test("delivers the latest batched value with the original context", async () => {
    const source = cell("a");
    const seen: string[] = [];
    const dispose = subscribeCellWithContext(source, seen, (target, value) => {
      target.push(value);
    });

    batch(() => {
      source.set("b");
      source.set("c");
    });
    await flushEffects();

    expect(seen).toEqual(["c"]);
    dispose?.();
  });

  test("dispose removes queued work before it can call the listener", async () => {
    const source = cell("a");
    const seen: string[] = [];
    const dispose = subscribeCellWithContext(source, seen, (target, value) => {
      target.push(value);
    });

    source.set("b");
    dispose?.();
    await flushEffects();

    expect(seen).toEqual([]);
  });

  test("keeps contexts isolated across multiple subscribers", async () => {
    const source = cell(0);
    const first: number[] = [];
    const second: number[] = [];
    const listener = (target: number[], value: number): void => {
      target.push(value);
    };
    const disposeFirst = subscribeCellWithContext(source, first, listener);
    const disposeSecond = subscribeCellWithContext(source, second, listener);

    source.set(1);
    await flushEffects();

    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
    disposeFirst?.();
    disposeSecond?.();
  });
});
