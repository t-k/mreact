import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { getGlobalRuntimeState } from "@reckona/mreact-reactive-core/runtime-state";
import { hydrateQueryDataSymbol, type HydratableQueryClient } from "./hydration-internal.js";
import { createQueryLifecycle, hashQueryKey, resultFromQueryEntry } from "./query-lifecycle.js";

export { hashQueryKey } from "./query-lifecycle.js";

/** Represents the structured key used to identify cached query data. */
export type QueryKey = readonly unknown[];

/** Represents the lifecycle state of a query entry or observer result. */
export type QueryStatus = "pending" | "success" | "error";

/** Represents the lifecycle state of a mutation observer result. */
export type MutationStatus = "idle" | "pending" | "success" | "error";

/** Classifies why a query fetch failed. */
export type QueryErrorReason = "aborted" | "retry-exhausted" | "network" | "unknown";

/** Describes the reactive result exposed by a query observer. */
export interface QueryResult<TData> {
  data: TData | undefined;
  error: unknown;
  errorReason: QueryErrorReason | undefined;
  isFetching: boolean;
  status: QueryStatus;
  updatedAt: number;
}

/** Describes the reactive result exposed by a mutation observer. */
export interface MutationResult<TData> {
  data: TData | undefined;
  error: unknown;
  status: MutationStatus;
  updatedAt: number;
}

/** Stores the cache metadata and result state for one query key. */
export interface QueryEntry<TData = unknown> extends QueryResult<TData> {
  queryHash: string;
  queryKey: QueryKey;
  stale: boolean;
}

/** Provides query key and cancellation signal data to a query function. */
export interface QueryFunctionContext {
  queryKey: QueryKey;
  signal: AbortSignal;
}

/** Provides pagination parameters to an infinite query function. */
export interface InfiniteQueryFunctionContext<TPageParam> extends QueryFunctionContext {
  pageParam: TPageParam;
}

/** Configures a direct query fetch through a query client. */
export interface FetchQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: (context: QueryFunctionContext) => Promise<TData> | TData;
  retry?: false | number | undefined;
  retryDelay?: number | ((attempt: number, error: unknown) => number) | undefined;
  signal?: AbortSignal | undefined;
  staleTime?: number;
}

/** Configures cache subscription matching and idle garbage collection. */
export interface QuerySubscriptionOptions {
  exact?: boolean | undefined;
  gcTime?: false | number | undefined;
}

/** Selects query entries for invalidation, cancellation, or removal. */
export interface InvalidateQueriesOptions {
  queryKey?: QueryKey;
}

/** Provides cache reads, fetches, invalidation, removal, and subscriptions for queries. */
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
    options?: QuerySubscriptionOptions,
  ): () => void;
  entries(): QueryEntry[];
}

/** Configures a reactive query observer. */
export interface CreateQueryOptions<TData> extends FetchQueryOptions<TData> {
  /**
   * Fetch when the observer is created and the cache does not already contain
   * fresh data. Defaults to true in browsers and false during server render.
   */
  autoFetch?: boolean | undefined;
  /**
   * Remove the cached entry after the last observer disposes. Disabled by
   * default; pass a non-negative millisecond value to enable idle eviction.
   */
  gcTime?: false | number | undefined;
  /**
   * Refetch when the browser tab becomes visible or the window regains focus.
   * Defaults to false.
   */
  refetchOnWindowFocus?: boolean | undefined;
  /**
   * Refetch when the browser reports that the network is online again.
   * Defaults to false.
   */
  refetchOnReconnect?: boolean | undefined;
}

/** Observes one query result and exposes refetch and disposal controls. */
export interface QueryObserver<TData> {
  readonly result: ReadonlyCell<QueryResult<TData>>;
  dispose(): void;
  refetch(): Promise<QueryResult<TData>>;
}

/** Stores the pages and page parameters held by an infinite query. */
export interface InfiniteQueryData<TPage, TPageParam> {
  pages: readonly TPage[];
  pageParams: readonly TPageParam[];
}

/** Describes the reactive result exposed by an infinite query observer. */
export interface InfiniteQueryResult<TPage, TPageParam> extends InfiniteQueryData<
  TPage,
  TPageParam
