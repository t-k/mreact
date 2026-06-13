import {
  hydrateQueryDataSymbol,
  type HydratableQueryClient,
} from "./hydration-internal.js";
import { hashQueryKey } from "./query-lifecycle.js";
import type {
  FetchQueryOptions,
  InvalidateQueriesOptions,
  QueryClient,
  QueryEntry,
  QueryKey,
} from "./index.js";

/** Configures optional same-origin query cache coordination across browser tabs. */
export interface CrossTabQuerySyncOptions {
  /**
   * BroadcastChannel name. Query messages require a non-default name scoped to a session, user, or tenant.
   */
  channel?: string | undefined;
  /**
   * Broadcast successful query data to other tabs. Requires scoped `channel` and `includeQuery`.
   */
  broadcastQueryData?: boolean | undefined;
  /**
   * Broadcast query-keyed invalidation calls to other tabs when scoped query sync is enabled. Defaults to true.
   */
  broadcastInvalidations?: boolean | undefined;
  /**
   * Broadcast query-keyed removal calls to other tabs when scoped query sync is enabled. Defaults to true.
   */
  broadcastRemovals?: boolean | undefined;
  /**
   * Use Web Locks plus BroadcastChannel result handoff to avoid duplicate same-query fetches across tabs. Requires scoped `channel` and `includeQuery`.
   */
  singleFlight?: boolean | undefined;
  /**
   * Maximum time a lock follower waits for another tab to hand off successful data before fetching itself.
   */
  singleFlightHandoffTimeoutMs?: number | undefined;
  /**
   * Allowlist for query keys that participate in cross-tab sync. Required for any query message.
   */
  includeQuery?: ((queryKey: QueryKey) => boolean) | undefined;
}

type QuerySyncMessage =
  | {
      data: unknown;
      queryHash: string;
      queryKey: QueryKey;
      senderId: string;
      type: "success";
      updatedAt: number;
      version: 1;
    }
  | {
      queryKey: QueryKey;
      senderId: string;
      type: "invalidate" | "remove";
      version: 1;
    };

interface SuccessWaiter {
  reject(error: Error): void;
  resolve(message: Extract<QuerySyncMessage, { type: "success" }>): void;
}

interface BrowserLockManager {
  request<T>(
    name: string,
    callback: (lock: unknown) => T | Promise<T>,
  ): Promise<T>;
  request<T>(
    name: string,
    options: { ifAvailable?: boolean | undefined },
    callback: (lock: unknown | null) => T | Promise<T>,
  ): Promise<T>;
}

interface PendingSuccessWaiter {
  cancel(): void;
  promise: Promise<Extract<QuerySyncMessage, { type: "success" }> | undefined>;
}

const defaultChannelName = "mreact-query:v1";
const defaultSingleFlightHandoffTimeoutMs = 1_000;
const localSingleFlights = new Map<string, Promise<unknown>>();

/**
 * Installs optional same-origin query synchronization for a browser query client.
 *
 * The adapter mutates the provided client and returns a disposer that restores the original methods.
 */
