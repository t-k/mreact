/** Internal cache-scope and event-priority helpers used by compat integrations. */
export {
  createCacheScope,
  __setCacheScopeStorageForTesting,
  refreshCacheScope,
  runWithEventPriority,
  runWithCacheScope,
  type CacheScope,
} from "./hooks.js";
