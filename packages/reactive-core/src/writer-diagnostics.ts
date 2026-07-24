import type { Source } from "./state.js";

const writtenSources = new Set<Source>();

export function recordCellWriter(source: Source, computationId: number, label: string): void {
  const writers = (source.debugWriters ??= new Map());
  writers.set(computationId, label);
  writtenSources.add(source);
}

export function describeCompetingCellWriters(): string | undefined {
  for (const source of writtenSources) {
    const labels = Array.from(new Set(source.debugWriters?.values() ?? []));

    if (labels.length > 1) {
      return `Reactive flush detected competing computations writing the same cell: ${labels.join(" and ")}.`;
    }
  }

  return undefined;
}

export function clearCellWriterDiagnostics(): void {
  for (const source of writtenSources) {
    source.debugWriters = undefined;
  }
  writtenSources.clear();
}