export function syncQueryClientAcrossTabs(
  client: QueryClient,
  options: CrossTabQuerySyncOptions = {},
): () => void {
  if (!isBrowserWithBroadcastChannel()) {
    return () => undefined;
  }

  const channel = new BroadcastChannel(options.channel ?? defaultChannelName);
  const senderId = createClientId();
  const waiters = new Map<string, Set<SuccessWaiter>>();
  const originalFetchQuery = client.fetchQuery.bind(client) as QueryClient["fetchQuery"];
  const originalSetQueryData = client.setQueryData.bind(client) as QueryClient["setQueryData"];
  const originalInvalidateQueries = client.invalidateQueries.bind(client) as QueryClient["invalidateQueries"];
  const originalRemoveQueries = client.removeQueries.bind(client) as QueryClient["removeQueries"];
  const canSyncQueryMessages = scopedQuerySyncAllowed(options);
  const canShareQueryData = canSyncQueryMessages;
  const singleFlight = options.singleFlight === true && canShareQueryData;
  const broadcastQueryData = canShareQueryData && (options.broadcastQueryData === true || singleFlight);
  const broadcastInvalidations = options.broadcastInvalidations !== false;
  const broadcastRemovals = options.broadcastRemovals !== false;

  channel.addEventListener("message", (event) => {
    const message = normalizeMessage(event.data);

    if (message === undefined || message.senderId === senderId) {
      return;
    }

    if (message.type === "success") {
      if (!canShareQueryData || !queryIncluded(message.queryKey, options)) {
        return;
      }

      applyRemoteSuccess(client, originalSetQueryData, message);
      resolveSuccessWaiters(waiters, message);
      return;
    }

    if (!canSyncQueryMessages || !queryIncluded(message.queryKey, options)) {
      return;
    }

    if (message.type === "invalidate") {
      originalInvalidateQueries({ queryKey: message.queryKey });
      return;
    }

    originalRemoveQueries({ queryKey: message.queryKey });
  });

  const wrappedFetchQuery = (async <TData>(
    fetchOptions: FetchQueryOptions<TData>,
  ): Promise<TData> => {
    if (!queryIncluded(fetchOptions.queryKey, options)) {
      return originalFetchQuery(fetchOptions);
    }

    if (singleFlight) {
      return fetchQueryWithSingleFlight({
        client,
        fetchOptions,
        originalFetchQuery,
        options,
        postSuccess,
        waiters,
      });
    }

    const data = await originalFetchQuery(fetchOptions);
    if (broadcastQueryData) {
      postSuccess(fetchOptions.queryKey, data);
    }
    return data;
  }) as QueryClient["fetchQuery"];

  const wrappedSetQueryData = (<TData>(queryKey: QueryKey, data: TData): void => {
    originalSetQueryData(queryKey, data);
    if (broadcastQueryData && queryIncluded(queryKey, options)) {
      postSuccess(queryKey, data);
    }
  }) as QueryClient["setQueryData"];

  const wrappedInvalidateQueries = ((invalidateOptions: InvalidateQueriesOptions = {}): void => {
    originalInvalidateQueries(invalidateOptions);

    if (!broadcastInvalidations || !canSyncQueryMessages) {
      return;
    }

    if (invalidateOptions.queryKey === undefined || !queryIncluded(invalidateOptions.queryKey, options)) {
      return;
    }

    postMessage({
      queryKey: invalidateOptions.queryKey,
      senderId,
      type: "invalidate",
      version: 1,
    });
  }) as QueryClient["invalidateQueries"];

  const wrappedRemoveQueries = ((removeOptions: InvalidateQueriesOptions = {}): void => {
    originalRemoveQueries(removeOptions);

    if (!broadcastRemovals || !canSyncQueryMessages) {
      return;
    }

    if (removeOptions.queryKey === undefined || !queryIncluded(removeOptions.queryKey, options)) {
      return;
    }

    postMessage({
      queryKey: removeOptions.queryKey,
      senderId,
      type: "remove",
      version: 1,
    });
  }) as QueryClient["removeQueries"];

  client.fetchQuery = wrappedFetchQuery;
  client.setQueryData = wrappedSetQueryData;
  client.invalidateQueries = wrappedInvalidateQueries;
  client.removeQueries = wrappedRemoveQueries;

  return () => {
    rejectSuccessWaiters(waiters, new Error("Cross-tab query sync disposed."));
    channel.close();

    if (client.fetchQuery === wrappedFetchQuery) {
      client.fetchQuery = originalFetchQuery;
    }
    if (client.setQueryData === wrappedSetQueryData) {
      client.setQueryData = originalSetQueryData;
    }
    if (client.invalidateQueries === wrappedInvalidateQueries) {
      client.invalidateQueries = originalInvalidateQueries;
    }
    if (client.removeQueries === wrappedRemoveQueries) {
      client.removeQueries = originalRemoveQueries;
    }
  };

  function postSuccess(queryKey: QueryKey, data: unknown): void {
    const entry = client.getQueryEntry(queryKey);
    postMessage({
      data,
      queryHash: hashQueryKey(queryKey),
      queryKey,
      senderId,
      type: "success",
      updatedAt: entry?.updatedAt ?? Date.now(),
      version: 1,
    });
  }

  function postMessage(message: QuerySyncMessage): void {
    try {
      channel.postMessage(message);
    } catch {
      // Ignore non-cloneable data or closed channels; the local query operation already succeeded.
    }
  }
}

