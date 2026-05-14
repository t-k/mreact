# @reckona/mreact-forms

`@reckona/mreact-forms` provides form state and validation utilities for mreact.
It tracks field values, dirty/touched state, client validation, and server
errors through a small reactive API.

## Basic Usage

```ts
import { createForm } from "@reckona/mreact-forms";

const form = createForm({
  initialValues: { email: "" },
  validate(values) {
    return values.email.includes("@") ? {} : { email: "Invalid email" };
  },
});

await form.field("email").setValue("ada@example.test");
await form.validate();
```

## Core APIs

- `createForm()` creates reactive form state.
- `setServerErrors()` applies errors returned by a route handler or server action.
- `form.reset()` restores the initial values.
- The `standard-schema` subpath connects forms to Standard Schema compatible validators such as zod and valibot.

## Server Action And Route Handler Integration

Use client validation for fast feedback, then run server validation for
authorization rules, database constraints, and other trusted checks. Return
server errors to the form with `setServerErrors()`.
