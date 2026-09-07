import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createForm } from "../src/index.js";

describe("array row keys", () => {
  it("keeps existing row keys when a row is inserted into an observed array field", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta", "gamma"] } });
    const tags = form.fieldArray("tags");
    const dispose = effect(() => {
      tags.fields.get();
    });

    try {
      await flushEffects();
      const before = tags.fields.get().map((row) => row.key);
      await tags.insert(1, "delta");
      await flushEffects();
      const after = tags.fields.get();

      expect(after.map((row) => String(row.value))).toEqual(["alpha", "delta", "beta", "gamma"]);
      expect([after[0]?.key, after[2]?.key, after[3]?.key]).toEqual(before);
      expect(after[1]?.key).not.toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("keeps existing row keys through observed reorder and insert sequences", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta", "gamma"] } });
    const tags = form.fieldArray("tags");
    const dispose = effect(() => {
      tags.fields.get();
    });

    try {
      await flushEffects();
      const keysByValue = new Map(
        tags.fields.get().map((row) => [String(row.value), row.key] as const),
      );

      await tags.move(0, 2);
      await tags.insert(1, "delta");
      await tags.remove(0);
      await flushEffects();
      const after = tags.fields.get();

      expect(after.map((row) => String(row.value))).toEqual(["delta", "gamma", "alpha"]);
      expect(after[1]?.key).toBe(keysByValue.get("gamma"));
      expect(after[2]?.key).toBe(keysByValue.get("alpha"));
    } finally {
      dispose();
    }
  });

  it("keeps existing row keys when an observed array field is appended to", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta"] } });
    const tags = form.fieldArray("tags");
    const dispose = effect(() => {
      tags.fields.get();
    });

    try {
      await flushEffects();
      const before = tags.fields.get().map((row) => row.key);
      await tags.append("gamma");
      await flushEffects();
      const after = tags.fields.get();

      expect(after.map((row) => String(row.value))).toEqual(["alpha", "beta", "gamma"]);
      expect(after.slice(0, 2).map((row) => row.key)).toEqual(before);
    } finally {
      dispose();
    }
  });
});
