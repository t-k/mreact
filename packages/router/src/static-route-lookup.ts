export interface StaticRouteLookupSegment {
  kind: string;
  value?: string | undefined;
}

export interface StaticRoutePartition<T> {
  exact: ReadonlyMap<string, T>;
  other: readonly T[];
}

export interface LeadingStaticRouteLookup<T> {
  candidates(pathname: string): readonly T[];
}

interface IndexedRoute<T> {
  entry: T;
  index: number;
}

export function createLeadingStaticRouteLookup<T>(
  entries: readonly T[],
  segmentsOf: (entry: T) => readonly StaticRouteLookupSegment[],
): LeadingStaticRouteLookup<T> {
  if (entries.length < 64) {
    return { candidates: () => entries };
  }

  const groups = new Map<string, IndexedRoute<T>[]>();
  const generic: IndexedRoute<T>[] = [];

  for (const [index, entry] of entries.entries()) {
    const segments = segmentsOf(entry);
    const first = segments[0];
    const second = segments[1];

    if (
      first?.kind !== "static" ||
      first.value === undefined ||
      second?.kind !== "static" ||
      second.value === undefined
    ) {
      generic.push({ entry, index });
      continue;
    }

    const key = `/${first.value}/${second.value}`;
    const group = groups.get(key) ?? [];
    group.push({ entry, index });
    groups.set(key, group);
  }

  if (groups.size < 2 || generic.length > 32 || groups.size * generic.length > 100_000) {
    return { candidates: () => entries };
  }

  const genericEntries = generic.map(({ entry }) => entry);
  const candidatesByPrefix = new Map<string, readonly T[]>();

  for (const [key, group] of groups) {
    const candidates: T[] = [];
    let groupIndex = 0;
    let genericIndex = 0;

    while (groupIndex < group.length || genericIndex < generic.length) {
      const grouped = group[groupIndex];
      const fallback = generic[genericIndex];

      if (fallback === undefined || (grouped !== undefined && grouped.index < fallback.index)) {
        candidates.push(grouped!.entry);
        groupIndex += 1;
      } else {
        candidates.push(fallback.entry);
        genericIndex += 1;
      }
    }

    candidatesByPrefix.set(key, candidates);
  }

  return {
    candidates(pathname) {
      const firstSlash = pathname.indexOf("/", 1);
      const secondSlash = firstSlash < 0 ? -1 : pathname.indexOf("/", firstSlash + 1);
      const key = secondSlash < 0 ? pathname : pathname.slice(0, secondSlash);
      return candidatesByPrefix.get(key) ?? genericEntries;
    },
  };
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
