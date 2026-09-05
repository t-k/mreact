import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createForm } from "../src/index.js";
import type { StandardSchemaV1 } from "../src/index.js";

describe("createForm", () => {
  it("tracks field values, dirty state, and touched state", () => {
    const form = createForm({
      initialValues: { email: "", name: "" },
    });
    const email = form.field("email");

    email.setValue("ada@example.test");
    email.blur();

    expect(form.getValues()).toEqual({
      email: "ada@example.test",
      name: "",
    });
    expect(email.state.get()).toMatchObject({
      dirty: true,
      touched: true,
      value: "ada@example.test",
    });
    expect(form.state.get()).toMatchObject({
      dirty: true,
      touched: { email: true },
    });
  });

  it("creates field bindings that update values and blur state from events", async () => {
    const form = createForm({
      initialValues: { accepted: false, email: "" },
    });
    const email = form.field("email");
    const accepted = form.field("accepted");

    await email
      .bind()
      .onInput({ currentTarget: { value: "ada@example.test" } } as unknown as Event);
    await accepted
      .bind({ event: "change" })
      .onChange({ currentTarget: { checked: true, type: "checkbox" } } as unknown as Event);
    await email
      .bind()
      .onBlur({ currentTarget: { value: "ignored@example.test" } } as unknown as Event);

    expect(form.getValues()).toEqual({
      accepted: true,
      email: "ada@example.test",
    });
    expect(email.state.get()).toMatchObject({
      touched: true,
      value: "ada@example.test",
    });
  });

  it("reads standard form control values from the control kind", async () => {
    const birthday = new Date("2001-02-03T00:00:00.000Z");
    const files = { 0: { name: "avatar.png" }, length: 1 } as unknown as FileList;
    const form = createForm({
      initialValues: {
        accepted: false,
        avatar: null as FileList | null,
        birthday: null as Date | null,
        localMeeting: "",
        languages: [] as string[],
        newsletter: undefined as boolean | undefined,
        nullableConsent: null as boolean | null,
        seats: 0,
        title: "",
      },
    });

    const newsletter = form.field("newsletter").bind({ event: "change" });
    const nullableConsent = form.field("nullableConsent").bind({ event: "change" });
    await newsletter.onChange({
      currentTarget: { checked: true, type: "checkbox", value: "on" },
    } as unknown as Event);
    expect(form.getValues().newsletter).toBe(true);
    await newsletter.onChange({
      currentTarget: { checked: false, type: "checkbox", value: "on" },
    } as unknown as Event);
    await nullableConsent.onChange({
      currentTarget: { checked: true, type: "checkbox", value: "on" },
    } as unknown as Event);
    expect(form.getValues().nullableConsent).toBe(true);
    await nullableConsent.onChange({
      currentTarget: { checked: false, type: "checkbox", value: "on" },
    } as unknown as Event);
    await form
      .field("accepted")
      .bind({ event: "change" })
      .onChange({ currentTarget: { checked: true, type: "checkbox" } } as unknown as Event);
    await form
      .field("seats")
      .bind()
      .onInput({
        currentTarget: { type: "number", value: "3", valueAsNumber: 3 },
      } as unknown as Event);
    await form
      .field("birthday")
      .bind({ event: "change" })
      .onChange({ currentTarget: { type: "date", valueAsDate: birthday } } as unknown as Event);
    await form
      .field("localMeeting")
      .bind({ event: "change" })
      .onChange({
        currentTarget: {
          type: "datetime-local",
          value: "2001-02-03T04:05",
          valueAsDate: null,
        },
      } as unknown as Event);
    await form
      .field("avatar")
      .bind({ event: "change" })
      .onChange({
        currentTarget: { files, type: "file", value: "C:\\fakepath\\avatar.png" },
      } as unknown as Event);
    await form
      .field("languages")
      .bind({ event: "change" })
      .onChange({
        currentTarget: {
          multiple: true,
          selectedOptions: [{ value: "ja" }, { value: "en" }],
          type: "select-multiple",
          value: "ja",
        },
      } as unknown as Event);
    await form
      .field("title")
      .bind()
      .onInput({ currentTarget: { type: "text", value: "Mreact" } } as unknown as Event);

    expect(form.getValues()).toEqual({
      accepted: true,
      avatar: files,
      birthday,
      languages: ["ja", "en"],
      localMeeting: "2001-02-03T04:05",
      newsletter: false,
      nullableConsent: false,
      seats: 3,
      title: "Mreact",
    });
  });

  it("keeps nested values isolated from callers and other forms", async () => {
    const defaults = {
      address: { city: "Tokyo" },
      tags: ["docs"],
    };
    const first = createForm({ initialValues: defaults });
    const second = createForm({ initialValues: defaults });

    const returned = first.getValues();
    expect(returned).not.toBe(first.state.get().values);
    expect(first.field("address").state.get().dirty).toBe(false);
    returned.address.city = "Kyoto";
    returned.tags.push("router");
    await first.setValue("address", { city: "Osaka" });

    expect(first.getValues()).toEqual({ address: { city: "Osaka" }, tags: ["docs"] });
    expect(first.state.get().dirty).toBe(true);
    expect(first.field("address").state.get().dirty).toBe(true);
    expect(second.getValues()).toEqual(defaults);
    expect(defaults).toEqual({ address: { city: "Tokyo" }, tags: ["docs"] });
  });

  it("takes ownership of reset and setValue inputs", async () => {
    const form = createForm({ initialValues: { profile: { name: "Ada" } } });
    const resetValues = { profile: { name: "Grace" } };
    form.reset(resetValues);
    resetValues.profile.name = "mutated reset";
    expect(form.getValues()).toEqual({ profile: { name: "Grace" } });

    const nextProfile = { name: "Lin" };
    await form.setValue("profile", nextProfile);
    nextProfile.name = "mutated setValue";

    expect(form.getValues()).toEqual({ profile: { name: "Lin" } });
  });

  it("clears nested dirty state when restoring the initial snapshot reference", async () => {
    const form = createForm({ initialValues: { profile: { name: "Ada" } } });
    const initialProfile = form.state.get().initialValues.profile;

    await form.setValue("profile", { name: "Grace" });
    expect(form.state.get().dirty).toBe(true);
    expect(form.field("profile").state.get().dirty).toBe(true);

    await form.setValue("profile", initialProfile);

    expect(form.getValues()).toEqual({ profile: { name: "Ada" } });
    expect(form.state.get().dirty).toBe(false);
    expect(form.field("profile").state.get().dirty).toBe(false);
  });

  it("rejects non-cloneable initial values instead of sharing them", () => {
    expect(() =>
      createForm({
        initialValues: { formatter: () => "unsafe shared closure" },
      }),
    ).toThrow();
  });

  it("keeps committed value and dirty state after setValue rejects a non-cloneable value", async () => {
    const form = createForm({
      initialValues: { config: {} as { formatter?: (() => string) | undefined } },
    });

    await expect(
      form.setValue("config", { formatter: () => "cannot be cloned" }),
    ).rejects.toThrow();
    await form.field("config").blur();

    expect(form.getValues()).toEqual({ config: {} });
    expect(form.state.get().dirty).toBe(false);
    expect(form.field("config").state.get().dirty).toBe(false);
  });

  it("field binding value reflects setValue and reset after bind time", async () => {
    const form = createForm({
      initialValues: { email: "" },
    });
    const binding = form.field("email").bind();

    expect(binding.value).toBe("");
    await form.setValue("email", "ada@example.test");
    expect(binding.value).toBe("ada@example.test");

    form.reset({ email: "grace@example.test" });
    expect(binding.value).toBe("grace@example.test");
  });

  it("field binding updates only on the configured event", async () => {
    const form = createForm({
      initialValues: { email: "" },
    });
    const binding = form.field("email").bind({ event: "change" });

    await binding.onInput({ currentTarget: { value: "ignored@example.test" } } as unknown as Event);
    expect(binding.value).toBe("");

    await binding.onChange({ currentTarget: { value: "ada@example.test" } } as unknown as Event);
    expect(binding.value).toBe("ada@example.test");
  });

  it("supports typed parse and format functions at the DOM boundary", async () => {
    const form = createForm({
      initialValues: { amount: 0 },
    });
    const binding = form.field("amount").bind({
      format: (value) => String(value),
      parse: (value) => Number(value),
    });

    expect(binding.value).toBe("0");
    await binding.onInput({ currentTarget: { value: "42", type: "text" } } as unknown as Event);

    expect(form.getValues()).toEqual({ amount: 42 });
    expect(binding.value).toBe("42");
  });

  it("preserves explicit null results from parse and format callbacks", async () => {
    const form = createForm({
      initialValues: { value: null as string | null },
    });
    const binding = form.field("value").bind({
      format: () => null,
      parse: () => null,
    });

    expect(binding.value).toBeNull();
    await binding.onInput({ currentTarget: { value: "ignored", type: "text" } } as unknown as Event);

    expect(form.getValues()).toEqual({ value: null });
    expect(binding.value).toBeNull();
  });

  it("rejects incompatible inferred DOM values and invalid numbers before commit", async () => {
    const form = createForm({
      initialValues: { amount: 1, title: "initial" },
    });

    await expect(
      form
        .field("title")
        .bind()
        .onInput({ currentTarget: { type: "number", valueAsNumber: 2 } } as unknown as Event),
    ).rejects.toThrow(/type/i);
    await expect(
      form
        .field("amount")
        .bind()
        .onInput({ currentTarget: { type: "number", valueAsNumber: Number.NaN } } as unknown as Event),
    ).rejects.toThrow(/number/i);

    expect(form.getValues()).toEqual({ amount: 1, title: "initial" });
  });

  it("validates fields on change and clears stale field errors", async () => {
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email(value) {
          return typeof value === "string" && value.includes("@") ? [] : ["Enter an email address"];
        },
      },
      validateOn: "change",
    });

    form.setValue("email", "bad");
    await flushEffects();
    expect(form.field("email").state.get().errors).toEqual(["Enter an email address"]);

    form.setValue("email", "ada@example.test");
    await flushEffects();
    expect(form.field("email").state.get().errors).toEqual([]);
  });

  it("revalidates dependent fields declared by validator deps on change", async () => {
    const form = createForm({
      initialValues: { confirmPassword: "", password: "" },
      validate: {
        confirmPassword: {
          deps: ["password"],
          validate(value, values) {
            return value === values.password ? [] : ["Passwords must match"];
          },
        },
      },
      validateOn: "change",
    });

    await form.setValue("confirmPassword", "old-secret");
    expect(form.field("confirmPassword").state.get().errors).toEqual(["Passwords must match"]);

    await form.setValue("password", "old-secret");

    expect(form.field("confirmPassword").state.get().errors).toEqual([]);
  });

  it("does not revalidate unrelated fields without declared deps", async () => {
    let confirmValidations = 0;
    const form = createForm({
      initialValues: { confirmPassword: "", password: "" },
      validate: {
        confirmPassword(value, values) {
          confirmValidations += 1;
          return value === values.password ? [] : ["Passwords must match"];
        },
      },
      validateOn: "change",
    });

    await form.setValue("confirmPassword", "old-secret");
    await form.setValue("password", "old-secret");

    expect(confirmValidations).toBe(1);
    expect(form.field("confirmPassword").state.get().errors).toEqual(["Passwords must match"]);
  });

  it("manages array fields with stable row keys across mutations", async () => {
    const form = createForm({
      initialValues: { items: ["A", "B"] },
    });
    const items = form.fieldArray("items");
    const initial = items.fields.get();

    await items.append("C");
    const appended = items.fields.get();
    await items.move(2, 0);
    const moved = items.fields.get();
    await items.remove(1);
    const removed = items.fields.get();

    expect(initial.map((row) => row.value)).toEqual(["A", "B"]);
    expect(appended.map((row) => row.value)).toEqual(["A", "B", "C"]);
    expect(moved.map((row) => row.value)).toEqual(["C", "A", "B"]);
    expect(moved[0]?.key).toBe(appended[2]?.key);
    expect(moved[1]?.key).toBe(initial[0]?.key);
    expect(removed.map((row) => row.value)).toEqual(["C", "B"]);
    expect(removed.map((row) => row.key)).toEqual([appended[2]?.key, initial[1]?.key]);
  });

  it("rejects scalar fieldArray values without mutating the scalar field", () => {
    const form = createForm({
      initialValues: { count: 1, items: ["A"] },
    });

    expect(() => form.fieldArray("count" as never)).toThrow(/array/i);
    expect(form.getValues()).toEqual({ count: 1, items: ["A"] });
  });

  it("rejects an optional array field when its current value is undefined", () => {
    const form = createForm({
      initialValues: { items: undefined as string[] | undefined },
    });

    expect(() => form.fieldArray("items")).toThrow(/array/i);
    expect(form.getValues()).toEqual({ items: undefined });
  });

  it("validates array fields after fieldArray updates", async () => {
    const form = createForm({
      initialValues: { tags: [] as string[] },
      validate: {
        tags(value) {
          return value.length === 0 ? ["Add at least one tag"] : [];
        },
      },
      validateOn: "change",
    });
    const tags = form.fieldArray("tags");

    await tags.remove(0);
    expect(form.field("tags").state.get().errors).toEqual(["Add at least one tag"]);

    await tags.append("docs");
    expect(form.field("tags").state.get().errors).toEqual([]);
  });

  it("keeps change validation state notifications bounded for large forms", async () => {
    const initialValues = Object.fromEntries(
      Array.from({ length: 30 }, (_unused, index) => [`field${index}`, ""]),
    ) as Record<string, string>;
    const form = createForm({
      initialValues,
      validate: {
        field0(value) {
          return value === "" ? ["Required"] : [];
        },
      },
      validateOn: "change",
    });
    let notifications = 0;
    const dispose = effect(() => {
      form.state.get();
      notifications += 1;
    });

    try {
      await form.setValue("field0", "Ada");
      await flushEffects();

      expect(notifications).toBeLessThanOrEqual(3);
    } finally {
      dispose();
    }
  });

  it("does not notify a field state subscriber when another field changes", async () => {
    const form = createForm({
      initialValues: { email: "", name: "" },
    });
    const email = form.field("email");
    let notifications = 0;
    const dispose = effect(() => {
      email.state.get();
      notifications += 1;
    });

    try {
      await flushEffects();
      await form.setValue("name", "Ada");
      await flushEffects();

      expect(notifications).toBe(1);
    } finally {
      dispose();
    }
  });

  it("does not notify a field array subscriber when another field changes", async () => {
    const form = createForm({
      initialValues: { items: ["A"], name: "" },
    });
    const items = form.fieldArray("items");
    let notifications = 0;
    const dispose = effect(() => {
      items.fields.get();
      notifications += 1;
    });

    try {
      await flushEffects();
      await form.setValue("name", "Ada");
      await flushEffects();

      expect(notifications).toBe(1);
    } finally {
      dispose();
    }
  });

  it("updates one field without rescanning every value for dirty state", async () => {
    const initialValues = Object.fromEntries(
      Array.from({ length: 30 }, (_unused, index) => [`field${index}`, ""]),
    ) as Record<string, string>;
    const form = createForm({
      initialValues,
      validate: {
        field0(value) {
          return value === "" ? ["Required"] : [];
        },
      },
      validateOn: "change",
    });
    const originalKeys = Object.keys;
    let objectKeysCalls = 0;
    Object.keys = ((value) => {
      objectKeysCalls += 1;
      return originalKeys(value);
    }) as typeof Object.keys;

    try {
      await form.setValue("field0", "Ada");
    } finally {
      Object.keys = originalKeys;
    }

    expect(objectKeysCalls).toBe(0);
  });

  it("tracks field validating state and ignores stale async validator results", async () => {
    let resolveFirst: ((errors: string[]) => void) | undefined;
    let resolveSecond: ((errors: string[]) => void) | undefined;
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email(value) {
          return new Promise<string[]>((resolve) => {
            if (value === "first") {
              resolveFirst = resolve;
            } else {
              resolveSecond = resolve;
            }
          });
        },
      },
      validateOn: "change",
    });
    const email = form.field("email");

    const first = email.setValue("first");
    expect(email.state.get().validating).toBe(true);

    const second = email.setValue("second");
    resolveSecond?.([]);
    await second;
    expect(email.state.get()).toMatchObject({
      errors: [],
      validating: false,
      value: "second",
    });

    resolveFirst?.(["first is stale"]);
    await first;
    expect(email.state.get()).toMatchObject({
      errors: [],
      validating: false,
      value: "second",
    });
  });

  it("discards blur validation when the field value changes without change validation", async () => {
    let resolveValidation: ((errors: string[]) => void) | undefined;
    const form = createForm({
      initialValues: { username: "ada" },
      validate: {
        username() {
          return new Promise<string[]>((resolve) => {
            resolveValidation = resolve;
          });
        },
      },
      validateOn: ["blur", "submit"],
    });

    const pending = form.field("username").blur();
    expect(form.field("username").state.get().validating).toBe(true);

    await form.field("username").setValue("grace");
    expect(form.field("username").state.get().validating).toBe(false);
    resolveValidation?.(["ada is already taken"]);
    await pending;

    expect(form.field("username").state.get()).toMatchObject({
      errors: [],
      validating: false,
      value: "grace",
    });
  });

  it("keeps blur validation current when setValue receives the same value", async () => {
    let resolveValidation: ((errors: string[]) => void) | undefined;
    const form = createForm({
      initialValues: { username: "ada" },
      validate: {
        username() {
          return new Promise<string[]>((resolve) => {
            resolveValidation = resolve;
          });
        },
      },
      validateOn: ["blur", "submit"],
    });

    const pending = form.field("username").blur();
    await form.field("username").setValue("ada");
    resolveValidation?.(["ada is already taken"]);
    await pending;

    expect(form.field("username").state.get()).toMatchObject({
      errors: ["ada is already taken"],
      validating: false,
      value: "ada",
    });
  });

  it.each([
    [
      "synchronous",
      () => {
        throw new Error("username service unavailable");
      },
    ],
    ["asynchronous", async () => Promise.reject(new Error("username service unavailable"))],
  ])(
    "captures %s field validator failures without leaving validating set",
    async (_label, fail) => {
      const form = createForm({
        initialValues: { username: "" },
        validate: {
          username() {
            return fail();
          },
        },
        validateOn: "change",
      });

      await expect(
        form
          .field("username")
          .bind()
          .onInput({ currentTarget: { value: "ada" } } as unknown as Event),
      ).resolves.toBeUndefined();

      expect(form.field("username").state.get()).toMatchObject({
        errors: ["username service unavailable"],
        validating: false,
      });
    },
  );

  it("returns validation and submit errors when a schema rejects", async () => {
    const failure = new Error("schema service unavailable");
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: async () => Promise.reject(failure),
        types: undefined as unknown as { input: { email: string }; output: { email: string } },
      },
    };
    const form = createForm({ initialValues: { email: "" }, schema });

    await expect(form.validate()).resolves.toEqual({ error: failure, success: false });
    await expect(form.submit(() => "saved")).resolves.toEqual({ error: failure, status: "error" });
    expect(form.state.get().errors).toEqual({ root: ["schema service unavailable"] });
  });

  it("preserves schema-owned output types without exposing form state", async () => {
    const urlSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => ({ value: new URL("https://example.test/profile") }),
        types: undefined as unknown as { input: { slug: string }; output: URL },
      },
    };
    const urlForm = createForm({ initialValues: { slug: "ada" }, schema: urlSchema });

    const urlValidation = await urlForm.validate();
    expect(urlValidation.success).toBe(true);
    if (urlValidation.success) {
      expect(urlValidation.value).toBeInstanceOf(URL);
      expect(urlValidation.value.href).toBe("https://example.test/profile");
    }

    const passThroughSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => ({ value: value as { profile: { name: string } } }),
        types: undefined as unknown as {
          input: { profile: { name: string } };
          output: { profile: { name: string } };
        },
      },
    };
    const passThroughForm = createForm({
      initialValues: { profile: { name: "Ada" } },
      schema: passThroughSchema,
    });
    const passThroughValidation = await passThroughForm.validate();
    expect(passThroughValidation.success).toBe(true);
    if (passThroughValidation.success) {
      passThroughValidation.value.profile.name = "mutated output";
    }
    expect(passThroughForm.getValues()).toEqual({ profile: { name: "Ada" } });
  });

  it("reset restores initial values and clears touched, errors, and submit state", async () => {
    const form = createForm({
      initialValues: { email: "", name: "" },
      validate: {
        email(value) {
          return value === "" ? ["Email is required"] : [];
        },
      },
      validateOn: "change",
    });

    await form.field("email").setValue("");
    await form.field("name").blur();
    await form.submit(() => "submitted");

    form.reset({ email: "ada@example.test", name: "Ada" });

    expect(form.getValues()).toEqual({
      email: "ada@example.test",
      name: "Ada",
    });
    expect(form.state.get()).toMatchObject({
      dirty: false,
      errors: {},
      initialValues: { email: "ada@example.test", name: "Ada" },
      submitCount: 0,
      touched: {},
      valid: true,
    });
  });

  it("reset ignores in-flight async field validation results", async () => {
    let resolveValidation: ((errors: string[]) => void) | undefined;
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email() {
          return new Promise<string[]>((resolve) => {
            resolveValidation = resolve;
          });
        },
      },
      validateOn: "change",
    });

    const pending = form.field("email").setValue("stale@example.test");
    expect(form.field("email").state.get().validating).toBe(true);

    form.reset({ email: "fresh@example.test" });
    resolveValidation?.(["stale error"]);
    await pending;

    expect(form.state.get()).toMatchObject({
      errors: {},
      validating: {},
      values: { email: "fresh@example.test" },
    });
  });

  it("validate ignores older in-flight field validation results", async () => {
    let resolveFieldValidation: ((errors: string[]) => void) | undefined;
    let validationCalls = 0;
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email() {
          validationCalls += 1;
          if (validationCalls === 1) {
            return new Promise<string[]>((resolve) => {
              resolveFieldValidation = resolve;
            });
          }

          return ["submit validation failed"];
        },
      },
      validateOn: "change",
    });

    const pendingFieldValidation = form.field("email").setValue("late@example.test");
    expect(form.field("email").state.get().validating).toBe(true);

    await expect(form.validate()).resolves.toEqual({
      errors: { email: ["submit validation failed"] },
      success: false,
    });
    expect(form.field("email").state.get().errors).toEqual(["submit validation failed"]);

    resolveFieldValidation?.([]);
    await pendingFieldValidation;

    expect(form.field("email").state.get().errors).toEqual(["submit validation failed"]);
  });

  it("merges field-level and schema validation errors for the same field", async () => {
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email() {
          return ["Field validator failed"];
        },
      },
      schema: standardSchema<{ email: string }>(() => ({
        issues: [{ message: "Schema validator failed", path: ["email"] }],
      })),
    });

    const result = await form.validate();

    expect(result).toEqual({
      errors: {
        email: ["Field validator failed", "Schema validator failed"],
      },
      success: false,
    });
    expect(form.field("email").state.get().errors).toEqual([
      "Field validator failed",
      "Schema validator failed",
    ]);
  });

  it("keeps the latest value when three async field validations resolve out of order", async () => {
    const resolvers = new Map<string, (errors: string[]) => void>();
    const form = createForm({
      initialValues: { email: "" },
      validate: {
        email(value) {
          return new Promise<string[]>((resolve) => {
            resolvers.set(String(value), resolve);
          });
        },
      },
      validateOn: "change",
    });

    const first = form.field("email").setValue("first");
    const second = form.field("email").setValue("second");
    const third = form.field("email").setValue("third");

    resolvers.get("second")?.(["second is stale"]);
    await second;
    resolvers.get("third")?.([]);
    await third;
    resolvers.get("first")?.(["first is stale"]);
    await first;

    expect(form.field("email").state.get()).toMatchObject({
      errors: [],
      validating: false,
      value: "third",
    });
  });

  it("validates a Standard Schema and narrows submit values to schema output", async () => {
    const schema = standardSchema<{ count: string }, { count: number }>((value) => {
      const input = value as { count: string };
      const count = Number(input.count);

      return Number.isFinite(count)
        ? { value: { count } }
        : {
            issues: [{ message: "Count must be numeric", path: ["count"] }],
          };
    });
    const form = createForm({
      initialValues: { count: "1" },
      schema,
    });
    const result = await form.validate();

    if (!result.success) {
      throw new Error("Expected validation to pass");
    }

    expect(result.value.count).toBe(1);
  });

  it("maps Standard Schema issues into field errors", async () => {
    const form = createForm({
      initialValues: { email: "" },
      schema: standardSchema<{ email: string }>(() => ({
        issues: [
          { message: "Email is required", path: [{ key: "email" }] },
          { message: "Form is invalid" },
        ],
      })),
    });

    const result = await form.validate();

    expect(result).toEqual({
      errors: {
        email: ["Email is required"],
        root: ["Form is invalid"],
      },
      success: false,
    });
    expect(form.state.get().errors).toEqual({
      email: ["Email is required"],
      root: ["Form is invalid"],
    });
  });

  it("maps dangerous Standard Schema issue path keys to root errors", async () => {
    const form = createForm({
      initialValues: { email: "" },
      schema: standardSchema<{ email: string }>(() => ({
        issues: [
          { message: "Prototype key is invalid", path: ["__proto__"] },
          { message: "Constructor key is invalid", path: [{ key: "constructor" }] },
        ],
      })),
    });

    const result = await form.validate();

    expect(result).toEqual({
      errors: {
        root: ["Prototype key is invalid", "Constructor key is invalid"],
      },
      success: false,
    });
    expect(form.state.get().errors).toEqual({
      root: ["Prototype key is invalid", "Constructor key is invalid"],
    });
  });

  it("aggregates many Standard Schema issues for one field without quadratic copying", async () => {
    const issues = Array.from({ length: 20_000 }, (_unused, index) => ({
      message: `Issue ${index}`,
      path: ["email"],
    }));
    const form = createForm({
      initialValues: { email: "" },
      schema: standardSchema<{ email: string }>(() => ({ issues })),
    });
    const startedAt = performance.now();

    const result = await form.validate();

    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(result).toEqual({
      errors: {
        email: issues.map((issue) => issue.message),
      },
      success: false,
    });
    expect(form.field("email").state.get().errors).toEqual(issues.map((issue) => issue.message));
  });

  it("submits schema output and tracks submit state", async () => {
    const form = createForm({
      initialValues: { count: "2" },
      schema: standardSchema<{ count: string }, { count: number }>((value) => ({
        value: { count: Number((value as { count: string }).count) },
      })),
    });

    const result = await form.submit(async (values) => ({
      doubled: values.count * 2,
    }));

    expect(result).toEqual({
      data: { doubled: 4 },
      status: "success",
    });
    expect(form.state.get()).toMatchObject({
      submitCount: 1,
      submitting: false,
    });
  });

  it("reports synchronous double submit calls as duplicate while the first submission runs", async () => {
    const form = createForm({
      initialValues: { email: "ada@example.test" },
    });
    const deferred = createDeferred<string>();
    let calls = 0;

    const first = form.submit(async () => {
      calls += 1;
      return deferred.promise;
    });
    const second = form.submit(async () => {
      calls += 1;
      return "duplicate";
    });

    expect(calls).toBe(0);
    expect(form.state.get()).toMatchObject({
      submitCount: 1,
      submitting: true,
    });

    await expect(second).resolves.toEqual({ status: "duplicate" });
    expect(calls).toBe(1);
    expect(form.state.get()).toMatchObject({
      submitCount: 1,
      submitting: true,
    });

    deferred.resolve("saved");

    await expect(first).resolves.toEqual({ data: "saved", status: "success" });
    expect(form.state.get()).toMatchObject({
      submitCount: 1,
      submitting: false,
    });
  });

  it("allows sequential submits after the previous submission settles", async () => {
    const form = createForm({
      initialValues: { email: "ada@example.test" },
    });
    let calls = 0;

    await expect(
      form.submit(() => {
        calls += 1;
        return "first";
      }),
    ).resolves.toEqual({ data: "first", status: "success" });
    await expect(
      form.submit(() => {
        calls += 1;
        return "second";
      }),
    ).resolves.toEqual({ data: "second", status: "success" });

    expect(calls).toBe(2);
    expect(form.state.get()).toMatchObject({
      submitCount: 2,
      submitting: false,
    });
  });

  it("allows a new submit after reset without letting the old submit release its lock", async () => {
    const form = createForm({
      initialValues: { email: "ada@example.test" },
    });
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();
    let calls = 0;

    const first = form.submit(() => {
      calls += 1;
      return firstDeferred.promise;
    });
    await Promise.resolve();
    form.reset();
    const second = form.submit(() => {
      calls += 1;
      return secondDeferred.promise;
    });
    await Promise.resolve();

    expect(calls).toBe(2);
    firstDeferred.resolve("first");
    await first;
    expect(form.state.get().submitting).toBe(true);
    await expect(form.submit(() => "third")).resolves.toEqual({ status: "duplicate" });

    secondDeferred.resolve("second");
    await second;
    expect(form.state.get().submitting).toBe(false);
  });

  it("does not apply submit validation that settles after reset", async () => {
    const validation = createDeferred<string[]>();
    let validationCalls = 0;
    const form = createForm({
      initialValues: { email: "old@example.test" },
      validate: {
        email() {
          validationCalls += 1;
          return validationCalls === 1 ? validation.promise : [];
        },
      },
    });

    const staleSubmit = form.submit(() => "stale");
    form.reset({ email: "fresh@example.test" });
    await expect(form.submit(() => "fresh")).resolves.toEqual({
      data: "fresh",
      status: "success",
    });

    validation.resolve(["stale error"]);
    await staleSubmit;

    expect(form.state.get()).toMatchObject({
      errors: {},
      submitting: false,
      values: { email: "fresh@example.test" },
    });
  });

  it("does not submit invalid values", async () => {
    const form = createForm({
      initialValues: { email: "" },
      schema: standardSchema<{ email: string }>(() => ({
        issues: [{ message: "Email is required", path: ["email"] }],
      })),
    });
    let called = false;

    const result = await form.submit(() => {
      called = true;
      return "submitted";
    });

    expect(result).toEqual({
      errors: { email: ["Email is required"] },
      status: "invalid",
    });
    expect(called).toBe(false);
  });

  it("maps server action errors into field and root errors", () => {
    const form = createForm({
      initialValues: { email: "", name: "" },
    });

    form.setServerErrors({
      fieldErrors: {
        email: ["Already registered"],
      },
      formErrors: ["Try again later"],
    });

    expect(form.state.get().errors).toEqual({
      email: ["Already registered"],
      root: ["Try again later"],
    });
    expect(form.field("email").state.get().errors).toEqual(["Already registered"]);
  });

  it("ignores prototype-pollution keys in server action errors", () => {
    const form = createForm({
      initialValues: { email: "" },
    });
    const fieldErrors = JSON.parse(
      '{"__proto__":["polluted"],"constructor":["polluted"],"prototype":["polluted"],"email":["Invalid"]}',
    ) as Record<string, readonly string[]>;

    form.setServerErrors({
      fieldErrors: fieldErrors as never,
    });

    expect(form.state.get().errors).toEqual({ email: ["Invalid"] });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

function standardSchema<Input, Output = Input>(
  validate: (value: unknown) => StandardSchemaV1.Result<Output>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate,
      types: undefined as unknown as { input: Input; output: Output },
    },
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
