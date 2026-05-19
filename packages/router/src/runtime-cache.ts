import { routerModuleRunnerRuntimeCacheStats } from "./module-runner.js";
import { routerRenderRuntimeCacheStats } from "./render.js";
import type { RouterRuntimeCacheStat } from "./cache-stats.js";
export type { RouterRuntimeCacheStat } from "./cache-stats.js";

export function getRouterRuntimeCacheStats(): RouterRuntimeCacheStat[] {
  return [...routerRenderRuntimeCacheStats(), ...routerModuleRunnerRuntimeCacheStats()];
}
