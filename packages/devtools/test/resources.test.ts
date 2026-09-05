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
    expect(inspector.census()).toMatchObject({ live: 1, missingMetadata: 0, retainedMetadata: 0 });
    second.dispose();
    inspector.dispose();
    expect(inspector.census()).toEqual({
      byKind: {},
      live: 0,
      missingMetadata: 0,
      retainedMetadata: 0,
    });
  });
});
