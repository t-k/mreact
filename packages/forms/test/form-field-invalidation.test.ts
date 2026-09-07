import { describe, expect, it } from "vitest";
import { computed, createCleanupScope, effect, runWithCleanupScope } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createForm } from "../src/index.js";

// A cached field value is rebuilt from scratch on every derivation, so an unchanged
// snapshot identity is direct evidence that the field was not derived again.

function listValues(count: number): Record<string, string[]> {
  return Object.fromEntries(
    Array.from({ length: count }, (_unused, index) => [`list${index}`, ["a", "b"]]),
  );
}

/** Counts array field derivations: arrayValues() asks Array.isArray once per derivation. */
async function countArrayDerivations(run: () => Promise<void>): Promise<number> {
  const originalIsArray = Array.isArray;
  let calls = 0;
  Array.isArray = ((value: unknown) => {
    calls += 1;
    return originalIsArray(value);
  }) as typeof Array.isArray;

  try {
    await run();
  } finally {
    Array.isArray = originalIsArray;
  }

  return calls;
}

describe("field invalidation", () => {
  it("does not re-derive an unrelated observed field when one field changes", async () => {
    const form = createForm({ initialValues: { email: "", name: "" } });
    const email = form.field("email");
    const name = form.field("name");
    const dispose = effect(() => {
      email.state.get();
      name.state.get();
    });

    try {
      await flushEffects();
      const nameBefore = name.state.get();
      await email.setValue("ada@example.test");
      await flushEffects();

      expect(name.state.get()).toBe(nameBefore);
      expect(email.state.get()).toMatchObject({ dirty: true, value: "ada@example.test" });
    } finally {
      dispose();
    }
  });

  it("does not re-derive an unrelated observed array field when one field changes", async () => {
    const form = createForm({ initialValues: { email: "", tags: ["alpha"] } });
    const email = form.field("email");
    const tags = form.fieldArray("tags");
    const dispose = effect(() => {
      email.state.get();
      tags.fields.get();
    });

    try {
      await flushEffects();
      const tagsBefore = tags.fields.get();
      await email.setValue("ada@example.test");
      await flushEffects();

      expect(tags.fields.get()).toBe(tagsBefore);
    } finally {
      dispose();
    }
  });

  it("keeps the work of one field change independent of how many fields are observed", async () => {
    const measure = async (count: number): Promise<number> => {
      const form = createForm({ initialValues: listValues(count) });
      const lists = Object.keys(form.getValues()).map((name) => form.fieldArray(name));
      const disposers = lists.map((list) =>
        effect(() => {
          list.fields.get();
        }),
      );
      await flushEffects();

      const derivations = await countArrayDerivations(async () => {
        await form.setValue("list0", ["a", "b", "edited"]);
        await flushEffects();
      });

      for (const dispose of disposers) {
        dispose();
      }

      return derivations;
    };

    const few = await measure(5);
    const many = await measure(50);

    expect(few).toBeGreaterThan(0);
    expect(many).toBe(few);
  });

  it("re-derives only the edited field and its declared validation dependents", async () => {
    const form = createForm({
      initialValues: { confirm: "", password: "", nickname: "" },
      validate: {
        confirm: {
          deps: ["password"],
          validate: (value, values) =>
            value === values.password ? [] : ["Passwords must match"],
        },
      },
      validateOn: "change",
    });
    const password = form.field("password");
    const confirm = form.field("confirm");
    const nickname = form.field("nickname");
    const dispose = effect(() => {
      password.state.get();
      confirm.state.get();
      nickname.state.get();
    });

    try {
      await flushEffects();
      const confirmBefore = confirm.state.get();
      const nicknameBefore = nickname.state.get();
      await password.setValue("hunter2");
      await flushEffects();

      expect(nickname.state.get()).toBe(nicknameBefore);
      expect(confirm.state.get()).not.toBe(confirmBefore);
      expect(confirm.state.get().errors).toEqual(["Passwords must match"]);
    } finally {
      dispose();
    }
  });

  it("rejects a stale dependent validation result without touching unrelated fields", async () => {
    const resolvers: Array<(errors: string[]) => void> = [];
    const form = createForm({
      initialValues: { email: "", nickname: "" },
      validate: {
        email: () =>
          new Promise<string[]>((resolve) => {
            resolvers.push(resolve);
          }),
      },
      validateOn: "change",
    });
    const email = form.field("email");
    const nickname = form.field("nickname");
    const dispose = effect(() => {
      email.state.get();
      nickname.state.get();
    });

    try {
      await flushEffects();
      const nicknameBefore = nickname.state.get();
      const first = email.setValue("first@example.test");
      const second = email.setValue("second@example.test");
      resolvers[1]?.(["Second result"]);
      resolvers[0]?.(["Stale result"]);
      await Promise.all([first, second]);
      await flushEffects();

      expect(email.state.get().errors).toEqual(["Second result"]);
      expect(email.state.get().validating).toBe(false);
      expect(nickname.state.get()).toBe(nicknameBefore);
    } finally {
      dispose();
    }
  });

  it("refreshes every field snapshot and the form state on reset", async () => {
    const form = createForm({ initialValues: { email: "", tags: ["alpha"], name: "" } });
    const email = form.field("email");
    const name = form.field("name");
    const tags = form.fieldArray("tags");
    const dispose = effect(() => {
      email.state.get();
      name.state.get();
      tags.fields.get();
    });

    try {
      await flushEffects();
      await email.setValue("ada@example.test");
      await name.blur();
      form.setErrors({ name: ["Required"] });
      await flushEffects();

      form.reset({ email: "reset@example.test", name: "Reset", tags: ["beta"] });
      await flushEffects();

      expect(email.state.get()).toEqual({
        dirty: false,
        errors: [],
        touched: false,
        validating: false,
        value: "reset@example.test",
      });
      expect(name.state.get()).toEqual({
        dirty: false,
        errors: [],
        touched: false,
        validating: false,
        value: "Reset",
      });
      expect(tags.fields.get().map((row) => String(row.value))).toEqual(["beta"]);
      expect(form.state.get()).toMatchObject({
        dirty: false,
        errors: {},
        submitCount: 0,
        submitting: false,
        touched: {},
        valid: true,
        validating: {},
        values: { email: "reset@example.test", name: "Reset", tags: ["beta"] },
      });
    } finally {
      dispose();
    }
  });

  it("moves submit state without re-deriving field snapshots and still reports submit errors", async () => {
    const form = createForm({
      initialValues: { email: "", nickname: "" },
      validate: {
        email: (value) => (value === "" ? ["Required"] : []),
      },
    });
    const email = form.field("email");
    const nickname = form.field("nickname");
    const dispose = effect(() => {
      email.state.get();
      nickname.state.get();
    });

    try {
      await flushEffects();
      await email.setValue("ada@example.test");
      await flushEffects();
      const emailBefore = email.state.get();
      const nicknameBefore = nickname.state.get();

      const result = await form.submit(async (values) => values.email);
      await flushEffects();

      expect(result).toEqual({ data: "ada@example.test", status: "success" });
      expect(email.state.get()).toEqual(emailBefore);
      expect(nickname.state.get()).toBe(nicknameBefore);
      expect(form.state.get()).toMatchObject({ submitCount: 1, submitting: false });

      await email.setValue("");
      await flushEffects();
      const invalid = await form.submit(async () => "unused");
      await flushEffects();

      expect(invalid).toEqual({ errors: { email: ["Required"] }, status: "invalid" });
      expect(email.state.get().errors).toEqual(["Required"]);
      expect(nickname.state.get()).toBe(nicknameBefore);
    } finally {
      dispose();
    }
  });

  it("updates only the fields named by form-wide and server error writes", async () => {
    const form = createForm({ initialValues: { email: "", name: "", nickname: "" } });
    const email = form.field("email");
    const name = form.field("name");
    const nickname = form.field("nickname");
    const dispose = effect(() => {
      email.state.get();
      name.state.get();
      nickname.state.get();
    });

    try {
      await flushEffects();
      const nicknameBefore = nickname.state.get();
      form.setErrors({ email: ["Invalid"], root: ["Form failed"] });
      await flushEffects();

      expect(email.state.get().errors).toEqual(["Invalid"]);
      expect(nickname.state.get()).toBe(nicknameBefore);
      expect(form.state.get().errors).toEqual({ email: ["Invalid"], root: ["Form failed"] });

      form.setServerErrors({ fieldErrors: { name: ["Taken"] }, formErrors: ["Server failed"] });
      await flushEffects();

      expect(name.state.get().errors).toEqual(["Taken"]);
      expect(email.state.get().errors).toEqual([]);
      expect(nickname.state.get()).toBe(nicknameBefore);
      expect(form.state.get().errors).toEqual({ name: ["Taken"], root: ["Server failed"] });
    } finally {
      dispose();
    }
  });

  it("keeps row keys and sibling array fields intact through array operations", async () => {
    const form = createForm({
      initialValues: { others: ["x"], tags: ["alpha", "beta", "gamma"] },
    });
    const tags = form.fieldArray("tags");
    const others = form.fieldArray("others");
    const dispose = effect(() => {
      tags.fields.get();
      others.fields.get();
    });

    try {
      await flushEffects();
      const keysByValue = new Map(
        tags.fields.get().map((row) => [String(row.value), row.key] as const),
      );
      const othersBefore = others.fields.get();

      await tags.move(0, 2);
      await tags.insert(1, "delta");
      await tags.remove(0);
      await flushEffects();

      const rows = tags.fields.get();
      expect(rows.map((row) => String(row.value))).toEqual(["delta", "gamma", "alpha"]);
      expect(rows[1]?.key).toBe(keysByValue.get("gamma"));
      expect(rows[2]?.key).toBe(keysByValue.get("alpha"));
      expect([...keysByValue.values()]).not.toContain(rows[0]?.key);
      expect(others.fields.get()).toBe(othersBefore);
    } finally {
      dispose();
    }
  });

  it("releases scoped array consumers while the form keeps deriving rows", async () => {
    const form = createForm({ initialValues: { tags: ["alpha"] } });
    const consumer = createCleanupScope();
    const seen: number[] = [];

    runWithCleanupScope(consumer, () => {
      effect(() => {
        seen.push(form.fieldArray("tags").fields.get().length);
      });
    });
    await flushEffects();
    await form.fieldArray("tags").append("beta");
    await flushEffects();
    consumer.dispose();
    await form.fieldArray("tags").append("gamma");
    await flushEffects();

    expect(seen).toEqual([1, 2]);
    expect(form.fieldArray("tags").fields.get().map((row) => String(row.value))).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("keeps the form state and a field snapshot coherent for one reader", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const email = form.field("email");
    const pairs = computed(() => {
      const formState = form.state.get();
      return `${String(formState.values.email)}|${email.state.get().value}`;
    });
    const seen: string[] = [];
    const dispose = effect(() => {
      seen.push(pairs.get());
    });

    try {
      await flushEffects();
      await email.setValue("ada@example.test");
      await flushEffects();
      await email.setValue("grace@example.test");
      await flushEffects();

      expect(seen).toEqual([
        "|",
        "ada@example.test|ada@example.test",
        "grace@example.test|grace@example.test",
      ]);
    } finally {
      dispose();
    }
  });
});
