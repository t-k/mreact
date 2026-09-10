import { expect, test } from "vitest";
import { rememberNavigationHistorySnapshot } from "../src/navigation-history-cache.js";

test("retains independent snapshots for distinct entries at the same URL", () => {
  const snapshots = new Map<string, { url: string; scrollY: number }>();
  rememberNavigationHistorySnapshot(snapshots, "first", { url: "/", scrollY: 200 });
  rememberNavigationHistorySnapshot(snapshots, "second", { url: "/", scrollY: 700 });
  expect([...snapshots.values()].map((value) => value.scrollY)).toEqual([200, 700]);
});

test("retains 32 snapshots and evicts the oldest when the bound is exceeded", () => {
  const snapshots = new Map<string, number>();
  for (let i = 0; i < 32; i++) rememberNavigationHistorySnapshot(snapshots, String(i), i);
  expect(snapshots.size).toBe(32);
  expect(snapshots.get("0")).toBe(0);
  rememberNavigationHistorySnapshot(snapshots, "32", 32);
  expect(snapshots.size).toBe(32);
  expect(snapshots.has("0")).toBe(false);
  expect(snapshots.get("32")).toBe(32);
});

test("refreshes an existing entry without evicting it on the next insertion", () => {
  const snapshots = new Map<string, number>();
  for (let i = 0; i < 32; i++) rememberNavigationHistorySnapshot(snapshots, String(i), i);
  rememberNavigationHistorySnapshot(snapshots, "0", 99);
  rememberNavigationHistorySnapshot(snapshots, "32", 32);
  expect(snapshots.size).toBe(32);
  expect(snapshots.get("0")).toBe(99);
  expect(snapshots.has("1")).toBe(false);
});

test("reduces an oversized cache to the same bound", () => {
  const snapshots = new Map(Array.from({ length: 40 }, (_, i) => [String(i), i] as const));
  rememberNavigationHistorySnapshot(snapshots, "new", 41);
  expect([...snapshots.keys()]).toEqual([
    ...Array.from({ length: 31 }, (_, i) => String(i + 9)),
    "new",
  ]);
});
