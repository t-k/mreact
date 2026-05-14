import { describe, expect, it } from "vitest";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { createForm } from "../src/index.js";

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
});

function standardSchema<Input, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | { value: Output; issues?: undefined }
    | { issues: Array<{ message: string; path?: readonly unknown[] }> },
) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate,
      types: undefined as unknown as { input: Input; output: Output },
    },
  };
}
