import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { getGlobalRuntimeState } from "@reckona/mreact-reactive-core/runtime-state";
import {
  createQueryLifecycle,
  hashQueryKey,
  resultFromQueryEntry,
} from "./query-lifecycle.js";

export { hashQueryKey } from "./query-lifecycle.js";

export type QueryKey = readonly unknown[];
export type QueryStatus = "pending" | "success" | "error";
export type MutationStatus = "idle" | "pending" | "success" | "error";
export type QueryErrorReason = "aborted" | "retry-exhausted" | "network" | "unknown";

export interface QueryResult<TData> {
  data: TData | undefined;
  error: unknown;
  errorReason: QueryErrorReason | undefined;
  isFetching: boolean;
  status: QueryStatus;
  updatedAt: number;
}

export interface MutationResult<TData> {
  data: TData | undefined;
  error: unknown;
  status: MutationStatus;
  updatedAt: number;
}

export interface QueryEntry<TData = unknown> extends QueryResult<TData> {
  queryHash: string;
  queryKey: QueryKey;
  stale: boolean;
}

export interface QueryFunctionContext {
  queryKey: QueryKey;
  signal: AbortSignal;
}

export interface FetchQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: (context: QueryFunctionContext) => Promise<TData> | TData;
  retry?: false | number | undefined;
  retryDelay?: number | ((attempt: number, error: unknown) => number) | undefined;
  signal?: AbortSignal | undefined;
  staleTime?: number;
}

export interface InvalidateQueriesOptions {
  queryKey?: QueryKey;
}

export interface QueryClient {
  cancelQueries(options?: InvalidateQueriesOptions): void;
  fetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<TData>;
  prefetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<void>;
  getQueryData<TData = unknown>(queryKey: QueryKey): TData | undefined;
  getQueryEntry<TData = unknown>(queryKey: QueryKey): QueryEntry<TData> | undefined;
  setQueryData<TData>(queryKey: QueryKey, data: TData): void;
  invalidateQueries(options?: InvalidateQueriesOptions): void;
  removeQueries(options?: InvalidateQueriesOptions): void;
  subscribe<TData = unknown>(
    queryKey: QueryKey,
    listener: (entry: QueryEntry<TData>) => void,
  ): () => void;
  entries(): QueryEntry[];
}

export interface CreateQueryOptions<TData> extends FetchQueryOptions<TData> {
  /**
   * Fetch when the observer is created and the cache does not already contain
   * fresh data. Defaults to true in browsers and false during server render.
   */
  autoFetch?: boolean | undefined;
}

export interface QueryObserver<TData> {
  readonly result: ReadonlyCell<QueryResult<TData>>;
  dispose(): void;
  refetch(): Promise<QueryResult<TData>>;
}

export interface CreateMutationOptions<TVariables, TData, TContext = unknown> {
  invalidate?: readonly QueryKey[];
  mutationFn: (variables: TVariables) => Promise<TData> | TData;
  onError?:
    | ((error: unknown, variables: TVariables, context: TContext | undefined) => Promise<void> | void)
    | undefined;
  onMutate?: ((variables: TVariables) => Promise<TContext> | TContext) | undefined;
  onSettled?:
    | ((
        result: { data: TData; error?: undefined } | { data?: undefined; error: unknown },
        variables: TVariables,
        context: TContext | undefined,
      ) => Promise<void> | void)
    | undefined;
  onSuccess?: ((data: TData, variables: TVariables) => Promise<void> | void) | undefined;
}

export interface MutationObserver<TVariables, TData> {
  readonly result: ReadonlyCell<MutationResult<TData>>;
  mutate(variables: TVariables): Promise<TData>;
}

export interface DehydratedQuery {
  data: unknown;
  queryHash: string;
  queryKey: QueryKey;
  updatedAt: number;
}

export interface DehydratedQueryClient {
  queries: DehydratedQuery[];
}

export const __MREACT_QUERY_STATE_SCRIPT_ID = "__mreact_query_state";

const queryRuntimeStateKey = "__mreactQueryRuntimeState";

interface QueryRuntimeState {
  browserQueryClient?: QueryClient | undefined;
  currentQueryClient?: QueryClient | undefined;
}

export function createQueryClient(): QueryClient {
  return createQueryLifecycle();
}

