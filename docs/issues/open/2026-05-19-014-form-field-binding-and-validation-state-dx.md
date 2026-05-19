# Form field binding and validation state need a smaller interface

## Summary

`@reckona/mreact-forms` works, but field usage currently requires repeated
manual `state.get().values[field]`, event target casts, `setValue()`, and
`blur()` calls. Field-level async validation also has no visible validating
state, so apps cannot show per-field pending UI.

## Evidence

- `packages/forms/src/index.ts` exposes `FieldApi` with only `state`, `blur()`,
  and `setValue()`.
- `packages/forms/src/index.ts` defines `FieldState` with `dirty`, `errors`,
  `touched`, and `value`, but no `validating` or validation generation marker.
- `packages/forms/src/index.ts` allows async field validators through
  `FieldValidator`, and `validateField()` awaits the validator before updating
  errors.
- `examples/app-router/app/forms/page.tsx` repeats field reads and event casts
  for `name`, `email`, and `message`, including separate `onInput` and `onBlur`
  wiring.

## Impact

Forms are one of the highest-frequency user interfaces. The current API makes
simple forms verbose and makes async validation UX difficult. It also encourages
copy-pasted event target casts in application code.

## Suggested fix

Extend the form API with field binding helpers and validation state:

```ts
interface FieldState<TValue> {
  dirty: boolean;
  errors: string[];
  touched: boolean;
  validating: boolean;
  value: TValue;
}

interface FieldBinding<TValue> {
  value: TValue;
  onInput(event: Event): void;
  onBlur(event: Event): void;
}

interface FieldApi<TValues, Name extends FieldName<TValues>> {
  readonly state: ReadonlyCell<FieldState<TValues[Name]>>;
  bind(options?: { event?: "input" | "change" }): FieldBinding<TValues[Name]>;
  blur(): Promise<void>;
  setValue(value: TValues[Name]): Promise<void>;
}
```

The implementation should handle stale async validators with a generation token
so slower validations cannot overwrite newer field errors.

## Priority

Medium.
