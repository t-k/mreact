import { describe, expect, test } from "vitest";
import { cell } from "../src/index.js";

describe("cell", () => {
  test("returns the initial value", () => {
    const count = cell(1);

    expect(count.get()).toBe(1);
  });

  test("sets a direct value", () => {
    const count = cell(1);

    count.set(2);

    expect(count.get()).toBe(2);
  });

  test("sets with an updater function using the current value", () => {
    const count = cell(1);

    count.set((prev) => prev + 1);

    expect(count.get()).toBe(2);
  });

  test("stores function values through a wrapper function", () => {
    const first = () => 1;
    const second = () => 2;
    const current = cell<() => number>(first);

    current.set(() => second);

    expect(current.get()).toBe(second);
    expect(current.get()()).toBe(2);
  });
});
