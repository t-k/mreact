/** Internal cache-scope and event-priority helpers used by compat integrations. */
export {
  createCacheScope,
  __setCacheScopeStorageForTesting,
  refreshCacheScope,
  runWithEventPriority,
  runWithCacheScope,
  type CacheScope,
} from "./hooks.js";
export { bindSelectedKeyedSingleNodeList } from "./bind-selected-keyed-single-node-list.js";
export type {
  BindSelectedKeyedSingleNodeListOptions,
  SelectedKeyedRowContext,
} from "./bind-selected-keyed-single-node-list.js";
