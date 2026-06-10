import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { type StandardSchemaV1, validateStandardSchema } from "./standard-schema.js";

export type FormValues = Record<string, unknown>;
export type FieldName<TValues extends FormValues> = Extract<keyof TValues, string>;
export type FormErrors<TValues extends FormValues> = Partial<
  Record<FieldName<TValues> | "root", string[]>
>;
export type FieldValidator<TValue, TValues extends FormValues> = (
  value: TValue,
  values: TValues,
) => readonly string[] | string | undefined | Promise<readonly string[] | string | undefined>;
export type FormValidateMode = "change" | "blur" | "submit";

export interface FormState<TValues extends FormValues> {
  dirty: boolean;
  errors: FormErrors<TValues>;
  initialValues: TValues;
  submitCount: number;
  submitting: boolean;
  touched: Partial<Record<FieldName<TValues>, boolean>>;
  valid: boolean;
  validating: Partial<Record<FieldName<TValues>, boolean>>;
  values: TValues;
}

export interface FieldState<TValue> {
  dirty: boolean;
  errors: string[];
  touched: boolean;
  validating: boolean;
  value: TValue;
}

export interface FieldBinding<TValue> {
  onBlur(event: Event): Promise<void>;
  onChange(event: Event): Promise<void>;
  onInput(event: Event): Promise<void>;
  value: TValue;
}

export interface FieldBindingOptions {
  event?: "change" | "input" | undefined;
}

export interface FieldApi<TValues extends FormValues, Name extends FieldName<TValues>> {
  readonly state: ReadonlyCell<FieldState<TValues[Name]>>;
  bind(options?: FieldBindingOptions): FieldBinding<TValues[Name]>;
  blur(): Promise<void>;
  setValue(value: TValues[Name]): Promise<void>;
}

interface BaseCreateFormOptions<TValues extends FormValues> {
  initialValues: TValues;
  validate?:
    | Partial<{
        [Name in FieldName<TValues>]: FieldValidator<TValues[Name], TValues>;
      }>
    | undefined;
  validateOn?: FormValidateMode | readonly FormValidateMode[] | undefined;
}

export interface CreateFormOptionsWithoutSchema<TValues extends FormValues>
  extends BaseCreateFormOptions<TValues> {
  schema?: undefined;
}

export interface CreateFormOptionsWithSchema<TValues extends FormValues, TSubmitValues>
  extends BaseCreateFormOptions<TValues> {
  schema: StandardSchemaV1<TValues, TSubmitValues>;
}

export type CreateFormOptions<TValues extends FormValues, TSubmitValues = TValues> =
  | CreateFormOptionsWithoutSchema<TValues>
  | CreateFormOptionsWithSchema<TValues, TSubmitValues>;

export type FormValidationResult<TValues extends FormValues, TSubmitValues> =
  | {
      success: true;
      value: TSubmitValues;
    }
  | {
      errors: FormErrors<TValues>;
      success: false;
    };

export type FormSubmitResult<TValues extends FormValues, TResult> =
  | {
      data: TResult;
      status: "success";
    }
  | {
      status: "duplicate";
    }
  | {
      errors: FormErrors<TValues>;
      status: "invalid";
    }
  | {
      error: unknown;
      status: "error";
    };

export interface ServerActionErrors<TValues extends FormValues> {
  fieldErrors?: Partial<Record<FieldName<TValues>, readonly string[]>> | undefined;
  formErrors?: readonly string[] | undefined;
}

export interface FormApi<TValues extends FormValues, TSubmitValues> {
  readonly state: ReadonlyCell<FormState<TValues>>;
  field<Name extends FieldName<TValues>>(name: Name): FieldApi<TValues, Name>;
  getValues(): TValues;
  reset(values?: TValues): void;
  setErrors(errors: FormErrors<TValues>): void;
  setServerErrors(errors: ServerActionErrors<TValues>): void;
  setValue<Name extends FieldName<TValues>>(name: Name, value: TValues[Name]): Promise<void>;
  submit<TResult>(
    handler: (values: TSubmitValues) => Promise<TResult> | TResult,
  ): Promise<FormSubmitResult<TValues, TResult>>;
  validate(): Promise<FormValidationResult<TValues, TSubmitValues>>;
}

