// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNavigationSnapshotStore } from "../src/navigation-snapshots.js";

beforeEach(() => {
  history.replaceState(null, "", "/projects");
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("navigation snapshots", () => {
  it("restores a cloned snapshot for the original history entry", () => {
    const store = createNavigationSnapshotStore();
    const draft = { selected: "p3", edit: { name: "Draft" } };
    expect(store.save("projects", draft)).toBe(true);
    const listEntry = history.state;
    draft.edit.name = "Changed";

    history.pushState({ __mreactEntryId: "detail" }, "", "/projects/p3");
    expect(store.load("projects")).toBeUndefined();
    history.replaceState(listEntry, "", "/projects");
    expect(store.load<typeof draft>("projects")).toEqual({ selected: "p3", edit: { name: "Draft" } });
    const loaded = store.load<typeof draft>("projects")!;
    loaded.edit.name = "Other";
    expect(store.load<typeof draft>("projects")?.edit.name).toBe("Draft");
  });

  it("keeps only a bounded number of entries and expires old values", () => {
    vi.useFakeTimers();
    const store = createNavigationSnapshotStore({ maxEntries: 2, ttlMs: 1000 });
    for (const [id, path] of [["a", "/a"], ["b", "/b"], ["c", "/c"]] as const) {
      history.replaceState({ __mreactEntryId: id }, "", path);
      expect(store.save("selection", id)).toBe(true);
    }
    history.replaceState({ __mreactEntryId: "a" }, "", "/a");
    expect(store.load("selection")).toBeUndefined();
    history.replaceState({ __mreactEntryId: "b" }, "", "/b");
    expect(store.load("selection")).toBe("b");
    vi.advanceTimersByTime(1000);
    expect(store.load("selection")).toBeUndefined();
  });

  it("refreshes TTL on save and evicts the least recently used history entry", () => {
    vi.useFakeTimers();
    const store = createNavigationSnapshotStore({ maxEntries: 2, ttlMs: 1000 });
    history.replaceState({ __mreactEntryId: "a" }, "", "/a");
    store.save("value", "a");
    vi.advanceTimersByTime(600);
    store.save("value", "a2");
    history.replaceState({ __mreactEntryId: "b" }, "", "/b");
    store.save("value", "b");
    history.replaceState({ __mreactEntryId: "a" }, "", "/a");
    expect(store.load("value")).toBe("a2");
    history.replaceState({ __mreactEntryId: "c" }, "", "/c");
    store.save("value", "c");
    history.replaceState({ __mreactEntryId: "b" }, "", "/b");
    expect(store.load("value")).toBeUndefined();
    history.replaceState({ __mreactEntryId: "a" }, "", "/a");
    vi.advanceTimersByTime(400);
    expect(store.load("value")).toBe("a2");
    vi.advanceTimersByTime(600);
    expect(store.load("value")).toBeUndefined();
  });

  it("rejects large or non-JSON values and clears all entries explicitly", () => {
    const store = createNavigationSnapshotStore({ maxBytes: 16 });
    expect(store.save("draft", "a".repeat(100))).toBe(false);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(store.save("draft", cyclic)).toBe(false);
    expect(store.save("draft", undefined)).toBe(false);
    expect(store.save("", 1)).toBe(false);
    expect(store.save("draft", "🌏".repeat(4))).toBe(false);
    expect(store.save("draft", { name: "A" })).toBe(true);
    store.clear();
    expect(store.load("draft")).toBeUndefined();
  });

  it("preserves existing history state and validates store limits", () => {
    history.replaceState({ app: "keep" }, "", "/projects");
    const store = createNavigationSnapshotStore();
    expect(store.save("selected", 3)).toBe(true);
    expect(history.state).toMatchObject({ app: "keep", __mreactEntryId: expect.any(String) });
    expect(() => createNavigationSnapshotStore({ maxEntries: 0 })).toThrow();
    expect(() => createNavigationSnapshotStore({ ttlMs: -1 })).toThrow();
    expect(() => createNavigationSnapshotStore({ maxBytes: 0 })).toThrow();
    expect(() => createNavigationSnapshotStore({ maxEntries: 1.5 })).toThrow();
    expect(() => createNavigationSnapshotStore({ ttlMs: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("reuses an existing entry ID and refuses unaddressable browser history", () => {
    const store = createNavigationSnapshotStore();
    history.replaceState({ __mreactEntryId: "known" }, "", "/projects");
    const replace = vi.spyOn(history, "replaceState");
    expect(store.save("selection", "p1")).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(store.load("selection")).toBe("p1");
    replace.mockRestore();

    history.replaceState(42, "", "/projects");
    expect(store.save("selection", "p2")).toBe(false);
    history.replaceState([], "", "/projects");
    expect(store.save("selection", "p2")).toBe(false);
    history.replaceState(null, "", "/projects");
    vi.spyOn(history, "replaceState").mockImplementation(() => { throw new Error("denied"); });
    expect(store.save("selection", "p2")).toBe(false);
  });

  it("returns no data when browser history is unavailable", () => {
    const store = createNavigationSnapshotStore();
    vi.stubGlobal("history", undefined);
    expect(store.save("selection", "p1")).toBe(false);
    expect(store.load("selection")).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("accepts exact size limits, one-entry stores, and immediate expiry", () => {
    expect(() => createNavigationSnapshotStore({ maxEntries: 1, ttlMs: 0, maxBytes: 1 })).not.toThrow();
    const exact = createNavigationSnapshotStore({ maxBytes: 3 });
    expect(exact.save("text", "a")).toBe(true);
    expect(exact.save("text", "ab")).toBe(false);
    const expired = createNavigationSnapshotStore({ ttlMs: 0 });
    expect(expired.save("text", "a")).toBe(true);
    expect(expired.load("text")).toBeUndefined();
  });

  it("bounds key length, key count, and aggregate bytes within one entry", () => {
    const store = createNavigationSnapshotStore({
      maxBytes: 3,
      maxEntries: 1,
      maxKeysPerEntry: 2,
      maxKeyBytes: 2,
      maxEntryBytes: 8,
    });
    expect(store.save("aaa", 0)).toBe(false);
    expect(store.save("a", "x")).toBe(true);
    expect(store.save("b", "y")).toBe(true);
    expect(store.save("c", 0)).toBe(false);
    expect(store.save("a", "z")).toBe(true);
    expect(store.load("a")).toBe("z");
    expect(() => createNavigationSnapshotStore({ maxKeysPerEntry: 0 })).toThrow();
    expect(() => createNavigationSnapshotStore({ maxKeyBytes: 0 })).toThrow();
    expect(() => createNavigationSnapshotStore({ maxEntryBytes: 0 })).toThrow();
  });

  it("enforces key count and aggregate size independently", () => {
    const countLimited = createNavigationSnapshotStore({ maxKeysPerEntry: 2, maxEntryBytes: 100 });
    expect(countLimited.save("a", 0)).toBe(true);
    expect(countLimited.save("b", 0)).toBe(true);
    expect(countLimited.save("c", 0)).toBe(false);
    expect(countLimited.save("a", 1)).toBe(true);

    const bytesLimited = createNavigationSnapshotStore({
      maxBytes: 6,
      maxKeysPerEntry: 10,
      maxKeyBytes: 2,
      maxEntryBytes: 7,
    });
    expect(bytesLimited.save("é", "x")).toBe(true);
    expect(bytesLimited.save("b", "y")).toBe(false);
    expect(bytesLimited.save("é", "z")).toBe(true);
    expect(bytesLimited.save("é", "zzz")).toBe(true);
    expect(bytesLimited.save("é", "zzzz")).toBe(false);
    expect(bytesLimited.save("abc", 0)).toBe(false);
    expect(bytesLimited.load("é")).toBe("zzz");
    expect(() => createNavigationSnapshotStore({ maxKeysPerEntry: 1, maxKeyBytes: 1, maxEntryBytes: 1 })).not.toThrow();
  });

  it("uses the documented default TTL", () => {
    vi.useFakeTimers();
    const store = createNavigationSnapshotStore();
    expect(store.save("selection", "p1")).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(store.load("selection")).toBe("p1");
  });

  it("isolates a state object copied into a different URL", () => {
    const store = createNavigationSnapshotStore();
    expect(store.save("draft", "A")).toBe(true);
    const originalState = history.state;
    history.pushState(originalState, "", "/other");
    expect(store.load("draft")).toBeUndefined();
    expect(store.save("draft", "B")).toBe(true);
    expect(history.state.__mreactEntryId).not.toBe(originalState.__mreactEntryId);
    expect(store.load("draft")).toBe("B");
    history.replaceState(originalState, "", "/projects");
    expect(store.load("draft")).toBe("A");
  });
});
