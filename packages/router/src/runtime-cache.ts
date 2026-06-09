import { routerModuleRunnerRuntimeCacheStats } from "./module-runner.js";
import { routerRenderRuntimeCacheStats } from "./render.js";
import type { RouterRuntimeCacheStat } from "./cache-stats.js";

/** Reports a named runtime cache and its current entry count. */
export type { RouterRuntimeCacheStat } from "./cache-stats.js";

/**
 * Reads app-router runtime cache sizes for diagnostics.
 */
export function getRouterRuntimeCacheStats(): RouterRuntimeCacheStat[] {
  return [...routerRenderRuntimeCacheStats(), ...routerModuleRunnerRuntimeCacheStats()];
}
