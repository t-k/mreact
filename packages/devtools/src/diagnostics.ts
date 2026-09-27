import type { Devtools } from "./index.js";

/** A safely exportable event with all application values omitted. */
export interface DevtoolsDiagnosticEvent {
  package: string;
  type: string;
  timestamp: number | null;
}

/** Aggregate resource counts for a built-in kind or the catch-all `other` kind. */
export interface DevtoolsDiagnosticKindCounts {
  kind: string;
  created: number;
  disposed: number;
  live: number;
}

/** The stable, value-free first version of a devtools diagnostic report. */
export interface DevtoolsDiagnosticsV1 {
  schemaVersion: 1;
  events: readonly DevtoolsDiagnosticEvent[];
  resources: {
    byKind: readonly DevtoolsDiagnosticKindCounts[];
    live: number;
    missingMetadata: number;
    retainedMetadata: number;
  };
}

/** Exports retained events and resource counts without reading event values or resource records. */
export function exportDevtoolsDiagnostics(devtools: Devtools): DevtoolsDiagnosticsV1 {
  const census = devtools.resources().census();
  const countsByKind = new Map<string, DevtoolsDiagnosticKindCounts>();

  for (const [rawKind, counts] of Object.entries(census.byKind)) {
    const kind = diagnosticResourceKind(rawKind);
    const aggregate = countsByKind.get(kind) ?? { kind, created: 0, disposed: 0, live: 0 };
    aggregate.created += counts.created;
    aggregate.disposed += counts.disposed;
    aggregate.live += counts.live;
    countsByKind.set(kind, aggregate);
  }

  return {
    schemaVersion: 1,
    events: devtools
      .events()
      .filter((event) => typeof event?.package === "string" && typeof event.type === "string")
      .map((event) => ({
        package: event.package,
        type: event.type,
        timestamp: Number.isFinite(event.timestamp) ? event.timestamp! : null,
      })),
    resources: {
      byKind: [...countsByKind.values()].sort((left, right) => left.kind.localeCompare(right.kind)),
      live: census.live,
      missingMetadata: census.missingMetadata,
      retainedMetadata: census.retainedMetadata,
    },
  };
}

function diagnosticResourceKind(kind: string): string {
  switch (kind) {
    case "computed":
    case "effect":
    case "inactive-query":
    case "pending-task":
    case "scope":
    case "subscription":
      return kind;
    default:
      return "other";
  }
}
