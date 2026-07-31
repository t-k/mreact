import { describe, expect, test } from "vitest";
import { cell } from "../src/index.js";
import {
  notifySubscribers,
  subscribeAdaptiveSource,
  trackSource,
  type Source,
} from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("subscribeAdaptiveSource", () => {
  test("tracks dependencies introduced by a later source value", async () => {
    const source: Source = { subscribers: null };
    const external = cell("A");
    const values: string[] = [];
    let readsExternal = false;

    const dispose = subscribeAdaptiveSource(source, () => {
      trackSource(source);
      values.push(readsExternal ? external.get() : "direct");
    });

    readsExternal = true;
    notifySubscribers(source);
    await flushEffects();
    external.set("B");
    await flushEffects();

    expect(values).toEqual(["direct", "A", "B"]);

    dispose();
    external.set("C");
    await flushEffects();
    expect(values).toEqual(["direct", "A", "B"]);
  });

  test("returns to a source-only subscription after an external dependency is removed", async () => {
    const source: Source = { subscribers: null };
    const external = cell("A");
    const values: string[] = [];
    let readsExternal = true;

    const dispose = subscribeAdaptiveSource(source, () => {
      trackSource(source);
      values.push(readsExternal ? external.get() : "direct");
    });

    readsExternal = false;
    notifySubscribers(source);
    await flushEffects();
    external.set("B");
    await flushEffects();

    expect(values).toEqual(["A", "direct"]);

    dispose();
  });

  test("does not run a queued listener after disposal", async () => {
    const source: Source = { subscribers: null };
    const values: string[] = [];
    const dispose = subscribeAdaptiveSource(source, () => {
      trackSource(source);
      values.push("run");
    });

    notifySubscribers(source);
    dispose();
    await flushEffects();

    expect(values).toEqual(["run"]);
  });
});
