import type { PrimitiveAdapter, PrimitiveCaseDefinition } from "./types.js";

export function filterPrimitiveAdapters(
  adapters: readonly PrimitiveAdapter[],
  filter: string | undefined,
): PrimitiveAdapter[] {
  const names = parseFilterList(filter);

  if (names.length === 0) {
    return [...adapters];
  }

  return adapters.filter((adapter) => names.includes(adapter.name));
}

export function filterPrimitiveCases(
  cases: readonly PrimitiveCaseDefinition[],
  filter: string | undefined,
): PrimitiveCaseDefinition[] {
  const names = parseFilterList(filter);

  if (names.length === 0) {
    return [...cases];
  }

  return cases.filter((benchmarkCase) => names.includes(benchmarkCase.name));
}

function parseFilterList(filter: string | undefined): string[] {
  return filter === undefined
    ? []
    : filter
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
