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
  values: TValues;
}

export interface FieldState<TValue> {
  dirty: boolean;
  errors: string[];
  touched: boolean;
  value: TValue;
}

export interface FieldApi<TValues extends FormValues, Name extends FieldName<TValues>> {
  readonly state: ReadonlyCell<FieldState<TValues[Name]>>;
  blur(): Promise<void>;
  setValue(value: TValues[Name]): Promise<void>;
}

export interface CreateFormOptions<TValues extends FormValues, TSubmitValues = TValues> {
  initialValues: TValues;
  schema?: StandardSchemaV1<TValues, TSubmitValues> | undefined;
  validate?:
    | Partial<{
        [Name in FieldName<TValues>]: FieldValidator<TValues[Name], TValues>;
      }>
    | undefined;
  validateOn?: FormValidateMode | readonly FormValidateMode[] | undefined;
}

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
    values: cloneValues(options.initialValues),
  });

  function commit(patch: Partial<FormState<TValues>>): void {
    const previous = state.get();
    const next = {
      ...previous,
      ...patch,
    };
    next.dirty = isDirty(next.values, next.initialValues);
    next.valid = hasNoErrors(next.errors);
    state.set(next);
  }

  function setErrors(errors: FormErrors<TValues>): void {
    commit({ errors: normalizeErrors(errors) });
  }

  async function validateField<Name extends FieldName<TValues>>(name: Name): Promise<void> {
    const validator = options.validate?.[name];

    if (validator === undefined) {
      setFieldErrors(name, []);
      return;
    }

    const values = state.get().values;
    const errors = await validator(values[name], values);
    setFieldErrors(name, normalizeFieldErrors(errors));
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

  async function setValue<Name extends FieldName<TValues>>(
    name: Name,
    value: TValues[Name],
  ): Promise<void> {
    commit({
      values: {
        ...state.get().values,
        [name]: value,
      },
    });

    if (validateOn.has("change")) {
      await validateField(name);
    }
  }

  return {
    state,
    field<Name extends FieldName<TValues>>(name: Name): FieldApi<TValues, Name> {
      return {
        state: {
          get: () => fieldState(state.get(), name),
        },
        async blur() {
          commit({
            touched: {
              ...state.get().touched,
              [name]: true,
            },
          });

          if (validateOn.has("blur")) {
            await validateField(name);
          }
        },
        setValue: (value) => setValue(name, value),
      };
    },
    getValues() {
      return state.get().values;
    },
    reset(values = initialValues): void {
      initialValues = cloneValues(values);
      commit({
        errors: {},
        initialValues,
        submitCount: 0,
        submitting: false,
        touched: {},
        values: cloneValues(values),
      });
    },
    setErrors,
    setServerErrors(errors): void {
      const next: FormErrors<TValues> = {};

      for (const [name, messages] of Object.entries(errors.fieldErrors ?? {})) {
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
      commit({
        submitCount: state.get().submitCount + 1,
        submitting: true,
      });

      const validation = await this.validate();

      if (!validation.success) {
        commit({ submitting: false });
        return {
          errors: validation.errors,
          status: "invalid",
        };
      }

      try {
        const data = await handler(validation.value);
        commit({ submitting: false });
        return {
          data,
          status: "success",
        };
      } catch (error) {
        commit({ submitting: false });
        return {
          error,
          status: "error",
        };
      }
    },
    async validate(): Promise<FormValidationResult<TValues, TSubmitValues>> {
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
        value: values as unknown as TSubmitValues,
      };
    },
  };
}

function fieldState<TValues extends FormValues, Name extends FieldName<TValues>>(
  formState: FormState<TValues>,
  name: Name,
): FieldState<TValues[Name]> {
  return {
    dirty: !Object.is(formState.values[name], formState.initialValues[name]),
    errors: [...(formState.errors[name] ?? [])],
    touched: formState.touched[name] === true,
    value: formState.values[name],
  };
}

function mergeIssueErrors<TValues extends FormValues>(
  errors: FormErrors<TValues>,
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): void {
  for (const issue of issues) {
    const key = issuePathKey(issue.path);
    const name = (key ?? "root") as FieldName<TValues> | "root";
    errors[name] = [...(errors[name] ?? []), issue.message];
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

function isDirty<TValues extends FormValues>(values: TValues, initialValues: TValues): boolean {
  return Object.keys(values).some((key) => !Object.is(values[key], initialValues[key]));
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
