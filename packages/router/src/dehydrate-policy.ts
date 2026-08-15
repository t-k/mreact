import type { DehydrateOptions } from "@reckona/mreact-query";

export function dehydrateOptionsFromModule(
  module: unknown,
  label: string,
): DehydrateOptions {
  if (module === null || typeof module !== "object" || !("dehydrateOptions" in module)) {
    throw new Error(`${label} must export a named dehydrateOptions object.`);
  }

  const dehydrateOptions = (module as { dehydrateOptions?: unknown }).dehydrateOptions;
  if (dehydrateOptions === null || typeof dehydrateOptions !== "object") {
    throw new Error(`${label} must export a named dehydrateOptions object.`);
  }

  const shouldDehydrateQuery = (dehydrateOptions as { shouldDehydrateQuery?: unknown })
    .shouldDehydrateQuery;
  if (shouldDehydrateQuery !== undefined && typeof shouldDehydrateQuery !== "function") {
    throw new Error(`${label} dehydrateOptions.shouldDehydrateQuery must be a function.`);
  }

  return dehydrateOptions as DehydrateOptions;
}
