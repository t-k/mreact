import type { QueryClient } from "@reckona/mreact-query";
import type { RouteParams } from "./types.js";

export interface RouteDataContext {
  env?: unknown;
  params: RouteParams;
  queryClient: QueryClient;
  request: Request;
}

export interface RouteLoaderModule {
  loader?: (context: RouteDataContext) => unknown;
}

export interface RouteLoaderRuntimeTiming {
  finish(startedAt: number | undefined, phase: "loaderExecutionMs" | "loaderModuleLoadMs"): void;
  start(): number | undefined;
}

export async function loadRouteDataFromModule(options: {
  context: RouteDataContext;
  hasLoader: boolean;
  loadModule(): Promise<RouteLoaderModule>;
  onLoaderReady?: (() => void) | undefined;
  timing?: RouteLoaderRuntimeTiming | undefined;
}): Promise<unknown> {
  if (!options.hasLoader) {
    return undefined;
  }

  let module: RouteLoaderModule;
  const moduleLoadStartedAt = options.timing?.start();
  try {
    module = await options.loadModule();
  } finally {
    options.timing?.finish(moduleLoadStartedAt, "loaderModuleLoadMs");
  }

  if (module.loader === undefined) {
    options.onLoaderReady?.();
    return undefined;
  }

  const executionStartedAt = options.timing?.start();
  options.onLoaderReady?.();
  try {
    return await module.loader(options.context);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  } finally {
    options.timing?.finish(executionStartedAt, "loaderExecutionMs");
  }
}