> {
  error: unknown;
  errorReason: QueryErrorReason | undefined;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  status: QueryStatus;
  updatedAt: number;
}

/** Configures a reactive infinite query observer. */
export interface CreateInfiniteQueryOptions<TPage, TPageParam> extends Omit<
  FetchQueryOptions<InfiniteQueryData<TPage, TPageParam>>,
  "queryFn"
> {
  /**
   * Fetch the first page when the observer is created and the cache does not
   * already contain data. Defaults to true in browsers and false during server
   * render.
   */
  autoFetch?: boolean | undefined;
  getNextPageParam:
    | ((lastPage: TPage, pages: readonly TPage[]) => TPageParam | null | undefined)
    | undefined;
  initialData?: InfiniteQueryData<TPage, TPageParam> | undefined;
  initialPageParam: TPageParam;
  queryFn: (context: InfiniteQueryFunctionContext<TPageParam>) => Promise<TPage> | TPage;
  refetchOnReconnect?: boolean | undefined;
  refetchOnWindowFocus?: boolean | undefined;
}

/** Observes paginated query data and exposes next-page, refetch, and disposal controls. */
export interface InfiniteQueryObserver<TPage, TPageParam> {
  readonly result: ReadonlyCell<InfiniteQueryResult<TPage, TPageParam>>;
  dispose(): void;
  fetchNextPage(): Promise<InfiniteQueryResult<TPage, TPageParam>>;
  refetch(): Promise<InfiniteQueryResult<TPage, TPageParam>>;
}

