import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { getGlobalRuntimeState } from "@reckona/mreact-reactive-core/runtime-state";
import { createQueryLifecycle, hashQueryKey, resultFromQueryEntry } from "./query-lifecycle.js";

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

export interface InfiniteQueryFunctionContext<TPageParam> extends QueryFunctionContext {
  pageParam: TPageParam;
}

export interface FetchQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: (context: QueryFunctionContext) => Promise<TData> | TData;
  retry?: false | number | undefined;
  retryDelay?: number | ((attempt: number, error: unknown) => number) | undefined;
  signal?: AbortSignal | undefined;
  staleTime?: number;
}

export interface QuerySubscriptionOptions {
  exact?: boolean | undefined;
  gcTime?: false | number | undefined;
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
    options?: QuerySubscriptionOptions,
  ): () => void;
  entries(): QueryEntry[];
}

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

export interface QueryObserver<TData> {
  readonly result: ReadonlyCell<QueryResult<TData>>;
  dispose(): void;
  refetch(): Promise<QueryResult<TData>>;
}

export interface InfiniteQueryData<TPage, TPageParam> {
  pages: readonly TPage[];
  pageParams: readonly TPageParam[];
}

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

export interface InfiniteQueryObserver<TPage, TPageParam> {
  readonly result: ReadonlyCell<InfiniteQueryResult<TPage, TPageParam>>;
  dispose(): void;
  fetchNextPage(): Promise<InfiniteQueryResult<TPage, TPageParam>>;
  refetch(): Promise<InfiniteQueryResult<TPage, TPageParam>>;
}

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
