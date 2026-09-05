# @reckona/mreact-forms

`@reckona/mreact-forms` provides form state and validation utilities for mreact.
It tracks field values, dirty/touched state, client validation, and server
errors through a small reactive API.

## Basic Usage

```ts
import { createForm } from "@reckona/mreact-forms";

const form = createForm({
  initialValues: { email: "" },
  validate: {
    email(value) {
      return value.includes("@") ? undefined : "Invalid email";
    },
  },
});

await form.field("email").setValue("ada@example.test");
await form.validate();
```

Fields also expose a binding helper for components that want the usual value and event props in one place:

```ts
const email = form.field("email");
const binding = email.bind();

input({
  value: binding.value,
  onInput: binding.onInput,
  onBlur: binding.onBlur,
});
```

Use `field.bind({ event: "change" })` for controls such as `<select>` that should update on change instead of input. Pass `parse` and `format` when the control representation differs from the field type; their declared field type is preserved at the DOM boundary, including explicit `null` and `undefined` results. `binding.value` is read live from form state, so repeated reads after validation or reset return the current value.

Bindings read values from the DOM control kind. Text and `datetime-local` controls emit strings, checkboxes emit booleans, number and range inputs emit numbers, date, month, time, and week inputs emit `Date | null`, file inputs emit `FileList | null`, and multiple selects emit `string[]`. Match the field's TypeScript value type to the control you bind; use an explicit event handler with `field.setValue()` when a custom component needs different conversion semantics.

Form values must be compatible with the platform `structuredClone()` algorithm. The form takes ownership-safe copies of initial, reset, and `setValue()` inputs, and `getValues()` returns a deep copy that callers may normalize without mutating committed form state. Unsupported form values such as functions fail when they cross one of these boundaries instead of being shared silently. A Standard Schema may still produce a non-cloneable submit value because transformed output is owned by the schema and is not retained in form state.

## Valibot And Standard Schema

`createForm` accepts Standard Schema compatible validators through the
`schema` option. Valibot and Zod v4 expose Standard Schema metadata directly,
so schemas can be passed without an adapter. The form state keeps input values,
while `submit()` receives the schema output after transforms run.

```ts
import { createForm } from "@reckona/mreact-forms";
import * as v from "valibot";

const signupSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email("Enter a valid email.")),
  seats: v.pipe(
    v.string(),
    v.trim(),
    v.toNumber("Seats must be a number."),
    v.integer("Seats must be a whole number."),
    v.minValue(1, "Choose at least one seat."),
  ),
});

type SignupValues = v.InferInput<typeof signupSchema>;
type SignupSubmitValues = v.InferOutput<typeof signupSchema>;

const signupForm = createForm<SignupValues, SignupSubmitValues>({
  initialValues: { email: "", seats: "1" },
  schema: signupSchema,
  validateOn: ["blur", "submit"],
});

await signupForm.submit((values) => {
  values.seats;
  //    ^ number
});
```

The same pattern works with Zod v4:

```ts
import { createForm } from "@reckona/mreact-forms";
import * as z from "zod/v4";

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  seats: z
    .string()
    .trim()
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1)),
});

type InviteValues = z.input<typeof inviteSchema>;
type InviteSubmitValues = z.output<typeof inviteSchema>;

const inviteForm = createForm<InviteValues, InviteSubmitValues>({
  initialValues: { email: "", seats: "1" },
  schema: inviteSchema,
  validateOn: ["blur", "submit"],
});

await inviteForm.submit((values) => {
  values.seats;
  //    ^ number
});
```

## Core APIs

- `createForm()` creates reactive form state.
- `form.field(name).bind()` returns `{ value, onInput, onChange, onBlur }` and handles the standard DOM-native values described above. Pass `{ event: "change" }` to update from `onChange`; the default updates from `onInput`.
- `form.fieldArray(name)` returns stable keyed rows and `append`, `insert`, `move`, `remove`, and `swap` helpers for array-valued form fields.
- Field state includes `validating`, which is true while the latest async field validator is pending. Slower stale validator results are ignored.
- Field validators can use `{ validate, deps }` when one field should be revalidated after another field changes or blurs.
- `setServerErrors()` applies errors returned by a route handler or server action.
- `form.submit()` dedupes concurrent submissions and keeps `submitting` true until the active validation and handler finish.
- `form.reset()` restores the initial values.
- The `schema` option connects forms to Standard Schema compatible validators such as zod and valibot.

## Server Action And Route Handler Integration

Use client validation for fast feedback, then run server validation for
authorization rules, database constraints, and other trusted checks. Return
server errors to the form with `setServerErrors()`.
