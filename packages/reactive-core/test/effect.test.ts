import { describe, expect, test } from "vitest";
import { cell, effect } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("effect", () => {
  test("runs once synchronously on creation", () => {
    const calls: number[] = [];
    const count = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    expect(calls).toEqual([0]);
  });

  test("reruns asynchronously and sees the latest value once", async () => {
    const calls: number[] = [];
    const count = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    count.set(1);
    count.set(2);

    expect(calls).toEqual([0]);

    await flushEffects();

    expect(calls).toEqual([0, 2]);
  });

  test("does not rerun for unrelated cells", async () => {
    const calls: number[] = [];
    const count = cell(0);
    const other = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    other.set(1);
    await flushEffects();

    expect(calls).toEqual([0]);
  });

  test("cleans up before rerun and once on dispose", async () => {
    const events: string[] = [];
    const count = cell(0);

    const dispose = effect(() => {
      events.push(`run:${count.get()}`);
      return () => events.push(`cleanup:${count.get()}`);
    });

    count.set(1);
    await flushEffects();
    dispose();
    dispose();

    expect(events).toEqual(["run:0", "cleanup:1", "run:1", "cleanup:1"]);
  });

  test("disposed effect is not resubscribed", async () => {
    const calls: number[] = [];
    const count = cell(0);

    const dispose = effect(() => {
      calls.push(count.get());
    });

    dispose();
    count.set(1);
    await flushEffects();

    expect(calls).toEqual([0]);
  });
});
