import { cell, computed, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { type StandardSchemaV1, validateStandardSchema } from "./standard-schema.js";
export type { StandardSchemaValidationResult } from "./standard-schema.js";

/** Represents the object shape managed by a form instance. */
export type FormValues = object;

/** Extracts string field names from a form value object. */
export type FieldName<TValues extends FormValues> = Extract<keyof TValues, string>;

/** Maps field names and the root form key to validation error messages. */
export type FormErrors<TValues extends FormValues> = Partial<
  Record<FieldName<TValues> | "root", string[]>
>;

/** Validates one field value against the full form values object. */
export type FieldValidator<TValue, TValues extends FormValues> = (
  value: TValue,
  values: TValues,
) => readonly string[] | string | undefined | Promise<readonly string[] | string | undefined>;

/** Configures one field validator and which other fields should re-trigger it. */
export interface FieldValidationConfig<TValue, TValues extends FormValues> {
  deps?: readonly FieldName<TValues>[] | undefined;
  validate: FieldValidator<TValue, TValues>;
}

/** Provides either a validator function or a validator descriptor with dependencies. */
export type FieldValidationEntry<TValue, TValues extends FormValues> =
  | FieldValidator<TValue, TValues>
  | FieldValidationConfig<TValue, TValues>;

/** Names the form events that can trigger validation. */
export type FormValidateMode = "change" | "blur" | "submit";

/** Describes the complete reactive state tracked by a form instance. */
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

/** Describes the derived state for one form field. */
export interface FieldState<TValue> {
  dirty: boolean;
  errors: string[];
  touched: boolean;
  validating: boolean;
  value: TValue;
}

/** Provides DOM event handlers and current value for binding a field to an input. */
export interface FieldBinding<TValue> {
  onBlur(event: Event): Promise<void>;
  onChange(event: Event): Promise<void>;
  onInput(event: Event): Promise<void>;
  value: TValue;
}

/** Configures which DOM event updates a field binding. */
export interface FieldBindingOptions {
  event?: "change" | "input" | undefined;
}

/** Exposes state, binding, blur, and value update controls for one field. */
export interface FieldApi<TValues extends FormValues, Name extends FieldName<TValues>> {
  readonly state: ReadonlyCell<FieldState<TValues[Name]>>;
  bind(options?: FieldBindingOptions): FieldBinding<TValues[Name]>;
  blur(): Promise<void>;
  setValue(value: TValues[Name]): Promise<void>;
}

/** Extracts an array field's item type. */
export type ArrayFieldValue<
  TValues extends FormValues,
  Name extends FieldName<TValues>,
> = TValues[Name] extends readonly (infer Item)[] ? Item : never;

/** Describes one rendered row in a form array field. */
export interface FieldArrayRow<TValue> {
  index: number;
  key: string;
  value: TValue;
}

/** Exposes stable keyed row state and mutation helpers for an array field. */
export interface FieldArrayApi<TValues extends FormValues, Name extends FieldName<TValues>> {
  readonly fields: ReadonlyCell<Array<FieldArrayRow<ArrayFieldValue<TValues, Name>>>>;
  append(value: ArrayFieldValue<TValues, Name>): Promise<void>;
  insert(index: number, value: ArrayFieldValue<TValues, Name>): Promise<void>;
  move(from: number, to: number): Promise<void>;
  remove(index: number): Promise<void>;
  swap(first: number, second: number): Promise<void>;
}

/** Configures fields and validation shared by schema and non-schema forms. */
export interface BaseCreateFormOptions<TValues extends FormValues> {
  initialValues: TValues;
  validate?:
    | Partial<{
        [Name in FieldName<TValues>]: FieldValidationEntry<TValues[Name], TValues>;
      }>
    | undefined;
  validateOn?: FormValidateMode | readonly FormValidateMode[] | undefined;
}

/** Configures form creation without schema-level submit value transformation. */
export interface CreateFormOptionsWithoutSchema<
  TValues extends FormValues,
> extends BaseCreateFormOptions<TValues> {
  schema?: undefined;
}

/** Configures form creation with a Standard Schema validator that may transform submit values. */
export interface CreateFormOptionsWithSchema<
  TValues extends FormValues,
  TSubmitValues,
> extends BaseCreateFormOptions<TValues> {
  schema: StandardSchemaV1<TValues, TSubmitValues>;
}

/** Configures form creation with optional field validators and optional Standard Schema validation. */
export type CreateFormOptions<TValues extends FormValues, TSubmitValues = TValues> =
  | CreateFormOptionsWithoutSchema<TValues>
  | CreateFormOptionsWithSchema<TValues, TSubmitValues>;

/** Reports either successful normalized submit values or form validation errors. */
export type FormValidationResult<TValues extends FormValues, TSubmitValues> =
  | {
      success: true;
      value: TSubmitValues;
    }
  | {
      errors: FormErrors<TValues>;
      success: false;
    }
  | {
      error: unknown;
      success: false;
    };

/** Reports the result of a form submit handler after validation and error capture. */
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

/** Represents field and form errors returned by a server action. */
export interface ServerActionErrors<TValues extends FormValues> {
  fieldErrors?: Partial<Record<FieldName<TValues>, readonly string[]>> | undefined;
  formErrors?: readonly string[] | undefined;
}

/** Provides reactive form state, field access, validation, submit, reset, and error controls. */
export interface FormApi<TValues extends FormValues, TSubmitValues> {
  readonly state: ReadonlyCell<FormState<TValues>>;
  fieldArray<Name extends FieldName<TValues>>(name: Name): FieldArrayApi<TValues, Name>;
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

/** Creates a reactive form API from initial values, validators, and optional schema validation. */
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
  const dependentFields = buildDependentFields(options.validate);
  const fieldArrayKeys = new Map<FieldName<TValues>, string[]>();
  const fieldStateCells = new Map<
    FieldName<TValues>,
    ReadonlyCell<FieldState<TValues[FieldName<TValues>]>>
  >();
  const fieldArrayCells = new Map<
    FieldName<TValues>,
    ReadonlyCell<Array<FieldArrayRow<ArrayFieldValue<TValues, FieldName<TValues>>>>>
  >();
  let nextFieldArrayKey = 0;
  let activeSubmit: object | undefined;

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

  function invalidateFieldValidations(names: readonly FieldName<TValues>[]): void {
    if (names.length === 0) {
      return;
    }

    const validating = { ...state.get().validating };
    for (const name of names) {
      validationGenerations.set(name, (validationGenerations.get(name) ?? 0) + 1);
      validating[name] = false;
    }
    commit({ validating });
  }

  async function validateField<Name extends FieldName<TValues>>(name: Name): Promise<void> {
    const validator = validatorForField(options.validate?.[name]);
    const generation = (validationGenerations.get(name) ?? 0) + 1;
    validationGenerations.set(name, generation);

    if (validator === undefined) {
      setFieldErrors(name, []);
      setFieldValidating(name, false);
      return;
    }

    const values = state.get().values;
    setFieldValidating(name, true);
    try {
      const errors = await validator(values[name], values);
      if (validationGenerations.get(name) === generation) {
        setFieldErrors(name, normalizeFieldErrors(errors));
      }
    } catch (error) {
      if (validationGenerations.get(name) === generation) {
        setFieldErrors(name, [validationErrorMessage(error)]);
      }
    } finally {
      if (validationGenerations.get(name) === generation) {
        setFieldValidating(name, false);
      }
    }
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
    const valueChanged = !Object.is(previous.values[name], value);
    if (valueChanged) {
      invalidateFieldValidations([name, ...dependentFieldsFor(name)]);
    }
    updateDirtyField(name, value);
    commit({
      values: {
        ...previous.values,
        [name]: value,
      },
    });

    if (validateOn.has("change")) {
      await validateFields([name, ...dependentFieldsFor(name)]);
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
      await validateFields([name, ...dependentFieldsFor(name)]);
    }
  }

  async function validateForm(
    shouldCommit: () => boolean = () => true,
  ): Promise<FormValidationResult<TValues, TSubmitValues>> {
    const values = state.get().values;
    const errors: FormErrors<TValues> = {};
    let validationError: unknown;
    const fieldNames = Object.keys(options.validate ?? {}) as Array<FieldName<TValues>>;
    invalidateFieldValidations(fieldNames);

    for (const name of fieldNames) {
      const validator = options.validate?.[name];
      const validate = validatorForField(validator);
      if (validate === undefined) {
        continue;
      }
      try {
        const fieldErrors = normalizeFieldErrors(await validate(values[name], values));
        if (fieldErrors.length > 0) {
          errors[name] = fieldErrors;
        }
      } catch (error) {
        validationError ??= error;
        errors[name] = [validationErrorMessage(error)];
      }
    }

    if (options.schema !== undefined) {
      try {
        const result = await validateStandardSchema(options.schema, values);

        if (!result.success) {
          mergeIssueErrors(errors, result.issues);
        } else if (Object.keys(errors).length === 0) {
          if (shouldCommit()) {
            setErrors({});
          }
          return {
            success: true,
            value: result.value as TSubmitValues,
          };
        }
      } catch (error) {
        validationError ??= error;
        errors.root = [validationErrorMessage(error)];
      }
    }

    if (validationError !== undefined) {
      if (shouldCommit()) {
        setErrors(errors);
      }
      return { error: validationError, success: false };
    }

    if (Object.keys(errors).length > 0) {
      if (shouldCommit()) {
        setErrors(errors);
      }
      return {
        errors,
        success: false,
      };
    }

    if (shouldCommit()) {
      setErrors({});
    }
    return {
      success: true,
      value: values as TValues & TSubmitValues,
    };
  }

  async function validateFields(names: readonly FieldName<TValues>[]): Promise<void> {
    const uniqueNames = [...new Set(names)];
    await Promise.all(uniqueNames.map((fieldName) => validateField(fieldName)));
  }

  function dependentFieldsFor(name: FieldName<TValues>): readonly FieldName<TValues>[] {
    return dependentFields.get(name) ?? [];
  }

  function arrayValues<Name extends FieldName<TValues>>(
    name: Name,
  ): Array<ArrayFieldValue<TValues, Name>> {
    const value = state.get().values[name];
    return Array.isArray(value) ? ([...value] as Array<ArrayFieldValue<TValues, Name>>) : [];
  }

  function createFieldArrayKey(name: FieldName<TValues>): string {
    const key = `${name}:${nextFieldArrayKey}`;
    nextFieldArrayKey += 1;
    return key;
  }

  function ensureFieldArrayKeys(name: FieldName<TValues>, length: number): string[] {
    const keys = fieldArrayKeys.get(name) ?? [];
    if (keys.length > length) {
      keys.length = length;
    }

    while (keys.length < length) {
      keys.push(createFieldArrayKey(name));
    }

    fieldArrayKeys.set(name, keys);
    return keys;
  }

  function fieldArrayRows<Name extends FieldName<TValues>>(
    name: Name,
  ): Array<FieldArrayRow<ArrayFieldValue<TValues, Name>>> {
    const values = arrayValues(name);
    const keys = ensureFieldArrayKeys(name, values.length);
    return values.map((value, index) => ({
      index,
      key: keys[index] ?? createFieldArrayKey(name),
      value,
    }));
  }

  function fieldArrayCell<Name extends FieldName<TValues>>(
    name: Name,
  ): ReadonlyCell<Array<FieldArrayRow<ArrayFieldValue<TValues, Name>>>> {
    const existing = fieldArrayCells.get(name);
    if (existing !== undefined) {
      return existing as ReadonlyCell<Array<FieldArrayRow<ArrayFieldValue<TValues, Name>>>>;
    }

    const next = computed(() => fieldArrayRows(name), { equals: fieldArrayRowsEqual });
    fieldArrayCells.set(
      name,
      next as ReadonlyCell<Array<FieldArrayRow<ArrayFieldValue<TValues, FieldName<TValues>>>>>,
    );
    return next;
  }

  function fieldStateCell<Name extends FieldName<TValues>>(
    name: Name,
  ): ReadonlyCell<FieldState<TValues[Name]>> {
    const existing = fieldStateCells.get(name);
    if (existing !== undefined) {
      return existing as ReadonlyCell<FieldState<TValues[Name]>>;
    }

    const next = computed(() => fieldState(state.get(), name), { equals: fieldStateEquals });
    fieldStateCells.set(name, next as ReadonlyCell<FieldState<TValues[FieldName<TValues>]>>);
    return next;
  }

  async function setArrayValue<Name extends FieldName<TValues>>(
    name: Name,
    values: Array<ArrayFieldValue<TValues, Name>>,
    keys: string[],
  ): Promise<void> {
    fieldArrayKeys.set(name, keys);
    await setValue(name, values as TValues[Name]);
  }

  async function validateArrayField<Name extends FieldName<TValues>>(name: Name): Promise<void> {
    if (validateOn.has("change")) {
      await validateFields([name, ...dependentFieldsFor(name)]);
    }
  }

  return {
    state,
    fieldArray<Name extends FieldName<TValues>>(name: Name): FieldArrayApi<TValues, Name> {
      return {
        fields: fieldArrayCell(name),
        async append(value) {
          const values = arrayValues(name);
          const keys = [...ensureFieldArrayKeys(name, values.length), createFieldArrayKey(name)];
          values.push(value);
          await setArrayValue(name, values, keys);
        },
        async insert(index, value) {
          const values = arrayValues(name);
          const insertIndex = clampIndex(index, 0, values.length);
          const keys = [...ensureFieldArrayKeys(name, values.length)];
          values.splice(insertIndex, 0, value);
          keys.splice(insertIndex, 0, createFieldArrayKey(name));
          await setArrayValue(name, values, keys);
        },
        async move(from, to) {
          const values = arrayValues(name);
          const keys = [...ensureFieldArrayKeys(name, values.length)];
          if (!isArrayIndex(from, values.length)) {
            await validateArrayField(name);
            return;
          }

          const [value] = values.splice(from, 1);
          const [key] = keys.splice(from, 1);
          const insertIndex = clampIndex(to, 0, values.length);
          values.splice(insertIndex, 0, value as ArrayFieldValue<TValues, Name>);
          keys.splice(insertIndex, 0, key as string);
          await setArrayValue(name, values, keys);
        },
        async remove(index) {
          const values = arrayValues(name);
          const keys = [...ensureFieldArrayKeys(name, values.length)];
          if (!isArrayIndex(index, values.length)) {
            await validateArrayField(name);
            return;
          }

          values.splice(index, 1);
          keys.splice(index, 1);
          await setArrayValue(name, values, keys);
        },
        async swap(first, second) {
          const values = arrayValues(name);
          const keys = [...ensureFieldArrayKeys(name, values.length)];
          if (!isArrayIndex(first, values.length) || !isArrayIndex(second, values.length)) {
            await validateArrayField(name);
            return;
          }

          [values[first], values[second]] = [
            values[second] as ArrayFieldValue<TValues, Name>,
            values[first] as ArrayFieldValue<TValues, Name>,
          ];
          [keys[first], keys[second]] = [keys[second] as string, keys[first] as string];
          await setArrayValue(name, values, keys);
        },
      };
    },
    field<Name extends FieldName<TValues>>(name: Name): FieldApi<TValues, Name> {
      return {
        state: fieldStateCell(name),
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
      activeSubmit = undefined;
      dirtyFields.clear();
      fieldArrayKeys.clear();
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

      for (const [name, messages] of Object.entries(errors.fieldErrors ?? {}) as Array<
        [string, readonly string[] | undefined]
      >) {
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

      const submitToken = {};
      activeSubmit = submitToken;
      const task = (async (): Promise<FormSubmitResult<TValues, TResult>> => {
        commit({
          submitCount: state.get().submitCount + 1,
          submitting: true,
        });

        try {
          const validation = await validateForm(() => activeSubmit === submitToken);

          if (activeSubmit !== submitToken) {
            return { status: "duplicate" };
          }

          if (!validation.success) {
            if ("error" in validation) {
              return {
                error: validation.error,
                status: "error",
              };
            }
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
          if (activeSubmit === submitToken) {
            activeSubmit = undefined;
            commit({ submitting: false });
          }
        }
      })();

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

function fieldStateEquals<TValue>(previous: FieldState<TValue>, next: FieldState<TValue>): boolean {
  return (
    previous.dirty === next.dirty &&
    previous.touched === next.touched &&
    previous.validating === next.validating &&
    Object.is(previous.value, next.value) &&
    stringArraysEqual(previous.errors, next.errors)
  );
}

function fieldArrayRowsEqual<TValue>(
  previous: Array<FieldArrayRow<TValue>>,
  next: Array<FieldArrayRow<TValue>>,
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousRow = previous[index];
    const nextRow = next[index];
    if (
      previousRow === undefined ||
      nextRow === undefined ||
      previousRow.index !== nextRow.index ||
      previousRow.key !== nextRow.key ||
      !Object.is(previousRow.value, nextRow.value)
    ) {
      return false;
    }
  }

  return true;
}

function stringArraysEqual(previous: readonly string[], next: readonly string[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }

  return true;
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
    const name = (key === undefined || isDangerousObjectKey(key) ? "root" : key) as
      | FieldName<TValues>
      | "root";
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

function validationErrorMessage(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "Validation failed";
}

function clampIndex(index: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(index), min), max);
}

function isArrayIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function validatorForField<TValue, TValues extends FormValues>(
  entry: FieldValidationEntry<TValue, TValues> | undefined,
): FieldValidator<TValue, TValues> | undefined {
  return typeof entry === "function" ? entry : entry?.validate;
}

function buildDependentFields<TValues extends FormValues>(
  validate: BaseCreateFormOptions<TValues>["validate"],
): Map<FieldName<TValues>, FieldName<TValues>[]> {
  const dependents = new Map<FieldName<TValues>, FieldName<TValues>[]>();

  for (const [fieldName, entry] of Object.entries(validate ?? {}) as Array<
    [FieldName<TValues>, FieldValidationEntry<TValues[FieldName<TValues>], TValues> | undefined]
  >) {
    if (entry === undefined || typeof entry === "function") {
      continue;
    }

    for (const dep of entry.deps ?? []) {
      const fields = dependents.get(dep);
      if (fields === undefined) {
        dependents.set(dep, [fieldName]);
        continue;
      }
      fields.push(fieldName);
    }
  }

  return dependents;
}

function cloneValues<TValues extends FormValues>(values: TValues): TValues {
  return { ...values };
}

/** Re-exports Standard Schema types used by form schema options. */
export type {
  InferStandardSchemaInput,
  InferStandardSchemaOutput,
  StandardSchemaV1,
} from "./standard-schema.js";
/** Validates an unknown value with a Standard Schema and normalizes the result shape. */
export { validateStandardSchema } from "./standard-schema.js";
