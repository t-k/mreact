import { describe, expect, test } from "vitest";
import {
  compareDevtoolsResourceSnapshots,
  createDevtoolsResourceInspector,
} from "../src/resources.js";

describe("devtools resource inspector", () => {
  test("tracks bounded live metadata, owners, and before/after disposal", () => {
    const inspector = createDevtoolsResourceInspector(3);
    const scope = inspector.register({
      kind: "scope",
      location: "src/screen.ts:10",
      ownerId: "screen",
      ownership: "owned",
    });
    const shared = inspector.register({ kind: "computed", ownership: "shared" });
    const before = inspector.snapshot();

    scope.dispose();
    shared.update({ ownerId: "screen" });
    const after = inspector.snapshot({ includeDisposed: true });

    expect(before).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "computed", status: "live" }),
        expect.objectContaining({ kind: "scope", status: "live" }),
      ]),
    );
    expect(inspector.snapshot({ ownerId: "screen" })).toEqual([
      expect.objectContaining({ kind: "computed", ownerId: "screen" }),
    ]);
    expect(compareDevtoolsResourceSnapshots(before, after)).toMatchObject({
      disposedIds: [scope.id],
    });
    expect(inspector.census().live).toBe(1);
  });

  test("caps retained metadata and clears disposed records without losing live counts", () => {
    const inspector = createDevtoolsResourceInspector(1);
    const first = inspector.register({ kind: "effect" });
    const second = inspector.register({ kind: "effect" });

    expect(inspector.census()).toMatchObject({ live: 2, missingMetadata: 1, retainedMetadata: 1 });
    first.dispose();
    inspector.clearSnapshots();

    expect(inspector.snapshot({ includeDisposed: true })).toEqual([]);
    expect(inspector.census()).toMatchObject({ live: 1, missingMetadata: 1, retainedMetadata: 0 });
    second.dispose();
    inspector.dispose();
    expect(inspector.census()).toEqual({
      byKind: {},
      live: 0,
      missingMetadata: 0,
      retainedMetadata: 0,
    });
  });

  test("does not retain unbounded identifiers for omitted live metadata", () => {
    const inspector = createDevtoolsResourceInspector(1);
    const retained = inspector.register({ kind: "scope" });
    const omitted = Array.from({ length: 10_000 }, () => inspector.register({ kind: "scope" }));

    expect(inspector.census()).toMatchObject({
      live: 10_001,
      missingMetadata: 10_000,
      retainedMetadata: 1,
    });

    for (const resource of omitted) {
      resource.dispose();
    }
    retained.dispose();

    expect(inspector.census()).toMatchObject({
      live: 0,
      missingMetadata: 0,
      retainedMetadata: 1,
    });
    inspector.clearSnapshots();
    expect(inspector.census().retainedMetadata).toBe(0);
  });

  test("keeps omitted live counts across snapshot cleanup", () => {
    const inspector = createDevtoolsResourceInspector(1);
    const retained = inspector.register({ kind: "scope" });
    const omitted = inspector.register({ kind: "scope" });

    inspector.clearSnapshots();

    expect(inspector.census()).toMatchObject({ missingMetadata: 1, retainedMetadata: 1 });
    omitted.dispose();
    retained.dispose();
    expect(inspector.census()).toMatchObject({ missingMetadata: 0, live: 0 });
  });
});
