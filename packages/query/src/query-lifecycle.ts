import { emitQueryDevtoolsEvent } from "./devtools.js";
import {
  hydrateQueryDataSymbol,
  type HydrateQueryDataOptions,
  type HydratableQueryClient,
} from "./hydration-internal.js";
import type {
  FetchQueryOptions,
  InvalidateQueriesOptions,
  QueryClient,
  QueryEntry,
  QueryErrorReason,
  QueryKey,
  QueryResult,
  QuerySubscriptionOptions,
} from "./index.js";

const queryInvalidationRevisionKey = Symbol("mreact.query.invalidationRevision");

interface InternalQueryEntry<TData = unknown> extends QueryEntry<TData> {
  abortController?: AbortController | undefined;
  canceled?: boolean | undefined;
  promise?: Promise<TData> | undefined;
  queryKeySegments: readonly string[];
  invalidationRevision: number;
  version: number;
}

interface SetSuccessOptions {
  queryHash?: string | undefined;
  stale?: boolean | undefined;
  updatedAt?: number | undefined;
}

interface QuerySubscription<TData = unknown> {
  exact: boolean;
  queryHash: string;
  queryKey: QueryKey;
  queryKeySegments: readonly string[];
  listener: (entry: QueryEntry<TData>) => void;
}

export function createQueryLifecycle(): QueryClient & HydratableQueryClient {
  const cache = new Map<string, InternalQueryEntry>();
  const exactSubscriptions = new Map<string, Set<QuerySubscription>>();
  const prefixSubscriptions = new Set<QuerySubscription>();
  const subscriberCounts = new Map<string, number>();
  const gcTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingInvalidationNotifications = new Set<InternalQueryEntry>();
  let invalidationNotifyScheduled = false;

  function getOrCreateEntry<TData>(
    queryKey: QueryKey,
    queryHash = hashQueryKey(queryKey),
  ): InternalQueryEntry<TData> {
    const existing = cache.get(queryHash) as InternalQueryEntry<TData> | undefined;

    if (existing !== undefined) {
      return existing;
    }

    const entry: InternalQueryEntry<TData> = {
      data: undefined,
      error: undefined,
      errorReason: undefined,
      isFetching: false,
      invalidationRevision: 0,
      queryHash,
      queryKey,
      queryKeySegments: hashQueryKeySegments(queryKey),
      stale: true,
      status: "pending",
      updatedAt: 0,
      version: 0,
    };
    cache.set(queryHash, entry as InternalQueryEntry);

    return entry;
  }

  function notify(entry: InternalQueryEntry): void {
    const publicEntry = toPublicEntry(entry);
    notifyPublicEntry(entry.queryKeySegments, publicEntry);
  }

  function scheduleInvalidationNotify(entry: InternalQueryEntry): void {
    pendingInvalidationNotifications.add(entry);

    if (invalidationNotifyScheduled) {
      return;
    }

    invalidationNotifyScheduled = true;
    queueMicrotask(() => {
      invalidationNotifyScheduled = false;
      const entries = Array.from(pendingInvalidationNotifications);
      pendingInvalidationNotifications.clear();

      for (const pendingEntry of entries) {
        if (cache.get(pendingEntry.queryHash) === pendingEntry) {
          notify(pendingEntry);
        }
      }
    });
  }

  function notifyPublicEntry(queryKeySegments: readonly string[], publicEntry: QueryEntry): void {
    emitQueryDevtoolsEvent({
      isFetching: publicEntry.isFetching,
      queryHash: publicEntry.queryHash,
      queryKey: publicEntry.queryKey,
      stale: publicEntry.stale,
      status: publicEntry.status,
      type: "query:update",
    });

    const exact = exactSubscriptions.get(publicEntry.queryHash);
    if (exact !== undefined) {
      for (const subscription of exact) {
        subscription.listener(publicEntry);
      }
    }

    for (const subscription of prefixSubscriptions) {
      if (queryKeyStartsWith(queryKeySegments, subscription.queryKeySegments)) {
        subscription.listener(publicEntry);
      }
    }
  }

  function setSuccess<TData>(
    queryKey: QueryKey,
    data: TData | ((previous: TData | undefined) => TData),
    options: SetSuccessOptions = {},
  ): void {
    const entry = getOrCreateEntry<TData>(queryKey, options.queryHash);
    const resolvedData =
      typeof data === "function"
        ? (data as (previous: TData | undefined) => TData)(entry.data)
        : data;
    const sharedData = replaceEqualDeep(entry.data, resolvedData) as TData;
    if (entry.abortController !== undefined && !entry.abortController.signal.aborted) {
      entry.abortController.abort(createQueryAbortReason(entry.queryKey));
    }

    entry.version += 1;
    entry.data = sharedData;
    entry.error = undefined;
    entry.errorReason = undefined;
    entry.isFetching = false;
    entry.abortController = undefined;
    entry.canceled = false;
    entry.promise = undefined;
    entry.stale = options.stale ?? false;
    entry.status = "success";
    entry.updatedAt = options.updatedAt ?? Date.now();
    notify(entry);
  }

  function hydrateQueryData<TData>(
    queryKey: QueryKey,
    data: TData,
    options: HydrateQueryDataOptions,
  ): void {
    setSuccess(queryKey, data, {
      queryHash: options.queryHash,
      updatedAt: options.updatedAt,
    });
  }

  function retainSubscription(queryKey: QueryKey): void {
    const queryHash = hashQueryKey(queryKey);
    const timer = gcTimers.get(queryHash);
    if (timer !== undefined) {
      clearTimeout(timer);
      gcTimers.delete(queryHash);
    }

    subscriberCounts.set(queryHash, (subscriberCounts.get(queryHash) ?? 0) + 1);
  }

  function releaseSubscription(
    queryKey: QueryKey,
    gcTime: QuerySubscriptionOptions["gcTime"],
  ): void {
    const queryHash = hashQueryKey(queryKey);
    const count = Math.max(0, (subscriberCounts.get(queryHash) ?? 0) - 1);

    if (count > 0) {
      subscriberCounts.set(queryHash, count);
      return;
    }

    subscriberCounts.delete(queryHash);

    if (gcTime === false || gcTime === undefined) {
      return;
    }

    const timer = setTimeout(
      () => {
        gcTimers.delete(queryHash);
        if ((subscriberCounts.get(queryHash) ?? 0) > 0) {
          return;
        }

        const entry = cache.get(queryHash);
        if (entry !== undefined) {
          removeEntry(entry);
        }
      },
      Math.max(0, gcTime),
    );
    gcTimers.set(queryHash, timer);
  }

  function removeEntry(entry: InternalQueryEntry): void {
    if (!cache.delete(entry.queryHash)) {
      return;
    }

    const timer = gcTimers.get(entry.queryHash);
    if (timer !== undefined) {
      clearTimeout(timer);
      gcTimers.delete(entry.queryHash);
    }

    if (entry.abortController !== undefined) {
      entry.canceled = true;
      entry.abortController.abort(createQueryAbortReason(entry.queryKey));
    }

    entry.version += 1;
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
      entry.version += 1;
      const fetchVersion = entry.version;
      const fetchInvalidationRevision = entry.invalidationRevision;
      notify(entry);
      const removeExternalAbort = linkAbortSignals(options.signal, entry.abortController);
      entry.promise = executeQueryWithRetry(options, entry.abortController.signal).then(
        (data) => {
          removeExternalAbort();
          if (cache.get(entry.queryHash) === entry && entry.version === fetchVersion) {
            setSuccess(options.queryKey, data, {
              stale: entry.invalidationRevision !== fetchInvalidationRevision,
            });
          }
          return data;
        },
        (error: unknown) => {
          removeExternalAbort();
          if (cache.get(entry.queryHash) !== entry || entry.version !== fetchVersion) {
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
      await this.fetchQuery(options).catch(() => {});
    },
    getQueryData<TData = unknown>(queryKey: QueryKey): TData | undefined {
      return cache.get(hashQueryKey(queryKey))?.data as TData | undefined;
    },
    getQueryEntry<TData = unknown>(queryKey: QueryKey): QueryEntry<TData> | undefined {
      const entry = cache.get(hashQueryKey(queryKey));

      return entry === undefined ? undefined : (toPublicEntry(entry) as QueryEntry<TData>);
    },
    setQueryData: setSuccess,
    [hydrateQueryDataSymbol]: hydrateQueryData,
    invalidateQueries(options: InvalidateQueriesOptions = {}): void {
      const prefixSegments =
        options.queryKey === undefined ? undefined : hashQueryKeySegments(options.queryKey);

      for (const entry of cache.values()) {
        if (
          prefixSegments === undefined ||
          queryKeyStartsWith(entry.queryKeySegments, prefixSegments)
        ) {
          entry.stale = true;
          entry.invalidationRevision += 1;
          scheduleInvalidationNotify(entry);
        }
      }
    },
    removeQueries(options: InvalidateQueriesOptions = {}): void {
      const prefixSegments =
        options.queryKey === undefined ? undefined : hashQueryKeySegments(options.queryKey);
      const removedEntries: InternalQueryEntry[] = [];

      for (const entry of cache.values()) {
        if (
          prefixSegments === undefined ||
          queryKeyStartsWith(entry.queryKeySegments, prefixSegments)
        ) {
          removedEntries.push(entry);
        }
      }

      for (const entry of removedEntries) {
        removeEntry(entry);
      }
    },
    subscribe<TData = unknown>(
      queryKey: QueryKey,
      listener: (entry: QueryEntry<TData>) => void,
      options: QuerySubscriptionOptions = {},
    ): () => void {
      retainSubscription(queryKey);
      const queryHash = hashQueryKey(queryKey);
      const subscription: QuerySubscription<TData> = {
        exact: options.exact === true,
        listener,
        queryKey,
        queryHash,
        queryKeySegments: hashQueryKeySegments(queryKey),
      };
      if (subscription.exact) {
        let subscriptions = exactSubscriptions.get(queryHash);
        if (subscriptions === undefined) {
          subscriptions = new Set();
          exactSubscriptions.set(queryHash, subscriptions);
        }
        subscriptions.add(subscription as QuerySubscription);
      } else {
        prefixSubscriptions.add(subscription as QuerySubscription);
      }

      return () => {
        if (subscription.exact) {
          const subscriptions = exactSubscriptions.get(queryHash);
          subscriptions?.delete(subscription as QuerySubscription);
          if (subscriptions?.size === 0) {
            exactSubscriptions.delete(queryHash);
          }
        } else {
          prefixSubscriptions.delete(subscription as QuerySubscription);
        }
        releaseSubscription(queryKey, options.gcTime);
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
  entry.version += 1;
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

function linkAbortSignals(source: AbortSignal | undefined, target: AbortController): () => void {
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

  return Math.max(0, value ?? Math.min(1_000 * 2 ** (attempt - 1), 30_000));
}

function classifyQueryError(options: FetchQueryOptions<unknown>, error: unknown): QueryErrorReason {
  void options;

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

/** Creates the stable string hash used to index a query key in the cache. */
export function hashQueryKey(queryKey: QueryKey): string {
  const cached = queryHashCache.get(queryKey);
  if (cached !== undefined) {
    return cached;
  }

  const hash = stableStringify(queryKey);
  queryHashCache.set(queryKey, hash);
  return hash;
}

const queryHashCache = new WeakMap<QueryKey, string>();

export function resultFromQueryEntry<TData>(
  entry: QueryEntry<TData> | undefined,
): QueryResult<TData> {
  return {
    data: entry?.data,
    error: entry?.error,
    errorReason: entry?.errorReason,
    isFetching: entry?.isFetching ?? false,
    status: entry?.status ?? "pending",
    updatedAt: entry?.updatedAt ?? 0,
  };
}

export function queryInvalidationRevision(entry: QueryEntry | undefined): number {
  return (
    (entry as (QueryEntry & { [queryInvalidationRevisionKey]?: number | undefined }) | undefined)?.[
      queryInvalidationRevisionKey
    ] ?? 0
  );
}

function toPublicEntry<TData>(entry: InternalQueryEntry<TData>): QueryEntry<TData> {
  const publicEntry: QueryEntry<TData> = {
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
  Object.defineProperty(publicEntry, queryInvalidationRevisionKey, {
    configurable: false,
    enumerable: false,
    value: entry.invalidationRevision,
  });
  return publicEntry;
}

function isFresh(entry: InternalQueryEntry, staleTime: number | undefined): boolean {
  const age = Date.now() - entry.updatedAt;
  return age >= 0 && age < (staleTime ?? 0);
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
  return stableStringifyValue(value, []);
}

function stableStringifyValue(value: unknown, ancestors: object[]): string {
  if (typeof value === "bigint") {
    return `@BigInt:${value.toString()}`;
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw unsupportedQueryKeyValue(value);
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (ancestors.includes(value)) {
    throw new TypeError("Cyclic query key value is not supported");
  }

  ancestors.push(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringifyValue(entry, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

      return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringifyValue(entryValue, ancestors)}`).join(",")}}`;
    }
    if (value instanceof Date) {
      return `@Date:${JSON.stringify(Date.prototype.toJSON.call(value))}`;
    }
    if (value instanceof URL) {
      return `@URL:${JSON.stringify(value.href)}`;
    }
    if (value instanceof RegExp) {
      return `@RegExp:${JSON.stringify([value.source, value.flags])}`;
    }
    if (value instanceof Set) {
      const entries = Array.from(value, (entry) => stableStringifyValue(entry, ancestors)).sort();
      return `@Set:${JSON.stringify(entries)}`;
    }
    if (value instanceof Map) {
      const entries = Array.from(value, ([key, entryValue]) => [
        stableStringifyValue(key, ancestors),
        stableStringifyValue(entryValue, ancestors),
      ]).sort(compareSerializedMapEntries);
      return `@Map:${JSON.stringify(entries)}`;
    }

    throw unsupportedQueryKeyValue(value);
  } finally {
    ancestors.pop();
  }
}

function compareSerializedMapEntries(left: string[], right: string[]): number {
  if (left[0] !== right[0]) {
    return (left[0] ?? "") < (right[0] ?? "") ? -1 : 1;
  }
  if (left[1] === right[1]) {
    return 0;
  }
  return (left[1] ?? "") < (right[1] ?? "") ? -1 : 1;
}

function unsupportedQueryKeyValue(value: unknown): TypeError {
  const description =
    typeof value === "function"
      ? `function ${value.name || "<anonymous>"}`
      : typeof value === "symbol"
        ? value.toString()
        : ((Object.getPrototypeOf(value)?.constructor as { name?: string } | undefined)?.name ??
          Object.prototype.toString.call(value));
  return new TypeError(`Unsupported query key value: ${description}`);
}

function replaceEqualDeep(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) {
    return previous;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    let equalItems = previous.length === next.length;
    const result = new Array<unknown>(next.length);
    let index = 0;

    while (
      index < previous.length &&
      index < next.length &&
      Object.is(previous[index], next[index])
    ) {
      result[index] = previous[index];
      index += 1;
    }

    for (; index < next.length; index += 1) {
      const nextItem = next[index];
      const replaced = replaceEqualDeep(previous[index], nextItem);
      if (!Object.is(replaced, previous[index])) {
        equalItems = false;
      }
      result[index] = replaced;
    }

    return equalItems ? previous : result;
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    const previousRecord = previous as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    const previousKeys = Object.keys(previousRecord);
    const nextKeys = Object.keys(nextRecord);
    let equalEntries = previousKeys.length === nextKeys.length;
    const result: Record<string, unknown> = {};

    for (const key of nextKeys) {
      if (!Object.hasOwn(previousRecord, key)) {
        equalEntries = false;
      }
      const replaced = replaceEqualDeep(previousRecord[key], nextRecord[key]);
      result[key] = replaced;
      if (!Object.is(replaced, previousRecord[key])) {
        equalEntries = false;
      }
    }

    return equalEntries ? previous : result;
  }

  return next;
}

export const replaceEqualDeepForTesting = replaceEqualDeep;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
