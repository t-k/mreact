export type DevtoolsResourceKind =
  | "computed"
  | "effect"
  | "inactive-query"
  | "other"
  | "pending-task"
  | "scope"
  | "subscription"
  | (string & {});

export type DevtoolsResourceOwnership = "owned" | "shared" | "unknown";

export interface DevtoolsResourceRegistration {
  kind: DevtoolsResourceKind;
  label?: string | undefined;
  location?: string | undefined;
  ownerId?: string | undefined;
  ownership?: DevtoolsResourceOwnership | undefined;
}

export interface DevtoolsResourceRecord extends DevtoolsResourceRegistration {
  id: string;
  status: "disposed" | "live";
}

export interface DevtoolsResourceHandle {
  dispose(): void;
  readonly id: string;
  update(patch: Partial<DevtoolsResourceRegistration>): void;
}

export interface DevtoolsResourceSnapshotOptions {
  includeDisposed?: boolean | undefined;
  ownerId?: string | undefined;
}

export interface DevtoolsResourceCensus {
  byKind: Readonly<Record<string, { created: number; disposed: number; live: number }>>;
  live: number;
  missingMetadata: number;
  retainedMetadata: number;
}

export interface DevtoolsResourceSnapshotDiff {
  addedIds: readonly string[];
  byKind: Readonly<Record<string, { added: number; disposed: number; live: number }>>;
  disposedIds: readonly string[];
}

export interface DevtoolsResourceInspector {
  census(options?: Pick<DevtoolsResourceSnapshotOptions, "ownerId">): DevtoolsResourceCensus;
  clearSnapshots(): void;
  dispose(): void;
  register(input: DevtoolsResourceRegistration): DevtoolsResourceHandle;
  snapshot(options?: DevtoolsResourceSnapshotOptions): readonly DevtoolsResourceRecord[];
}

export const defaultDevtoolsMaxResources = 1_000;

/** Creates a bounded metadata registry for live resource inspection. */
export function createDevtoolsResourceInspector(
  maxResources = defaultDevtoolsMaxResources,
): DevtoolsResourceInspector {
  const records = new Map<string, DevtoolsResourceRecord>();
  const counters = new Map<string, { created: number; disposed: number; live: number }>();
  const omittedIds = new Set<string>();
  const limit = Math.max(0, Math.floor(maxResources));
  let nextId = 0;
  let disposed = false;

  const register = (input: DevtoolsResourceRegistration): DevtoolsResourceHandle => {
    const id = `resource:${nextId++}`;
    const counter = counters.get(input.kind) ?? { created: 0, disposed: 0, live: 0 };
    counter.created += 1;
    counter.live += 1;
    counters.set(input.kind, counter);

    if (!disposed && limit > 0) {
      evictDisposedRecords();
      if (records.size < limit) {
        records.set(id, {
          ...input,
          id,
          ownership: input.ownership ?? "unknown",
          status: "live",
        });
      } else {
        omittedIds.add(id);
      }
    } else {
      omittedIds.add(id);
    }

    let active = true;
    return {
      get id() {
        return id;
      },
      dispose() {
        if (!active) {
          return;
        }
        active = false;
        counter.disposed += 1;
        counter.live = Math.max(0, counter.live - 1);
        const record = records.get(id);
        if (record !== undefined) {
          records.set(id, { ...record, status: "disposed" });
        }
      },
      update(patch) {
        if (!active) {
          return;
        }
        const record = records.get(id);
        if (record !== undefined) {
          records.set(id, { ...record, ...patch });
        }
      },
    };
  };

  return {
    census(options = {}) {
      const byKind: Record<string, { created: number; disposed: number; live: number }> = {};
      for (const [kind, counter] of counters) {
        if (options.ownerId !== undefined) {
          const ownedRecords = [...records.values()].filter(
            (record) => record.ownerId === options.ownerId && record.kind === kind,
          );
          byKind[kind] = {
            created: ownedRecords.length,
            disposed: ownedRecords.filter((record) => record.status === "disposed").length,
            live: ownedRecords.filter((record) => record.status === "live").length,
          };
        } else {
          byKind[kind] = { ...counter };
        }
      }

      return {
        byKind,
        live: Object.values(byKind).reduce((total, item) => total + item.live, 0),
        missingMetadata: omittedIds.size,
        retainedMetadata: records.size,
      };
    },
    clearSnapshots() {
      for (const [id, record] of records) {
        if (record.status === "disposed") {
          records.delete(id);
        }
      }
      omittedIds.clear();
    },
    dispose() {
      disposed = true;
      records.clear();
      omittedIds.clear();
      counters.clear();
    },
    register,
    snapshot(options = {}) {
      return [...records.values()]
        .filter(
          (record) =>
            (options.includeDisposed === true || record.status === "live") &&
            (options.ownerId === undefined || record.ownerId === options.ownerId),
        )
        .map((record) => ({ ...record }))
        .sort((left, right) => left.id.localeCompare(right.id));
    },
  };

  function evictDisposedRecords(): void {
    for (const [id, record] of records) {
      if (record.status === "disposed") {
        records.delete(id);
        if (records.size < limit) {
          return;
        }
      }
    }
  }
}

/** Compares two live-or-disposed snapshots without relying on finalizer timing. */
export function compareDevtoolsResourceSnapshots(
  before: readonly DevtoolsResourceRecord[],
  after: readonly DevtoolsResourceRecord[],
): DevtoolsResourceSnapshotDiff {
  const beforeById = new Map(before.map((record) => [record.id, record]));
  const afterById = new Map(after.map((record) => [record.id, record]));
  const addedIds = [...afterById.keys()].filter((id) => !beforeById.has(id)).sort();
  const disposedIds = [...afterById.values()]
    .filter(
      (record) => record.status === "disposed" && beforeById.get(record.id)?.status !== "disposed",
    )
    .map((record) => record.id)
    .sort();
  const byKind: Record<string, { added: number; disposed: number; live: number }> = {};

  for (const record of afterById.values()) {
    const item = byKind[record.kind] ?? { added: 0, disposed: 0, live: 0 };
    if (!beforeById.has(record.id)) item.added += 1;
    if (record.status === "disposed") item.disposed += 1;
    if (record.status === "live") item.live += 1;
    byKind[record.kind] = item;
  }

  return { addedIds, byKind, disposedIds };
}