export function createForm<TValues extends FormValues>(
  options: CreateFormOptionsWithoutSchema<TValues>,
): FormApi<TValues, TValues>;
export function createForm<TValues extends FormValues, TSubmitValues>(
  options: CreateFormOptionsWithSchema<TValues, TSubmitValues>,
): FormApi<TValues, TSubmitValues>;
export function createForm<TValues extends FormValues, TSubmitValues = TValues>(
  options: CreateFormOptions<TValues, TSubmitValues>,
): FormApi<TValues, TSubmitValues> {
  const validateOn = new Set(
    Array.isArray(options.validateOn) ? options.validateOn : [options.validateOn ?? "submit"],
  );
  let initialValues = cloneValues(options.initialValues);
  const state = cell<FormState<TValues>>({
    dirty: false,
    errors: {},
    initialValues,
    submitCount: 0,
    submitting: false,
    touched: {},
    valid: true,
    validating: {},
    values: cloneValues(options.initialValues),
  });
  const validationGenerations = new Map<FieldName<TValues>, number>();
  const dirtyFields = new Set<FieldName<TValues>>();
  let activeSubmit: Promise<FormSubmitResult<TValues, unknown>> | undefined;

  function commit(patch: Partial<FormState<TValues>>, dirty = dirtyFields.size > 0): void {
    const previous = state.get();
    const next = {
      ...previous,
      ...patch,
    };
    next.dirty = dirty;
    next.valid = hasNoErrors(next.errors);
    state.set(next);
  }

  function setErrors(errors: FormErrors<TValues>): void {
    commit({ errors: normalizeErrors(errors) });
  }

  async function validateField<Name extends FieldName<TValues>>(name: Name): Promise<void> {
    const validator = options.validate?.[name];
    const generation = (validationGenerations.get(name) ?? 0) + 1;
    validationGenerations.set(name, generation);

    if (validator === undefined) {
      setFieldErrors(name, []);
      setFieldValidating(name, false);
      return;
    }

    const values = state.get().values;
    setFieldValidating(name, true);
    const errors = await validator(values[name], values);

    if (validationGenerations.get(name) !== generation) {
      return;
    }

    setFieldErrors(name, normalizeFieldErrors(errors));
    setFieldValidating(name, false);
  }

  function setFieldErrors<Name extends FieldName<TValues>>(
    name: Name,
    errors: readonly string[],
  ): void {
    const current = state.get().errors;
    setErrors({
      ...current,
      [name]: [...errors],
    } as FormErrors<TValues>);
  }

  function setFieldValidating<Name extends FieldName<TValues>>(
    name: Name,
    validating: boolean,
  ): void {
    const current = state.get().validating;
    commit({
      validating: {
        ...current,
        [name]: validating,
      },
    });
  }

  async function setValue<Name extends FieldName<TValues>>(
    name: Name,
    value: TValues[Name],
  ): Promise<void> {
    const previous = state.get();
    updateDirtyField(name, value);
    commit({
      values: {
        ...previous.values,
        [name]: value,
      },
    });

    if (validateOn.has("change")) {
      await validateField(name);
    }
  }

  async function blurField<Name extends FieldName<TValues>>(name: Name): Promise<void> {
    commit({
      touched: {
        ...state.get().touched,
        [name]: true,
      },
    });

    if (validateOn.has("blur")) {
      await validateField(name);
    }
  }

  async function validateForm(): Promise<FormValidationResult<TValues, TSubmitValues>> {
    const values = state.get().values;
    const errors: FormErrors<TValues> = {};

    for (const name of Object.keys(options.validate ?? {}) as Array<FieldName<TValues>>) {
      const validator = options.validate?.[name];
      if (validator === undefined) {
        continue;
      }
      const fieldErrors = normalizeFieldErrors(await validator(values[name], values));
      if (fieldErrors.length > 0) {
        errors[name] = fieldErrors;
      }
    }

    if (options.schema !== undefined) {
      const result = await validateStandardSchema(options.schema, values);

      if (!result.success) {
        mergeIssueErrors(errors, result.issues);
      } else if (Object.keys(errors).length === 0) {
        setErrors({});
        return {
          success: true,
          value: result.value as TSubmitValues,
        };
      }
    }

    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      return {
        errors,
        success: false,
      };
    }

    setErrors({});
    return {
      success: true,
      value: values as TValues & TSubmitValues,
    };
  }

  return {
    state,
    field<Name extends FieldName<TValues>>(name: Name): FieldApi<TValues, Name> {
      return {
        state: {
          get: () => fieldState(state.get(), name),
        },
        bind(bindingOptions = {}) {
          const bindingEvent = bindingOptions.event ?? "input";
          const updateValue = async (inputEvent: Event) => {
            await setValue(name, eventValue(inputEvent, state.get().values[name]) as TValues[Name]);
          };

          return {
            onBlur: async () => {
              await blurField(name);
            },
            onChange: async (event) => {
              if (bindingEvent === "change") {
                await updateValue(event);
              }
            },
            onInput: async (event) => {
              if (bindingEvent === "input") {
                await updateValue(event);
              }
            },
            get value() {
              return state.get().values[name];
            },
          };
        },
        async blur() {
          await blurField(name);
        },
        setValue: (value) => setValue(name, value),
      };
    },
    getValues() {
      return state.get().values;
    },
    reset(values = initialValues): void {
      for (const name of Object.keys(options.validate ?? {}) as Array<FieldName<TValues>>) {
        validationGenerations.set(name, (validationGenerations.get(name) ?? 0) + 1);
      }

      initialValues = cloneValues(values);
      dirtyFields.clear();
      commit({
        errors: {},
        initialValues,
        submitCount: 0,
        submitting: false,
        touched: {},
        validating: {},
        values: cloneValues(values),
      });
    },
    setErrors,
    setServerErrors(errors): void {
      const next: FormErrors<TValues> = {};

      for (const [name, messages] of Object.entries(errors.fieldErrors ?? {})) {
        if (isDangerousObjectKey(name)) {
          continue;
        }

        if (messages !== undefined && messages.length > 0) {
          next[name as FieldName<TValues>] = [...messages];
        }
      }

      if (errors.formErrors !== undefined && errors.formErrors.length > 0) {
        next.root = [...errors.formErrors];
      }

      setErrors(next);
    },
    setValue,
    async submit<TResult>(
      handler: (values: TSubmitValues) => Promise<TResult> | TResult,
    ): Promise<FormSubmitResult<TValues, TResult>> {
      if (activeSubmit !== undefined) {
        return { status: "duplicate" };
      }

      const task = (async (): Promise<FormSubmitResult<TValues, TResult>> => {
        commit({
          submitCount: state.get().submitCount + 1,
          submitting: true,
        });

        try {
          const validation = await validateForm();

          if (!validation.success) {
            return {
              errors: validation.errors,
              status: "invalid",
            };
          }

          try {
            const data = await handler(validation.value);
            return {
              data,
              status: "success",
            };
          } catch (error) {
            return {
              error,
              status: "error",
            };
          }
        } finally {
          activeSubmit = undefined;
          commit({ submitting: false });
        }
      })();

      activeSubmit = task as Promise<FormSubmitResult<TValues, unknown>>;
      return task;
    },
    validate: validateForm,
  };

  function updateDirtyField<Name extends FieldName<TValues>>(
    name: Name,
    value: TValues[Name],
  ): void {
    if (Object.is(value, initialValues[name])) {
      dirtyFields.delete(name);
      return;
    }

    dirtyFields.add(name);
  }
}