async function fetchQueryWithSingleFlight<TData>(input: {
  client: QueryClient;
  fetchOptions: FetchQueryOptions<TData>;
  originalFetchQuery: QueryClient["fetchQuery"];
  options: CrossTabQuerySyncOptions;
  postSuccess(queryKey: QueryKey, data: unknown): void;
  waiters: Map<string, Set<SuccessWaiter>>;
}): Promise<TData> {
  const queryHash = hashQueryKey(input.fetchOptions.queryKey);
  const localSingleFlightKey = `${input.options.channel}:${queryHash}`;
  const current = localSingleFlights.get(localSingleFlightKey) as Promise<TData> | undefined;

  if (current !== undefined) {
    const data = await current;
    input.client.setQueryData(input.fetchOptions.queryKey, data);
    return data;
  }

  const next = fetchQueryWithCrossTabLeader(input, queryHash);
  localSingleFlights.set(localSingleFlightKey, next);

  try {
    return await next;
  } finally {
    if (localSingleFlights.get(localSingleFlightKey) === next) {
      localSingleFlights.delete(localSingleFlightKey);
    }
  }
}

async function fetchQueryWithCrossTabLeader<TData>(
  input: {
    client: QueryClient;
    fetchOptions: FetchQueryOptions<TData>;
    originalFetchQuery: QueryClient["fetchQuery"];
    options: CrossTabQuerySyncOptions;
    postSuccess(queryKey: QueryKey, data: unknown): void;
    waiters: Map<string, Set<SuccessWaiter>>;
  },
  queryHash: string,
): Promise<TData> {
  const lockManager = webLocks();
  if (lockManager === undefined) {
    const data = await input.originalFetchQuery(input.fetchOptions);
    input.postSuccess(input.fetchOptions.queryKey, data);
    return data as TData;
  }

  const lockName = `mreact-query:fetch:${queryHash}`;
  const handoffWaiter = createSuccessWaiter(
    input.waiters,
    queryHash,
    input.options.singleFlightHandoffTimeoutMs ?? defaultSingleFlightHandoffTimeoutMs,
  );

  const leaderResult = await lockManager.request(
    lockName,
    { ifAvailable: true },
    async (lock) => {
      if (lock === null) {
        return { leader: false as const };
      }

      const data = await input.originalFetchQuery(input.fetchOptions);
      input.postSuccess(input.fetchOptions.queryKey, data);
      return { data, leader: true as const };
    },
  );

  if (leaderResult.leader) {
    handoffWaiter.cancel();
    return leaderResult.data as TData;
  }

  const handoff = await handoffWaiter.promise;

  if (handoff !== undefined) {
    return handoff.data as TData;
  }

  return lockManager.request(lockName, async () => {
    const existing = input.client.getQueryEntry<TData>(input.fetchOptions.queryKey);
    if (entryIsUsable(existing, input.fetchOptions.staleTime)) {
      return existing.data as TData;
    }

    const data = await input.originalFetchQuery(input.fetchOptions);
    input.postSuccess(input.fetchOptions.queryKey, data);
    return data as TData;
  });
}

function applyRemoteSuccess(
  client: QueryClient,
  setQueryData: QueryClient["setQueryData"],
  message: Extract<QuerySyncMessage, { type: "success" }>,
): void {
  const existing = client.getQueryEntry(message.queryKey);
  if (existing !== undefined && existing.updatedAt > message.updatedAt) {
    return;
  }

  const hydratableClient = client as QueryClient & Partial<HydratableQueryClient>;
  if (hydratableClient[hydrateQueryDataSymbol] !== undefined) {
    hydratableClient[hydrateQueryDataSymbol](message.queryKey, message.data, {
      updatedAt: message.updatedAt,
    });
    return;
  }

  setQueryData(message.queryKey, message.data);
}

