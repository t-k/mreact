import { createForm, type StandardSchemaV1 } from "../src/index.js";

const rawForm = createForm({
  initialValues: { count: "1" },
});

rawForm.submit((values) => values.count.toUpperCase());

// @ts-expect-error schema-less forms cannot claim a transformed submit type.
createForm<{ count: string }, { count: number }>({
  initialValues: { count: "1" },
});

const schemaForm = createForm<{ count: string }, { count: number }>({
  initialValues: { count: "1" },
  schema: standardSchema<{ count: string }, { count: number }>(),
});

schemaForm.submit((values) => values.count.toFixed());

function standardSchema<Input, Output>(): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate(value) {
        return { value: value as Output };
      },
      types: undefined as unknown as { input: Input; output: Output },
    },
  };
}