function fieldState<TValues extends FormValues, Name extends FieldName<TValues>>(
  formState: FormState<TValues>,
  name: Name,
): FieldState<TValues[Name]> {
  return {
    dirty: !Object.is(formState.values[name], formState.initialValues[name]),
    errors: [...(formState.errors[name] ?? [])],
    touched: formState.touched[name] === true,
    validating: formState.validating[name] === true,
    value: formState.values[name],
  };
}

function eventValue(event: Event, currentValue: unknown): unknown {
  const target = event.currentTarget ?? event.target;

  if (target !== null && typeof target === "object") {
    if (typeof currentValue === "boolean" && "checked" in target) {
      return Boolean((target as { checked: unknown }).checked);
    }

    if ("value" in target) {
      return (target as { value: unknown }).value;
    }
  }

  return currentValue;
}

function mergeIssueErrors<TValues extends FormValues>(
  errors: FormErrors<TValues>,
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): void {
  for (const issue of issues) {
    const key = issuePathKey(issue.path);
    const name = (key ?? "root") as FieldName<TValues> | "root";
    const messages = errors[name] ?? [];
    messages.push(issue.message);
    errors[name] = messages;
  }
}

function issuePathKey(
  path: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined,
): string | undefined {
  const first = path?.[0];

  if (first === undefined) {
    return undefined;
  }

  return typeof first === "object" && first !== null && "key" in first
    ? String(first.key)
    : String(first);
}

function normalizeErrors<TValues extends FormValues>(
  errors: FormErrors<TValues>,
): FormErrors<TValues> {
  return Object.fromEntries(
    Object.entries(errors).flatMap(([name, messages]) =>
      messages === undefined || messages.length === 0 ? [] : [[name, [...messages]]],
    ),
  ) as FormErrors<TValues>;
}

function isDangerousObjectKey(key: PropertyKey): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function hasNoErrors<TValues extends FormValues>(errors: FormErrors<TValues>): boolean {
  return (Object.values(errors) as Array<string[] | undefined>).every(
    (messages) => messages === undefined || messages.length === 0,
  );
}

function normalizeFieldErrors(errors: readonly string[] | string | undefined): string[] {
  if (errors === undefined) {
    return [];
  }

  return typeof errors === "string" ? [errors] : [...errors];
}

function cloneValues<TValues extends FormValues>(values: TValues): TValues {
  return { ...values };
}

export type {
  InferStandardSchemaInput,
  InferStandardSchemaOutput,
  StandardSchemaV1,
} from "./standard-schema.js";
export { validateStandardSchema } from "./standard-schema.js";
