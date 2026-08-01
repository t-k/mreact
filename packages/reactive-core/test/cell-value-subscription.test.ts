import { describe, expect, test } from "vitest";
import { cell } from "../src/index.js";
import { subscribeCellValue } from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("subscribeCellValue", () => {
  test("passes a retained value and the latest cell value to a shared listener", async () => {
    const first = cell("A");
    const second = cell("B");
    const values: string[] = [];
    const listener = (prefix: string, value: string): void => {
      values.push(`${prefix}:${value}`);
    };
    const disposeFirst = subscribeCellValue(first, listener, "first");
    const disposeSecond = subscribeCellValue(second, listener, "second");

    first.set("A2");
    second.set("B2");
    await flushEffects();

    expect(values).toEqual(["first:A2", "second:B2"]);
    disposeFirst?.();
    disposeSecond?.();
  });

  test("returns undefined for a structural readonly cell", () => {
    const value = {
      get: () => "A",
    };

    expect(subscribeCellValue(value, () => {}, "target")).toBeUndefined();
  });

  test("stops a queued shared listener when disposed", async () => {
    const source = cell("A");
    const values: string[] = [];
    const dispose = subscribeCellValue(
      source,
      (prefix: string, value: string) => {
        values.push(`${prefix}:${value}`);
      },
      "value",
    );

    source.set("B");
    dispose?.();
    await flushEffects();

    expect(values).toEqual([]);
  });
});
