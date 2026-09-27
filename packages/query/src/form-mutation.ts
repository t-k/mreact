import {
  createMutation,
  hashQueryKey,
  type MutationObserver,
  type QueryClient,
  type QueryKey,
} from "./index.js";

/** The subset of a form needed to validate and submit a mutation. */
export interface MutationFlowForm<TValues extends object, TSubmitValues> {
  submit<TResult>(handler: (values: TSubmitValues) => Promise<TResult> | TResult): Promise<
    | { status: "success"; data: TResult }
    | { status: "duplicate" }
    | {
        status: "invalid";
        errors: Partial<Record<Extract<keyof TValues, string> | "root", string[]>>;
      }
    | { status: "error"; error: unknown }
  >;
  setServerErrors(errors: MutationFlowServerErrors<TValues>): void;
}

/** Field and form errors returned by a server mutation. */
export interface MutationFlowServerErrors<TValues extends object> {
  fieldErrors?: Partial<Record<Extract<keyof TValues, string>, readonly string[]>> | undefined;
  formErrors?: readonly string[] | undefined;
}

/** A validated server mutation result. */
export type MutationFlowServerResult<TValues extends object, TData> =
  | { ok: true; data: TData }
  | { ok: false; errors: MutationFlowServerErrors<TValues> };

/** Configures a form submission linked to a server mutation and query cache. */
export interface FormMutationFlowOptions<
  TValues extends object,
  TSubmitValues,
  TData,
  TQueryData extends Record<string, unknown>,
> {
  server: (
    values: TSubmitValues,
  ) => Promise<MutationFlowServerResult<TValues, TData>> | MutationFlowServerResult<TValues, TData>;
  invalidate?: readonly QueryKey[] | undefined;
  /** Applies a shallow patch to one existing record; absent cache entries are left alone. */
  optimistic?:
    | {
        queryKey: QueryKey;
        patch: (values: TSubmitValues) => Partial<TQueryData>;
      }
    | undefined;
}

/** The result of submitting a form-backed mutation. */
export type FormMutationFlowResult<TValues extends object, TData> =
  | { status: "success"; data: TData }
  | { status: "duplicate" }
  | {
      status: "invalid";
      errors: Partial<Record<Extract<keyof TValues, string> | "root", string[]>>;
    }
  | { status: "server-errors"; errors: MutationFlowServerErrors<TValues> }
  | { status: "error"; error: unknown };

/** Exposes form submission and the underlying mutation state. */
export interface FormMutationFlow<TValues extends object, TSubmitValues, TData> {
  readonly mutation: MutationObserver<TSubmitValues, TData>;
  submit(): Promise<FormMutationFlowResult<TValues, TData>>;
}

type Operation = { value: unknown; status: "pending" | "success" | "failed" };
type FieldLedger = {
  basePresent: boolean;
  baseValue: unknown;
  visibleOperation: Operation | undefined;
  visibleValue: unknown;
  operations: Operation[];
};
type CacheLedger = Map<string, FieldLedger>;
type QueryLedgers = Map<string, CacheLedger>;
type Change = { field: string; ledger: FieldLedger; operation: Operation };
type MutationContext = {
  queryKey: QueryKey;
  queryHash: string;
  queries: QueryLedgers;
  fields: CacheLedger;
  changes: Change[];
};

const clientLedgers = new WeakMap<QueryClient, QueryLedgers>();

