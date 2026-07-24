import type { Source } from "./state.js";

const writtenSources = new Set<Source>();

export function recordCellWriter(source: Source, computationId: number, label: string): void {
  const writers = (source.debugWriters ??= new Map());
  writers.set(computationId, label);
  writtenSources.add(source);
}

export function describeCompetingCellWriters(): string | undefined {
  for (const source of writtenSources) {
    const writers = source.debugWriters;

    if (writers !== undefined && writers.size > 1) {
      const descriptions = Array.from(writers, ([computationId, label]) =>
        `${label} (computation ${computationId})`,
      );

      return `Reactive flush detected competing computations writing the same cell: ${descriptions.join(" and ")}.`;
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
