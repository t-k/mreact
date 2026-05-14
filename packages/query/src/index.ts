import { cell, type ReadonlyCell } from "@modular-react/reactive-core";

export type QueryKey = readonly unknown[];
export type QueryStatus = "pending" | "success" | "error";
export type MutationStatus = "idle" | "pending" | "success" | "error";

export interface QueryResult<TData> {
  data: TData | undefined;
  error: unknown;
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

export interface FetchQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: () => Promise<TData> | TData;
  staleTime?: number;
}

export interface InvalidateQueriesOptions {
  queryKey?: QueryKey;
}

export interface QueryClient {
  fetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<TData>;
  prefetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<void>;
  getQueryData<TData = unknown>(queryKey: QueryKey): TData | undefined;
  getQueryEntry<TData = unknown>(queryKey: QueryKey): QueryEntry<TData> | undefined;
  setQueryData<TData>(queryKey: QueryKey, data: TData): void;
  invalidateQueries(options?: InvalidateQueriesOptions): void;
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

export interface CreateMutationOptions<TVariables, TData> {
  invalidate?: readonly QueryKey[];
  mutationFn: (variables: TVariables) => Promise<TData> | TData;
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
  promise?: Promise<TData> | undefined;
}

interface QuerySubscription<TData = unknown> {
  queryKey: QueryKey;
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
      isFetching: false,
      queryHash,
      queryKey,
      stale: true,
      status: "pending",
      updatedAt: 0,
    };
    cache.set(queryHash, entry as InternalQueryEntry);

    return entry;
  }

  function notify(entry: InternalQueryEntry): void {
    const publicEntry = toPublicEntry(entry);

    for (const subscription of Array.from(subscriptions)) {
      if (queryKeyStartsWith(entry.queryKey, subscription.queryKey)) {
        subscription.listener(publicEntry);
      }
    }
  }

  function setSuccess<TData>(queryKey: QueryKey, data: TData): void {
    const entry = getOrCreateEntry<TData>(queryKey);
    entry.data = data;
    entry.error = undefined;
    entry.isFetching = false;
    entry.promise = undefined;
    entry.stale = false;
    entry.status = "success";
    entry.updatedAt = Date.now();
    notify(entry);
  }

  return {
    async fetchQuery<TData>(options: FetchQueryOptions<TData>): Promise<TData> {
      const entry = getOrCreateEntry<TData>(options.queryKey);

      if (entry.status === "success" && !entry.stale && isFresh(entry, options.staleTime)) {
        return entry.data as TData;
      }

      if (entry.promise !== undefined) {
        return entry.promise;
      }

      entry.isFetching = true;
      notify(entry);
      entry.promise = Promise.resolve()
        .then(() => options.queryFn())
        .then(
          (data) => {
            setSuccess(options.queryKey, data);
            return data;
          },
          (error: unknown) => {
            entry.error = error;
            entry.isFetching = false;
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
      for (const entry of cache.values()) {
        if (
          options.queryKey === undefined ||
          queryKeyStartsWith(entry.queryKey, options.queryKey)
        ) {
          entry.stale = true;
          notify(entry);
        }
      }
    },
    subscribe<TData = unknown>(
      queryKey: QueryKey,
      listener: (entry: QueryEntry<TData>) => void,
    ): () => void {
      const subscription: QuerySubscription<TData> = { queryKey, listener };
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

export function createMutation<TVariables = void, TData = unknown>(
  client: QueryClient,
  options: CreateMutationOptions<TVariables, TData>,
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

      try {
        const data = await options.mutationFn(variables);
        result.set({
          data,
          error: undefined,
          status: "success",
          updatedAt: Date.now(),
        });

        for (const queryKey of options.invalidate ?? []) {
          client.invalidateQueries({ queryKey });
        }

        return data;
      } catch (error) {
        result.set({
          data: undefined,
          error,
          status: "error",
          updatedAt: Date.now(),
        });
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
  const global = globalThis as typeof globalThis & {
    [queryRuntimeStateKey]?: QueryRuntimeState | undefined;
  };
  global[queryRuntimeStateKey] ??= {};
  return global[queryRuntimeStateKey];
}

export function hashQueryKey(queryKey: QueryKey): string {
  return stableStringify(queryKey);
}

function resultFromEntry<TData>(entry: QueryEntry<TData> | undefined): QueryResult<TData> {
  return {
    data: entry?.data,
    error: entry?.error,
    isFetching: entry?.isFetching ?? false,
    status: entry?.status ?? "pending",
    updatedAt: entry?.updatedAt ?? 0,
  };
}

function toPublicEntry<TData>(entry: InternalQueryEntry<TData>): QueryEntry<TData> {
  return {
    data: entry.data,
    error: entry.error,
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

function queryKeyStartsWith(queryKey: QueryKey, prefix: QueryKey): boolean {
  if (prefix.length > queryKey.length) {
    return false;
  }

  return prefix.every(
    (value, index) => stableStringify(value) === stableStringify(queryKey[index]),
  );
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
