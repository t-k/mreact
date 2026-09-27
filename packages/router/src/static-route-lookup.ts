export interface StaticRouteLookupSegment {
  kind: string;
  value?: string | undefined;
}

export interface StaticRoutePartition<T> {
  exact: ReadonlyMap<string, T>;
  other: readonly T[];
}

export function partitionStaticRoutes<T>(
  entries: readonly T[],
  segmentsOf: (entry: T) => readonly StaticRouteLookupSegment[],
): StaticRoutePartition<T> {
  const exact = new Map<string, T>();
  const other: T[] = [];

  for (const entry of entries) {
    let path = "";
    let isStatic = true;

    for (const segment of segmentsOf(entry)) {
      if (segment.kind !== "static" || segment.value === undefined) {
        isStatic = false;
        break;
      }
      path += `/${segment.value}`;
    }

    if (!isStatic) {
      other.push(entry);
      continue;
    }

    const key = path || "/";
    if (!exact.has(key)) {
      exact.set(key, entry);
    }
  }

  return { exact, other };
}
