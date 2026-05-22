import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { getGlobalRuntimeState } from "@reckona/mreact-reactive-core/runtime-state";
import { emitQueryDevtoolsEvent } from "./devtools.js";

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

export interface CreateQueryOptions<TData> extends FetchQueryOptions<TData> {}

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

interface InternalQueryEntry<TData = unknown> extends QueryEntry<TData> {
  abortController?: AbortController | undefined;
  canceled?: boolean | undefined;
  promise?: Promise<TData> | undefined;
  queryKeySegments: readonly string[];
}

interface QuerySubscription<TData = unknown> {
  queryKey: QueryKey;
  queryKeySegments: readonly string[];
  listener: (entry: QueryEntry<TData>) => void;
}

const queryRuntimeStateKey = "__mreactQueryRuntimeState";

interface QueryRuntimeState {
  browserQueryClient?: QueryClient | undefined;
  currentQueryClient?: QueryClient | undefined;
}

export function createQueryClient(): QueryClient {
  const cache = new Map<string, InternalQueryEntry>();
  const subscriptions = new Set<QuerySubscription>();

  function getOrCreateEntry<TData>(queryKey: QueryKey): InternalQueryEntry<TData> {
    const queryHash = hashQueryKey(queryKey);
    const existing = cache.get(queryHash) as InternalQueryEntry<TData> | undefined;

    if (existing !== undefined) {
      return existing;
    }

    const entry: InternalQueryEntry<TData> = {
      data: undefined,
      error: undefined,
      errorReason: undefined,
      isFetching: false,
      queryHash,
      queryKey,
      queryKeySegments: hashQueryKeySegments(queryKey),
      stale: true,
      status: "pending",
      updatedAt: 0,
    };
    cache.set(queryHash, entry as InternalQueryEntry);

    return entry;
  }

  function notify(entry: InternalQueryEntry): void {
    const publicEntry = toPublicEntry(entry);
    notifyPublicEntry(entry.queryKeySegments, publicEntry);
  }

  function notifyPublicEntry(
    queryKeySegments: readonly string[],
    publicEntry: QueryEntry,
  ): void {
    emitQueryDevtoolsEvent({
      isFetching: publicEntry.isFetching,
      queryHash: publicEntry.queryHash,
      queryKey: publicEntry.queryKey,
      stale: publicEntry.stale,
      status: publicEntry.status,
      type: "query:update",
    });

    for (const subscription of Array.from(subscriptions)) {
      if (queryKeyStartsWith(queryKeySegments, subscription.queryKeySegments)) {
        subscription.listener(publicEntry);
      }
    }
  }

  function setSuccess<TData>(queryKey: QueryKey, data: TData): void {
    const entry = getOrCreateEntry<TData>(queryKey);
    entry.data = data;
    entry.error = undefined;
    entry.errorReason = undefined;
    entry.isFetching = false;
    entry.abortController = undefined;
    entry.canceled = false;
    entry.promise = undefined;
    entry.stale = false;
    entry.status = "success";
    entry.updatedAt = Date.now();
    notify(entry);
  }

  return {
    cancelQueries(options: InvalidateQueriesOptions = {}): void {
      const prefixSegments =
        options.queryKey === undefined ? undefined : hashQueryKeySegments(options.queryKey);

      for (const entry of cache.values()) {
        if (
          (prefixSegments === undefined ||
            queryKeyStartsWith(entry.queryKeySegments, prefixSegments)) &&
          entry.abortController !== undefined
        ) {
          entry.abortController.abort(createQueryAbortReason(entry.queryKey));
          markCanceled(entry, notify);
        }
      }
    },
    async fetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<TData> {
      const entry = getOrCreateEntry<TData>(options.queryKey);

      if (entry.status === "success" && !entry.stale && isFresh(entry, options.staleTime)) {
        return entry.data as TData;
      }

      if (entry.promise !== undefined) {
        return entry.promise;
      }

      entry.isFetching = true;
      entry.abortController = new AbortController();
      entry.canceled = false;
      notify(entry);
      const removeExternalAbort = linkAbortSignals(options.signal, entry.abortController);
      entry.promise = executeQueryWithRetry(options, entry.abortController.signal)
        .then(
          (data) => {
            removeExternalAbort();
            if (cache.get(entry.queryHash) === entry) {
              setSuccess(options.queryKey, data);
            }
            return data;
          },
          (error: unknown) => {
            removeExternalAbort();
            if (cache.get(entry.queryHash) !== entry) {
              throw error;
            }
            if (entry.canceled === true || entry.abortController?.signal.aborted === true) {
              markCanceled(entry, notify);
              throw error;
            }
            entry.error = error;
            entry.errorReason = classifyQueryError(options, error);
            entry.isFetching = false;
            entry.abortController = undefined;
            entry.promise = undefined;
            entry.stale = true;
            entry.status = "error";
            entry.updatedAt = Date.now();
            notify(entry);
            throw error;
          },
        );

      return entry.promise;
    },
    async prefetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<void> {
      await this.fetchQuery(options);
    },
    getQueryData<TData = unknown>(queryKey: QueryKey): TData | undefined {
      return cache.get(hashQueryKey(queryKey))?.data as TData | undefined;
    },
    getQueryEntry<TData = unknown>(queryKey: QueryKey): QueryEntry<TData> | undefined {
      const entry = cache.get(hashQueryKey(queryKey));

      return entry === undefined ? undefined : (toPublicEntry(entry) as QueryEntry<TData>);
    },
    setQueryData: setSuccess,
    invalidateQueries(options: InvalidateQueriesOptions = {}): void {
      const prefixSegments =
        options.queryKey === undefined ? undefined : hashQueryKeySegments(options.queryKey);

      for (const entry of cache.values()) {
        if (
          prefixSegments === undefined ||
          queryKeyStartsWith(entry.queryKeySegments, prefixSegments)
        ) {
          entry.stale = true;
          notify(entry);
        }
      }
    },
    removeQueries(options: InvalidateQueriesOptions = {}): void {
      const prefixSegments =
        options.queryKey === undefined ? undefined : hashQueryKeySegments(options.queryKey);
      const removedEntries = Array.from(cache.values()).filter(
        (entry) =>
          prefixSegments === undefined ||
          queryKeyStartsWith(entry.queryKeySegments, prefixSegments),
      );

      for (const entry of removedEntries) {
        if (!cache.delete(entry.queryHash)) {
          continue;
        }

        if (entry.abortController !== undefined) {
          entry.canceled = true;
          entry.abortController.abort(createQueryAbortReason(entry.queryKey));
        }

        entry.abortController = undefined;
        entry.data = undefined;
        entry.error = undefined;
        entry.errorReason = undefined;
        entry.isFetching = false;
        entry.promise = undefined;
        entry.stale = true;
        entry.status = "pending";
        entry.updatedAt = Date.now();
        notifyPublicEntry(entry.queryKeySegments, toPublicEntry(entry));
      }
    },
    subscribe<TData = unknown>(
      queryKey: QueryKey,
      listener: (entry: QueryEntry<TData>) => void,
    ): () => void {
      const subscription: QuerySubscription<TData> = {
        listener,
        queryKey,
        queryKeySegments: hashQueryKeySegments(queryKey),
      };
      subscriptions.add(subscription as QuerySubscription);

      return () => {
        subscriptions.delete(subscription as QuerySubscription);
      };
    },
    entries(): QueryEntry[] {
      return Array.from(cache.values(), toPublicEntry);
    },
  };
}

