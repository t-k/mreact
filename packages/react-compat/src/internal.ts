/** Internal cache-scope and event-priority helpers used by compat integrations. */
export {
  createCacheScope,
  refreshCacheScope,
  runWithEventPriority,
  runWithCacheScope,
  type CacheScope,
} from "./hooks.js";
