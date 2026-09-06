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

const arrayForm = createForm({
  initialValues: {
    items: [{ id: "a" }],
    nullableFieldItems: [] as Array<{ id: string }> | null,
    nullableItems: [] as Array<{ id: string } | null> | undefined,
    nullishFieldItems: [] as Array<{ id: string }> | null | undefined,
    optionalItems: [] as { id: string }[] | undefined,
    nullOnly: null as null,
    undefinedOnly: undefined as undefined,
    nullishOnly: null as null | undefined,
    arrayOrScalar: [] as string[] | string,
    readonlyItems: ["a"] as readonly string[],
    title: "Mreact",
  },
});

arrayForm.fieldArray("items").append({ id: "b" });
arrayForm.fieldArray("nullableFieldItems").append({ id: "b" });
arrayForm.fieldArray("nullableItems").append(null);
arrayForm.fieldArray("nullableItems").append({ id: "b" });
arrayForm.fieldArray("nullishFieldItems").append({ id: "b" });
arrayForm.fieldArray("optionalItems").append({ id: "b" });
arrayForm.fieldArray("readonlyItems").append("b");

// @ts-expect-error Scalar fields cannot be used with fieldArray.
arrayForm.fieldArray("title");

// @ts-expect-error Null-only fields cannot be used with fieldArray.
arrayForm.fieldArray("nullOnly");

// @ts-expect-error Undefined-only fields cannot be used with fieldArray.
arrayForm.fieldArray("undefinedOnly");

// @ts-expect-error Nullish-only fields cannot be used with fieldArray.
arrayForm.fieldArray("nullishOnly");

// @ts-expect-error Array/scalar unions cannot be used with fieldArray.
arrayForm.fieldArray("arrayOrScalar");

const numberBinding = arrayForm.field("title").bind({
  format: (value) => value.length,
  parse: (value) => String(value),
});
const formattedLength: number = numberBinding.value;
void formattedLength;

const nullableTextForm = createForm({
  initialValues: { value: null as string | null },
});
const nullableTextBinding = nullableTextForm.field("value").bind({
  format: (value) => value ?? "",
});
const formattedNullableText: string = nullableTextBinding.value;
void formattedNullableText;

// @ts-expect-error A different binding output type requires a formatter.
arrayForm.field("title").bind<number>();

// @ts-expect-error A different binding output type requires a formatter.
arrayForm.field("title").bind<number>({ parse: (value) => Number(value) });

// @ts-expect-error A parser must return the field's model type.
arrayForm.field("title").bind({ parse: () => 123 });

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
