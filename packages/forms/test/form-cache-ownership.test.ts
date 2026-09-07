import { describe, expect, it } from "vitest";
import { createCleanupScope, effect, runWithCleanupScope } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createForm } from "../src/index.js";

describe("form cache ownership", () => {
  it("keeps a cached field usable after the consumer scope that first read it is disposed", async () => {
    const form = createForm({ initialValues: { email: "", name: "" } });
    const consumer = createCleanupScope();

    const firstRead = runWithCleanupScope(consumer, () => form.field("email").state.get().value);
    consumer.dispose();
    await form.setValue("email", "ada@example.test");

    expect(firstRead).toBe("");
    expect(form.field("email").state.get()).toMatchObject({
      dirty: true,
      value: "ada@example.test",
    });
  });

  it("keeps delivering updates to a re-shown field after its first consumer scope is disposed", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const hidden = createCleanupScope();

    runWithCleanupScope(hidden, () => form.field("email").state.get());
    hidden.dispose();

    const shown = createCleanupScope();
    const seen: string[] = [];
    runWithCleanupScope(shown, () => {
      effect(() => {
        seen.push(form.field("email").state.get().value);
      });
    });
    await flushEffects();
    await form.setValue("email", "grace@example.test");
    await flushEffects();
    shown.dispose();

    expect(seen).toEqual(["", "grace@example.test"]);
  });

  it("keeps a shared field usable for the remaining consumer when one scope is disposed", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const first = createCleanupScope();
    const second = createCleanupScope();

    const firstCell = runWithCleanupScope(first, () => form.field("email").state);
    const secondCell = runWithCleanupScope(second, () => form.field("email").state);
    const seen: string[] = [];
    runWithCleanupScope(second, () => {
      effect(() => {
        seen.push(secondCell.get().value);
      });
    });
    await flushEffects();
    first.dispose();
    await form.setValue("email", "ada@example.test");
    await flushEffects();

    expect(firstCell).toBe(secondCell);
    expect(secondCell.get().value).toBe("ada@example.test");
    expect(seen).toEqual(["", "ada@example.test"]);
    second.dispose();
  });

  it("keeps cached array rows and row keys stable after a consumer scope is disposed", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta"] } });
    const first = createCleanupScope();

    const initialKeys = runWithCleanupScope(first, () =>
      form.fieldArray("tags").fields.get().map((row) => row.key),
    );
    first.dispose();
    await form.fieldArray("tags").append("gamma");

    const remounted = createCleanupScope();
    const rows = runWithCleanupScope(remounted, () => form.fieldArray("tags").fields.get());

    expect(initialKeys).toHaveLength(2);
    expect(rows.map((row) => row.value)).toEqual(["alpha", "beta", "gamma"]);
    expect(rows.slice(0, 2).map((row) => row.key)).toEqual(initialKeys);
    remounted.dispose();
  });

  it("keeps cached array rows usable after array mutations across a disposed consumer scope", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta", "gamma"] } });
    const consumer = createCleanupScope();

    const initialKeys = runWithCleanupScope(consumer, () =>
      form.fieldArray("tags").fields.get().map((row) => row.key),
    );
    consumer.dispose();
    await form.fieldArray("tags").remove(1);
    await form.fieldArray("tags").swap(0, 1);

    const rows = form.fieldArray("tags").fields.get();

    expect(rows.map((row) => row.value)).toEqual(["gamma", "alpha"]);
    expect(rows.map((row) => row.key)).toEqual([initialKeys[2], initialKeys[0]]);
  });

  it("returns one cached cell per field name for every consumer", () => {
    const form = createForm({ initialValues: { email: "", tags: ["alpha"] } });
    const consumer = createCleanupScope();

    const scopedFieldCell = runWithCleanupScope(consumer, () => form.field("email").state);
    const scopedArrayCell = runWithCleanupScope(consumer, () => form.fieldArray("tags").fields);
    consumer.dispose();

    expect(form.field("email").state).toBe(scopedFieldCell);
    expect(form.fieldArray("tags").fields).toBe(scopedArrayCell);
    expect(form.fieldArray("tags").fields).toBe(form.fieldArray("tags").fields);
  });

  it("trims cached array row keys when the array field is shortened through setValue", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta", "gamma"] } });
    const tags = form.fieldArray("tags");
    const initialKeys = tags.fields.get().map((row) => row.key);

    await form.setValue("tags", ["alpha"]);
    const shortened = tags.fields.get().map((row) => row.key);
    await form.setValue("tags", ["alpha", "delta"]);
    const regrown = tags.fields.get().map((row) => row.key);

    expect(initialKeys).toHaveLength(3);
    expect(shortened).toEqual([initialKeys[0]]);
    expect(regrown[0]).toBe(initialKeys[0]);
    expect(regrown[1]).not.toBe(initialKeys[1]);
  });

  it("releases field subscriptions when the form creation owner is disposed", async () => {
    const owner = createCleanupScope();
    const form = runWithCleanupScope(owner, () => createForm({ initialValues: { email: "" } }));
    const field = form.field("email");
    const seen: string[] = [];
    const disposeEffect = effect(() => {
      seen.push(field.state.get().value);
    });

    await flushEffects();
    owner.dispose();
    owner.dispose();
    await form.setValue("email", "ada@example.test");
    await flushEffects();
    disposeEffect();

    expect(seen).toEqual([""]);
    expect(form.getValues()).toEqual({ email: "ada@example.test" });
  });

  it("keeps an ownerless form live when consumer scopes are disposed repeatedly", async () => {
    const form = createForm({ initialValues: { email: "" } });

    for (const value of ["ada@example.test", "grace@example.test"]) {
      const consumer = createCleanupScope();
      runWithCleanupScope(consumer, () => form.field("email").state.get());
      consumer.dispose();
      consumer.dispose();
      await form.setValue("email", value);
    }

    expect(form.field("email").state.get().value).toBe("grace@example.test");
  });
});