function createSuccessWaiter(
  waiters: Map<string, Set<SuccessWaiter>>,
  queryHash: string,
  timeoutMs: number,
): PendingSuccessWaiter {
  let settled = false;
  let timeout: ReturnType<typeof setTimeout>;
  let waiter: SuccessWaiter;
  const promise = new Promise<Extract<QuerySyncMessage, { type: "success" }> | undefined>(
    (resolve, reject) => {
      waiter = {
        reject,
        resolve: (message) => {
          settled = true;
          clearTimeout(timeout);
          removeSuccessWaiter(waiters, queryHash, waiter);
          resolve(message);
        },
      };
      timeout = setTimeout(() => {
        settled = true;
        removeSuccessWaiter(waiters, queryHash, waiter);
        resolve(undefined);
      }, Math.max(0, timeoutMs));

      const current = waiters.get(queryHash) ?? new Set<SuccessWaiter>();
      current.add(waiter);
      waiters.set(queryHash, current);
    },
  );

  return {
    cancel() {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      removeSuccessWaiter(waiters, queryHash, waiter);
    },
    promise,
  };
}

function resolveSuccessWaiters(
  waiters: Map<string, Set<SuccessWaiter>>,
  message: Extract<QuerySyncMessage, { type: "success" }>,
): void {
  const current = waiters.get(message.queryHash);
  if (current === undefined) {
    return;
  }

  for (const waiter of Array.from(current)) {
    waiter.resolve(message);
  }
}

function rejectSuccessWaiters(waiters: Map<string, Set<SuccessWaiter>>, error: Error): void {
  for (const current of waiters.values()) {
    for (const waiter of current) {
      waiter.reject(error);
    }
  }
  waiters.clear();
}

function removeSuccessWaiter(
  waiters: Map<string, Set<SuccessWaiter>>,
  queryHash: string,
  waiter: SuccessWaiter,
): void {
  const current = waiters.get(queryHash);
  current?.delete(waiter);

  if (current?.size === 0) {
    waiters.delete(queryHash);
  }
}

function entryIsUsable<TData>(
  entry: QueryEntry<TData> | undefined,
  staleTime: number | undefined,
): entry is QueryEntry<TData> {
  return entry !== undefined &&
    entry.status === "success" &&
    !entry.stale &&
    Date.now() - entry.updatedAt < (staleTime ?? 0);
}

function queryIncluded(queryKey: QueryKey, options: CrossTabQuerySyncOptions): boolean {
  return options.includeQuery?.(queryKey) !== false;
}

function normalizeMessage(value: unknown): QuerySyncMessage | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  const message = value as Partial<QuerySyncMessage>;
  if (message.version !== 1 || typeof message.senderId !== "string") {
    return undefined;
  }

  if (
    message.type === "success" &&
    Array.isArray(message.queryKey) &&
    typeof message.queryHash === "string" &&
    typeof message.updatedAt === "number"
  ) {
    return message as Extract<QuerySyncMessage, { type: "success" }>;
  }

  if (
    (message.type === "invalidate" || message.type === "remove") &&
    Array.isArray(message.queryKey)
  ) {
    return message as Extract<QuerySyncMessage, { type: "invalidate" | "remove" }>;
  }

  return undefined;
}

function scopedQuerySyncAllowed(options: CrossTabQuerySyncOptions): boolean {
  return options.channel !== undefined &&
    options.channel.length > 0 &&
    options.channel !== defaultChannelName &&
    typeof options.includeQuery === "function";
}

function isBrowserWithBroadcastChannel(): boolean {
  return typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined";
}

function webLocks(): BrowserLockManager | undefined {
  const locks = (globalThis.navigator as { locks?: BrowserLockManager } | undefined)?.locks;
  return typeof locks?.request === "function" ? locks : undefined;
}

function createClientId(): string {
  if (typeof crypto === "object" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}
