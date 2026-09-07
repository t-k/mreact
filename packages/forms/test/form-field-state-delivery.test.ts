import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createForm } from "../src/index.js";

describe("field state delivery", () => {
  it("notifies a field subscriber when only the touched flag changes", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const email = form.field("email");
    const seen: boolean[] = [];
    const disposeEffect = effect(() => {
      seen.push(email.state.get().touched);
    });

    try {
      await flushEffects();
      await email.blur();
      await flushEffects();

      expect(seen).toEqual([false, true]);
    } finally {
      disposeEffect();
    }
  });

  it("notifies a field subscriber when only the validating flag changes", async () => {
    let settleValidation: ((errors: string[]) => void) | undefined;
    const pending = new Promise<string[]>((resolve) => {
      settleValidation = resolve;
    });
    const form = createForm({
      initialValues: { email: "" },
      validate: { email: () => pending },
      validateOn: "change",
    });
    const email = form.field("email");
    const seen: boolean[] = [];
    const disposeEffect = effect(() => {
      seen.push(email.state.get().validating);
    });

    try {
      await flushEffects();
      const settled = email.setValue("ada@example.test");
      await flushEffects();
      expect(seen).toEqual([false, true]);

      settleValidation?.([]);
      await settled;
      await flushEffects();

      expect(seen).toEqual([false, true, false]);
    } finally {
      disposeEffect();
    }
  });

  it("notifies a field subscriber when only the dirty flag changes", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const email = form.field("email");
    await email.setValue("ada@example.test");
    const seen: boolean[] = [];
    const disposeEffect = effect(() => {
      seen.push(email.state.get().dirty);
    });

    try {
      await flushEffects();
      form.reset({ email: "ada@example.test" });
      await flushEffects();

      expect(seen).toEqual([true, false]);
      expect(email.state.get().value).toBe("ada@example.test");
    } finally {
      disposeEffect();
    }
  });

  it("notifies a field subscriber when only the field errors change", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const email = form.field("email");
    const seen: string[][] = [];
    const disposeEffect = effect(() => {
      seen.push(email.state.get().errors);
    });

    try {
      await flushEffects();
      form.setErrors({ email: ["Required"] });
      await flushEffects();

      expect(seen).toEqual([[], ["Required"]]);
    } finally {
      disposeEffect();
    }
  });

  it("notifies a field subscriber when only the field value changes", async () => {
    const form = createForm({ initialValues: { email: "" } });
    const email = form.field("email");
    await email.setValue("ada@example.test");
    const seen: string[] = [];
    const disposeEffect = effect(() => {
      seen.push(email.state.get().value);
    });

    try {
      await flushEffects();
      await email.setValue("grace@example.test");
      await flushEffects();

      expect(seen).toEqual(["ada@example.test", "grace@example.test"]);
      expect(email.state.get().dirty).toBe(true);
    } finally {
      disposeEffect();
    }
  });

  it("does not validate a field on blur when validation runs on submit", async () => {
    let calls = 0;
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email: () => {
          calls += 1;
          return ["Required"];
        },
      },
    });
    const email = form.field("email");

    await email.blur();
    await flushEffects();

    expect(calls).toBe(0);
    expect(email.state.get()).toMatchObject({ errors: [], touched: true });
  });

  it("notifies an array subscriber when row values are reordered", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta"] } });
    const tags = form.fieldArray("tags");
    const seen: string[][] = [];
    const disposeEffect = effect(() => {
      seen.push(tags.fields.get().map((row) => String(row.value)));
    });

    try {
      await flushEffects();
      await tags.swap(0, 1);
      await flushEffects();

      expect(seen).toEqual([
        ["alpha", "beta"],
        ["beta", "alpha"],
      ]);
    } finally {
      disposeEffect();
    }
  });

  it("notifies an array subscriber when only row keys are reordered", async () => {
    const form = createForm({ initialValues: { tags: ["same", "same"] } });
    const tags = form.fieldArray("tags");
    const seen: string[][] = [];
    const disposeEffect = effect(() => {
      seen.push(tags.fields.get().map((row) => row.key));
    });

    try {
      await flushEffects();
      await tags.swap(0, 1);
      await flushEffects();

      expect(seen).toHaveLength(2);
      expect(seen[1]).toEqual([seen[0]?.[1], seen[0]?.[0]]);
    } finally {
      disposeEffect();
    }
  });

  it("notifies an array subscriber when a row is appended and when one is removed", async () => {
    const form = createForm({ initialValues: { tags: ["alpha"] } });
    const tags = form.fieldArray("tags");
    const seen: number[] = [];
    const disposeEffect = effect(() => {
      seen.push(tags.fields.get().length);
    });

    try {
      await flushEffects();
      await tags.append("beta");
      await flushEffects();
      await tags.remove(0);
      await flushEffects();

      expect(seen).toEqual([1, 2, 1]);
    } finally {
      disposeEffect();
    }
  });

  it("does not notify an array subscriber when an array update leaves every row unchanged", async () => {
    const form = createForm({ initialValues: { tags: ["alpha", "beta"] } });
    const tags = form.fieldArray("tags");
    let notifications = 0;
    const disposeEffect = effect(() => {
      tags.fields.get();
      notifications += 1;
    });

    try {
      await flushEffects();
      await tags.swap(0, 0);
      await tags.move(1, 1);
      await flushEffects();

      expect(notifications).toBe(1);
      expect(tags.fields.get().map((row) => String(row.value))).toEqual(["alpha", "beta"]);
    } finally {
      disposeEffect();
    }
  });
});