class ServerErrorsSignal<TValues extends object> extends Error {
  constructor(readonly errors: MutationFlowServerErrors<TValues>) {
    super("Server validation failed");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUnsafeKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function getCacheLedger(
  client: QueryClient,
  queryHash: string,
): { queries: QueryLedgers; fields: CacheLedger } {
  let queries = clientLedgers.get(client);
  if (queries === undefined) {
    queries = new Map();
    clientLedgers.set(client, queries);
  }
  let fields = queries.get(queryHash);
  if (fields === undefined) {
    fields = new Map();
    queries.set(queryHash, fields);
  }
  return { queries, fields };
}

function pruneQueryLedger(context: MutationContext): void {
  if (context.queries.get(context.queryHash) !== context.fields) return;
  for (const ledger of context.fields.values()) {
    if (ledger.operations.some((operation) => operation.status === "pending")) return;
  }
  context.queries.delete(context.queryHash);
}

function applyOptimisticPatch<TSubmitValues, TQueryData extends Record<string, unknown>>(
  client: QueryClient,
  values: TSubmitValues,
  optimistic: NonNullable<
    FormMutationFlowOptions<object, TSubmitValues, unknown, TQueryData>["optimistic"]
  >,
): MutationContext | undefined {
  const current = client.getQueryData(optimistic.queryKey);
  if (!isPlainRecord(current)) return undefined;
  const patch = optimistic.patch(values);
  if (!isPlainRecord(patch)) throw new TypeError("An optimistic patch must be a plain object");
  const entries = Object.entries(patch);
  for (const [field] of entries) {
    if (isUnsafeKey(field)) throw new TypeError(`Unsafe optimistic patch key: ${field}`);
  }
  if (entries.length === 0) return undefined;

  const queryHash = hashQueryKey(optimistic.queryKey);
  const { queries, fields } = getCacheLedger(client, queryHash);
  const changes: Change[] = [];
  const next = { ...current };
  for (const [field, value] of entries) {
    let ledger = fields.get(field);
    if (ledger === undefined || !Object.is(current[field], ledger.visibleValue)) {
      ledger = {
        basePresent: Object.prototype.hasOwnProperty.call(current, field),
        baseValue: current[field],
        visibleOperation: undefined,
        visibleValue: current[field],
        operations: [],
      };
      fields.set(field, ledger);
    }
    const operation: Operation = { value, status: "pending" };
    ledger.operations.push(operation);
    ledger.visibleOperation = operation;
    ledger.visibleValue = value;
    changes.push({ field, ledger, operation });
    next[field] = value;
  }
  client.setQueryData(optimistic.queryKey, next);
  return { queryKey: optimistic.queryKey, queryHash, queries, fields, changes };
}

function settleOptimisticPatch(
  client: QueryClient,
  context: MutationContext | undefined,
  success: boolean,
): void {
  if (context === undefined) return;
  const current = client.getQueryData(context.queryKey);
  const fields = context.queries.get(context.queryHash);
  if (!isPlainRecord(current)) {
    for (const { operation } of context.changes) {
      operation.status = success ? "success" : "failed";
    }
    pruneQueryLedger(context);
    client.invalidateQueries({ queryKey: context.queryKey });
    return;
  }
  const next = { ...current };
  let changed = false;
  let conflicted = false;
  for (const { field, ledger, operation } of context.changes) {
    operation.status = success ? "success" : "failed";
    if (fields?.get(field) !== ledger || !Object.is(current[field], ledger.visibleValue)) {
      conflicted = true;
      continue;
    }
    if (!success && ledger.visibleOperation === operation) {
      let prior: Operation | undefined;
      for (let index = ledger.operations.length - 1; index >= 0; index--) {
        const candidate = ledger.operations[index];
        if (candidate?.status !== "failed") {
          prior = candidate;
          break;
        }
      }
      ledger.visibleOperation = prior;
      if (prior !== undefined) {
        next[field] = prior.value;
        ledger.visibleValue = prior.value;
      } else if (ledger.basePresent) {
        next[field] = ledger.baseValue;
        ledger.visibleValue = ledger.baseValue;
      } else {
        delete next[field];
        ledger.visibleValue = undefined;
      }
      changed = true;
    }
  }
  pruneQueryLedger(context);
  if (changed) client.setQueryData(context.queryKey, next);
  if (conflicted) client.invalidateQueries({ queryKey: context.queryKey });
}

/** Joins form validation, a server mutation, query invalidation, and optional optimistic record edits. */
export function createFormMutationFlow<
  TValues extends object,
  TSubmitValues,
  TData,
  TQueryData extends Record<string, unknown> = Record<string, unknown>,
>(
  client: QueryClient,
  form: MutationFlowForm<TValues, TSubmitValues>,
  options: FormMutationFlowOptions<TValues, TSubmitValues, TData, TQueryData>,
): FormMutationFlow<TValues, TSubmitValues, TData> {
  const mutation = createMutation<TSubmitValues, TData, MutationContext | undefined>(client, {
    mutationFn: async (values) => {
      const response = await options.server(values);
      if (!response.ok) throw new ServerErrorsSignal(response.errors);
      return response.data;
    },
    onMutate: (values) =>
      options.optimistic === undefined
        ? undefined
        : applyOptimisticPatch(client, values, options.optimistic),
    onError: (_error, _values, context) => settleOptimisticPatch(client, context, false),
    onSettled: (result, _values, context) => {
      if ("data" in result) settleOptimisticPatch(client, context, true);
    },
    invalidate: options.invalidate ?? [],
  });

  return {
    mutation,
    async submit() {
      const result = await form.submit((values) => mutation.mutate(values));
      if (result.status === "error" && result.error instanceof ServerErrorsSignal) {
        form.setServerErrors(result.error.errors);
        return { status: "server-errors", errors: result.error.errors };
      }
      return result;
    },
  };
}
