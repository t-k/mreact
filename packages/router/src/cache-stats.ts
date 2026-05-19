export interface RouterRuntimeCacheStat {
  evictions: number;
  hits: number;
  maxEntries: number;
  misses: number;
  name: string;
  size: number;
}

export interface RouterRuntimeCacheCounters {
  evictions: number;
  hits: number;
  misses: number;
}

export function createRouterRuntimeCacheCounters(): RouterRuntimeCacheCounters {
  return {
    evictions: 0,
    hits: 0,
    misses: 0,
  };
}

export function readRouterRuntimeCacheEntry<K, V>(
  cache: ReadonlyMap<K, V>,
  key: K,
  counters: RouterRuntimeCacheCounters,
): V | undefined {
  const cached = cache.get(key);

  if (cached === undefined) {
    counters.misses += 1;
  } else {
    counters.hits += 1;
  }

  return cached;
}

export function routerRuntimeCacheStat(
  name: string,
  cache: ReadonlyMap<unknown, unknown>,
  maxEntries: number,
  counters: RouterRuntimeCacheCounters,
): RouterRuntimeCacheStat {
  return {
    evictions: counters.evictions,
    hits: counters.hits,
    maxEntries,
    misses: counters.misses,
    name,
    size: cache.size,
  };
}