export function getQueryClient(): QueryClient {
  const state = queryRuntimeState();

  if (state.currentQueryClient !== undefined) {
    return state.currentQueryClient;
  }

  if (typeof document === "undefined") {
    return createQueryClient();
  }

  if (state.browserQueryClient === undefined) {
    state.browserQueryClient = createQueryClient();
    hydrateFromDocument(state.browserQueryClient);
  }

  return state.browserQueryClient;
}

export function runWithQueryClient<T>(client: QueryClient, fn: () => T): T {
  const state = queryRuntimeState();
  const previous = state.currentQueryClient;
  state.currentQueryClient = client;

  try {
    const result = fn();

    if (isPromise(result)) {
      return result.finally(() => {
        state.currentQueryClient = previous;
      }) as T;
    }

    state.currentQueryClient = previous;
    return result;
  } catch (error) {
    state.currentQueryClient = previous;
    throw error;
  }
}

export function __resetQueryClientForTesting(): void {
  const state = queryRuntimeState();
  state.currentQueryClient = undefined;
  state.browserQueryClient = undefined;
}

export function createQuery<TData>(
  client: QueryClient,
  options: CreateQueryOptions<TData>,
): QueryObserver<TData> {
  const result = cell(resultFromQueryEntry<TData>(client.getQueryEntry<TData>(options.queryKey)));
  const unsubscribe = client.subscribe<TData>(options.queryKey, (entry) => {
    if (hashQueryKey(entry.queryKey) === hashQueryKey(options.queryKey)) {
      result.set(resultFromQueryEntry(entry));
    }
  });
  const autoFetch = options.autoFetch ?? typeof document !== "undefined";

  if (autoFetch) {
    void client.fetchQuery(options).catch(() => {
      // The observer receives the error state through the query cache. Avoid an
      // unhandled rejection for fire-and-forget client-side fetches.
    });
  }

  return {
    result,
    dispose: unsubscribe,
    async refetch() {
      await client.fetchQuery(options);
      const next = resultFromQueryEntry<TData>(client.getQueryEntry<TData>(options.queryKey));
      result.set(next);
      return next;
    },
  };
}

export function createMutation<TVariables = void, TData = unknown, TContext = unknown>(
  client: QueryClient,
  options: CreateMutationOptions<TVariables, TData, TContext>,
): MutationObserver<TVariables, TData> {
  const result = cell<MutationResult<TData>>({
    data: undefined,
    error: undefined,
    status: "idle",
    updatedAt: 0,
  });

  return {
    result,
    async mutate(variables: TVariables) {
      result.set({
        data: result.get().data,
        error: undefined,
        status: "pending",
        updatedAt: Date.now(),
      });

      let context: TContext | undefined;

      try {
        context = await options.onMutate?.(variables);
        const data = await options.mutationFn(variables);
        result.set({
          data,
          error: undefined,
          status: "success",
          updatedAt: Date.now(),
        });

        await options.onSuccess?.(data, variables);

        for (const queryKey of options.invalidate ?? []) {
          client.invalidateQueries({ queryKey });
        }

        await options.onSettled?.({ data }, variables, context);

        return data;
      } catch (error) {
        result.set({
          data: undefined,
          error,
          status: "error",
          updatedAt: Date.now(),
        });
        await options.onError?.(error, variables, context);
        await options.onSettled?.({ error }, variables, context);
        throw error;
      }
    },
  };
}

export function dehydrate(client: QueryClient): DehydratedQueryClient {
  return {
    queries: client
      .entries()
      .filter((entry) => entry.status === "success")
      .map((entry) => ({
        data: entry.data,
        queryHash: entry.queryHash,
        queryKey: entry.queryKey,
        updatedAt: entry.updatedAt,
      })),
  };
}

export function hydrate(client: QueryClient, dehydrated: DehydratedQueryClient): void {
  for (const query of dehydrated.queries) {
    client.setQueryData(query.queryKey, query.data);
  }
}

function hydrateFromDocument(client: QueryClient): void {
  const node = document.getElementById(__MREACT_QUERY_STATE_SCRIPT_ID);

  if (node?.textContent === undefined || node.textContent === "") {
    return;
  }

  try {
    hydrate(client, JSON.parse(node.textContent) as DehydratedQueryClient);
  } catch {
    return;
  }
}

function isPromise<T>(value: T): value is T & Promise<unknown> {
  return value instanceof Promise;
}

function queryRuntimeState(): QueryRuntimeState {
  return getGlobalRuntimeState(queryRuntimeStateKey, () => ({}));
}