async function executeQueryWithRetry<TData>(
  options: FetchQueryOptions<TData>,
  signal: AbortSignal,
): Promise<TData> {
  const retryLimit = options.retry === false ? 0 : Math.max(0, options.retry ?? 0);
  let attempt = 0;

  while (true) {
    throwIfAborted(signal);

    try {
      return await options.queryFn({ queryKey: options.queryKey, signal });
    } catch (error) {
      if (signal.aborted || attempt >= retryLimit) {
        throw error;
      }

      attempt += 1;
      await waitForRetryDelay(retryDelayMs(options.retryDelay, attempt, error), signal);
    }
  }
}

function markCanceled(
  entry: InternalQueryEntry,
  notify: (entry: InternalQueryEntry) => void,
): void {
  entry.error = undefined;
  entry.errorReason = "aborted";
  entry.isFetching = false;
  entry.abortController = undefined;
  entry.canceled = true;
  entry.promise = undefined;
  entry.stale = true;
  entry.status = entry.data === undefined ? "pending" : "success";
  entry.updatedAt = Date.now();
  notify(entry);
}

function linkAbortSignals(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (source === undefined) {
    return () => {};
  }

  if (source.aborted) {
    target.abort(source.reason);
    return () => {};
  }

  const abort = () => target.abort(source.reason);
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function retryDelayMs(
  retryDelay: FetchQueryOptions<unknown>["retryDelay"],
  attempt: number,
  error: unknown,
): number {
  const value = typeof retryDelay === "function" ? retryDelay(attempt, error) : retryDelay;

  return Math.max(0, value ?? 0);
}

function classifyQueryError(options: FetchQueryOptions<unknown>, error: unknown): QueryErrorReason {
  const retryLimit = options.retry === false ? 0 : Math.max(0, options.retry ?? 0);

  if (retryLimit > 0) {
    return "retry-exhausted";
  }

  return error instanceof TypeError ? "network" : "unknown";
}

function waitForRetryDelay(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  if (ms === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason;
  }
}

function createQueryAbortReason(queryKey: QueryKey): Error {
  return new Error(`Query canceled: ${hashQueryKey(queryKey)}`);
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
  const result = cell(resultFromEntry<TData>(client.getQueryEntry<TData>(options.queryKey)));
  const unsubscribe = client.subscribe<TData>(options.queryKey, (entry) => {
    if (hashQueryKey(entry.queryKey) === hashQueryKey(options.queryKey)) {
      result.set(resultFromEntry(entry));
    }
  });

  return {
    result,
    dispose: unsubscribe,
    async refetch() {
      await client.fetchQuery(options);
      const next = resultFromEntry<TData>(client.getQueryEntry<TData>(options.queryKey));
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

export function hashQueryKey(queryKey: QueryKey): string {
  return stableStringify(queryKey);
}

function resultFromEntry<TData>(entry: QueryEntry<TData> | undefined): QueryResult<TData> {
  return {
    data: entry?.data,
    error: entry?.error,
    errorReason: entry?.errorReason,
    isFetching: entry?.isFetching ?? false,
    status: entry?.status ?? "pending",
    updatedAt: entry?.updatedAt ?? 0,
  };
}

function toPublicEntry<TData>(entry: InternalQueryEntry<TData>): QueryEntry<TData> {
  return {
    data: entry.data,
    error: entry.error,
    errorReason: entry.errorReason,
    isFetching: entry.isFetching,
    queryHash: entry.queryHash,
    queryKey: entry.queryKey,
    stale: entry.stale,
    status: entry.status,
    updatedAt: entry.updatedAt,
  };
}

function isFresh(entry: InternalQueryEntry, staleTime: number | undefined): boolean {
  return Date.now() - entry.updatedAt < (staleTime ?? 0);
}

function hashQueryKeySegments(queryKey: QueryKey): readonly string[] {
  return queryKey.map(stableStringify);
}

function queryKeyStartsWith(
  queryKeySegments: readonly string[],
  prefixSegments: readonly string[],
): boolean {
  if (prefixSegments.length > queryKeySegments.length) {
    return false;
  }

  for (let index = 0; index < prefixSegments.length; index += 1) {
    if (prefixSegments[index] !== queryKeySegments[index]) {
      return false;
    }
  }

  return true;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}