/** Configures a mutation observer with lifecycle callbacks and invalidation keys. */
export interface CreateMutationOptions<TVariables, TData, TContext = unknown> {
  invalidate?: readonly QueryKey[];
  mutationFn: (variables: TVariables) => Promise<TData> | TData;
  onError?:
    | ((
        error: unknown,
        variables: TVariables,
        context: TContext | undefined,
      ) => Promise<void> | void)
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

/** Observes mutation state and exposes the mutation trigger. */
export interface MutationObserver<TVariables, TData> {
  readonly result: ReadonlyCell<MutationResult<TData>>;
  mutate(variables: TVariables): Promise<TData>;
}

/** Represents one successful query entry serialized for server-to-client hydration. */
export interface DehydratedQuery {
  data: unknown;
  queryHash: string;
  queryKey: QueryKey;
  updatedAt: number;
}

/** Represents the serializable query cache payload embedded in server-rendered HTML. */
export interface DehydratedQueryClient {
  queries: DehydratedQuery[];
}

/** Identifies the script element that carries dehydrated query state during hydration. */
export const __MREACT_QUERY_STATE_SCRIPT_ID = "__mreact_query_state";

const queryRuntimeStateKey = "__mreactQueryRuntimeState";
const queryClientScopeUnavailableErrorKey = "__mreactQueryClientScopeUnavailable";

interface QueryRuntimeState {
  asyncStorage?: QueryAsyncStorage<QueryClient> | undefined;
  browserQueryClient?: QueryClient | undefined;
}

/** Provides the AsyncLocalStorage-compatible interface used for server-scoped query clients. */
export interface QueryAsyncStorage<T> {
  getStore(): T | undefined;
  run<TResult>(store: T, callback: () => TResult): TResult;
}

interface QueryClientScopeUnavailableError extends Error {
  [queryClientScopeUnavailableErrorKey]: true;
}

/**
 * Creates an isolated query client for cache reads, fetches, mutations, hydration, and subscriptions.
 */
export function createQueryClient(): QueryClient {
  return createQueryLifecycle();
}

/**
 * Returns the current scoped query client on the server or the shared browser query client in the browser.
 *
 * Browser calls automatically hydrate from the mreact query state script when present.
 */
export function getQueryClient(): QueryClient {
  const state = queryRuntimeState();
  const scopedClient = queryAsyncStorage(state)?.getStore();

  if (scopedClient !== undefined) {
    return scopedClient;
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

/**
 * Runs a callback with a server-scoped query client.
 *
 * Node runtimes need `AsyncLocalStorage` support or a custom storage installed with `installQueryAsyncStorage()`.
 */
export function runWithQueryClient<T>(client: QueryClient, fn: () => T): T {
  const state = queryRuntimeState();
  const asyncStorage = queryAsyncStorage(state);

  if (asyncStorage === undefined) {
    throw createQueryClientScopeUnavailableError();
  }

  return asyncStorage.run(client, fn);
}

/** Resets process-wide query runtime state for tests. */
export function __resetQueryClientForTesting(): void {
  const state = queryRuntimeState();
  state.asyncStorage = undefined;
  state.browserQueryClient = undefined;
}

/** Installs custom async storage for server-scoped query clients. */
export function installQueryAsyncStorage(storage: QueryAsyncStorage<QueryClient>): void {
  queryRuntimeState().asyncStorage = storage;
}

/** Checks whether an error came from missing server query-client async storage. */
export function isQueryClientScopeUnavailableError(
  error: unknown,
): error is QueryClientScopeUnavailableError {
  return (
    error instanceof Error &&
    (error as Partial<QueryClientScopeUnavailableError>)[queryClientScopeUnavailableErrorKey] ===
      true
  );
}

/**
 * Creates a reactive query observer backed by a `QueryClient`.
 *
 * The observer exposes a `ReadonlyCell` result, subscribes to exact cache updates, can auto-fetch in the browser, and must be disposed when the consuming scope ends.
 */
export function createQuery<TData>(
  client: QueryClient,
  options: CreateQueryOptions<TData>,
): QueryObserver<TData> {
  const queryHash = hashQueryKey(options.queryKey);
  const result = cell(resultFromQueryEntry<TData>(client.getQueryEntry<TData>(options.queryKey)));
  const unsubscribe = client.subscribe<TData>(options.queryKey, (entry) => {
    if (entry.queryHash === queryHash) {
      result.set(resultFromQueryEntry(entry));
    }
  }, { exact: true, gcTime: options.gcTime });
  const autoFetch = options.autoFetch ?? typeof document !== "undefined";

  if (autoFetch) {
    void client.fetchQuery(options).catch(() => {
      // The observer receives the error state through the query cache. Avoid an
      // unhandled rejection for fire-and-forget client-side fetches.
    });
  }

  const refetch = async () => {
    client.invalidateQueries({ queryKey: options.queryKey });
    await client.fetchQuery(options);
    const next = resultFromQueryEntry<TData>(client.getQueryEntry<TData>(options.queryKey));
    result.set(next);
    return next;
  };
  const unsubscribeBrowserRevalidation = registerBrowserRevalidation(options, refetch);

  return {
    result,
    dispose() {
      unsubscribe();
      unsubscribeBrowserRevalidation();
    },
    refetch,
  };
}

/**
 * Creates a reactive infinite-query observer backed by a `QueryClient`.
 *
 * It stores pages in the main query entry, fetches extra pages with derived page keys, and reports `isFetchingNextPage` while pagination is in progress.
 */
export function createInfiniteQuery<TPage, TPageParam>(
  client: QueryClient,
  options: CreateInfiniteQueryOptions<TPage, TPageParam>,
): InfiniteQueryObserver<TPage, TPageParam> {
  if (options.initialData !== undefined && client.getQueryData(options.queryKey) === undefined) {
    client.setQueryData(options.queryKey, options.initialData);
  }

  let isFetchingNextPage = false;
  let nextPagePromise: Promise<InfiniteQueryResult<TPage, TPageParam>> | undefined;
  const readEntry = () =>
    client.getQueryEntry<InfiniteQueryData<TPage, TPageParam>>(options.queryKey);
  const result = cell(infiniteResultFromQueryEntry(readEntry(), options, isFetchingNextPage));
  const updateResult = () => {
    const next = infiniteResultFromQueryEntry(readEntry(), options, isFetchingNextPage);
    result.set(next);
    return next;
  };
  const unsubscribe = client.subscribe<InfiniteQueryData<TPage, TPageParam>>(
    options.queryKey,
    () => {
      updateResult();
    },
    { exact: true },
  );

  const firstPageOptions = (): FetchQueryOptions<InfiniteQueryData<TPage, TPageParam>> =>
    withInfiniteQueryFetchOptions(options, {
      queryKey: options.queryKey,
      queryFn: async ({ signal }) => {
        const page = await options.queryFn({
          pageParam: options.initialPageParam,
          queryKey: options.queryKey,
          signal,
        });
        return {
          pages: [page],
          pageParams: [options.initialPageParam],
        };
      },
    });

  const refetch = async () => {
    client.invalidateQueries({ queryKey: options.queryKey });
    removeInfinitePageEntries(client, options.queryKey);
    await client.fetchQuery(firstPageOptions());
    removeInfinitePageEntries(client, options.queryKey);
    return updateResult();
  };

  const autoFetch = options.autoFetch ?? typeof document !== "undefined";
  if (autoFetch && client.getQueryData(options.queryKey) === undefined) {
    void client.fetchQuery(firstPageOptions()).catch(() => {
      updateResult();
    });
  }

  const unsubscribeBrowserRevalidation = registerBrowserRevalidation(options, refetch);

  return {
    result,
    dispose() {
      unsubscribe();
      unsubscribeBrowserRevalidation();
    },
    async fetchNextPage() {
      if (nextPagePromise !== undefined) {
        return nextPagePromise;
      }

      const currentData = client.getQueryData<InfiniteQueryData<TPage, TPageParam>>(
        options.queryKey,
      );
      if (currentData === undefined || currentData.pages.length === 0) {
        return refetch();
      }

      const lastPage = currentData.pages[currentData.pages.length - 1];
      if (lastPage === undefined || options.getNextPageParam === undefined) {
        return updateResult();
      }

      const nextPageParam = options.getNextPageParam(lastPage, currentData.pages);
      if (nextPageParam === null || nextPageParam === undefined) {
        return updateResult();
      }

      isFetchingNextPage = true;
      updateResult();
      nextPagePromise = (async () => {
        const nextPageKey = pageQueryKey(options.queryKey, nextPageParam);
        try {
          const nextPage = await client.fetchQuery<TPage>(
            withInfiniteQueryFetchOptions(options, {
              queryKey: nextPageKey,
              queryFn: ({ signal }) =>
                options.queryFn({
                  pageParam: nextPageParam,
                  queryKey: options.queryKey,
                  signal,
                }),
            }),
          );
          const latestData =
            client.getQueryData<InfiniteQueryData<TPage, TPageParam>>(options.queryKey) ??
            currentData;

          if (!includesPageParam(latestData.pageParams, nextPageParam)) {
            client.setQueryData<InfiniteQueryData<TPage, TPageParam>>(options.queryKey, {
              pages: [...latestData.pages, nextPage],
              pageParams: [...latestData.pageParams, nextPageParam],
            });
          }
          client.removeQueries({ queryKey: nextPageKey });

          return updateResult();
        } finally {
          isFetchingNextPage = false;
          nextPagePromise = undefined;
          updateResult();
        }
      })();

      return nextPagePromise;
    },
    refetch,
  };
}

/**
 * Creates a mutation observer with lifecycle hooks and optional query invalidation.
 */
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

/**
 * Serializes successful query entries so they can be embedded in server-rendered HTML.
 */
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

/**
 * Restores dehydrated query entries into a query client before observers read them.
 */
export function hydrate(client: QueryClient, dehydrated: DehydratedQueryClient): void {
  const hydratableClient = client as QueryClient & Partial<HydratableQueryClient>;

  for (const query of dehydrated.queries) {
    if (hydratableClient[hydrateQueryDataSymbol] !== undefined) {
      hydratableClient[hydrateQueryDataSymbol](query.queryKey, query.data, {
        updatedAt: query.updatedAt,
      });
      continue;
    }

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

function queryRuntimeState(): QueryRuntimeState {
  return getGlobalRuntimeState(queryRuntimeStateKey, () => ({}));
}

function queryAsyncStorage(state: QueryRuntimeState): QueryAsyncStorage<QueryClient> | undefined {
  if (state.asyncStorage !== undefined) {
    return state.asyncStorage;
  }

  const AsyncStorage = (
    globalThis as {
      AsyncLocalStorage?: new <T>() => QueryAsyncStorage<T>;
    }
  ).AsyncLocalStorage;

  if (AsyncStorage === undefined) {
    return undefined;
  }

  state.asyncStorage = new AsyncStorage<QueryClient>();
  return state.asyncStorage;
}

function createQueryClientScopeUnavailableError(): QueryClientScopeUnavailableError {
  const error = new Error(
    "mreact query client scope is unavailable on the server. Install AsyncLocalStorage with installQueryAsyncStorage() or run in a supported Node runtime.",
  ) as QueryClientScopeUnavailableError;
  error[queryClientScopeUnavailableErrorKey] = true;
  return error;
}

function infiniteResultFromQueryEntry<TPage, TPageParam>(
  entry: QueryEntry<InfiniteQueryData<TPage, TPageParam>> | undefined,
  options: CreateInfiniteQueryOptions<TPage, TPageParam>,
  isFetchingNextPage: boolean,
): InfiniteQueryResult<TPage, TPageParam> {
  const data = entry?.data ?? { pages: [], pageParams: [] };
  const lastPage = data.pages[data.pages.length - 1];
  const nextPageParam =
    lastPage === undefined || options.getNextPageParam === undefined
      ? undefined
      : options.getNextPageParam(lastPage, data.pages);

  return {
    error: entry?.error,
    errorReason: entry?.errorReason,
    hasNextPage: data.pages.length === 0 || (nextPageParam !== null && nextPageParam !== undefined),
    isFetching: (entry?.isFetching ?? false) || isFetchingNextPage,
    isFetchingNextPage,
    pages: data.pages,
    pageParams: data.pageParams,
    status: entry?.status ?? "pending",
    updatedAt: entry?.updatedAt ?? 0,
  };
}

function pageQueryKey<TPageParam>(queryKey: QueryKey, pageParam: TPageParam): QueryKey {
  return [...queryKey, "__infinite_page", pageParam];
}

function infinitePageQueryKeyPrefix(queryKey: QueryKey): QueryKey {
  return [...queryKey, "__infinite_page"];
}

function removeInfinitePageEntries(client: QueryClient, queryKey: QueryKey): void {
  client.removeQueries({ queryKey: infinitePageQueryKeyPrefix(queryKey) });
}

function includesPageParam<TPageParam>(
  pageParams: readonly TPageParam[],
  pageParam: TPageParam,
): boolean {
  if (pageParams.some((existing) => Object.is(existing, pageParam))) {
    return true;
  }

  const pageParamHash = hashQueryKey([pageParam]);
  return pageParams.some((existing) => hashQueryKey([existing]) === pageParamHash);
}

function withInfiniteQueryFetchOptions<TData, TPage, TPageParam>(
  options: CreateInfiniteQueryOptions<TPage, TPageParam>,
  fetchOptions: Pick<FetchQueryOptions<TData>, "queryFn" | "queryKey">,
): FetchQueryOptions<TData> {
  return {
    ...fetchOptions,
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(options.retryDelay === undefined ? {} : { retryDelay: options.retryDelay }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.staleTime === undefined ? {} : { staleTime: options.staleTime }),
  };
}

function registerBrowserRevalidation(
  options: {
    refetchOnReconnect?: boolean | undefined;
    refetchOnWindowFocus?: boolean | undefined;
  },
  refetch: () => Promise<unknown>,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let scheduled = false;
  const requestRefetch = () => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void refetch().catch(() => {
        // Query state receives the error through the cache; event handlers must
        // remain fire-and-forget to avoid noisy browser rejections.
      });
    });
  };
  const cleanups: Array<() => void> = [];

  if (options.refetchOnWindowFocus === true) {
    window.addEventListener("focus", requestRefetch);
    cleanups.push(() => window.removeEventListener("focus", requestRefetch));

    if (typeof document !== "undefined") {
      const refetchWhenVisible = () => {
        if (document.visibilityState === "visible") {
          requestRefetch();
        }
      };
      document.addEventListener("visibilitychange", refetchWhenVisible);
      cleanups.push(() => document.removeEventListener("visibilitychange", refetchWhenVisible));
    }
  }

  if (options.refetchOnReconnect === true) {
    window.addEventListener("online", requestRefetch);
    cleanups.push(() => window.removeEventListener("online", requestRefetch));
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
