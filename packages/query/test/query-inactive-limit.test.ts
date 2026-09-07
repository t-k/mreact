import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../src/index.js";
import type { QueryClient } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

function cachedKeys(client: QueryClient): string[] {
  return client.entries().map((entry) => String(entry.queryKey[0]));
}

function seedInactiveEntries(client: QueryClient, keys: readonly string[]): void {
  for (const key of keys) {
    client.setQueryData([key], key);
  }
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveFn) => {
    resolve = resolveFn;
  });

  return { promise, resolve };
}

describe("inactive entry cap boundaries", () => {
  it("retains every inactive entry when no cap is configured", () => {
    const client = createQueryClient();

    seedInactiveEntries(client, ["a", "b", "c", "d", "e"]);

    expect(cachedKeys(client)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("retains every inactive entry when the cap is disabled with false", () => {
    const client = createQueryClient({ maxInactiveEntries: false });

    seedInactiveEntries(client, ["a", "b", "c", "d", "e"]);

    expect(cachedKeys(client)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("removes every inactive entry when the cap is zero", () => {
    const client = createQueryClient({ maxInactiveEntries: 0 });

    seedInactiveEntries(client, ["a", "b", "c"]);

    expect(client.entries()).toEqual([]);
  });

  it("treats a negative cap as zero", () => {
    const client = createQueryClient({ maxInactiveEntries: -5 });

    seedInactiveEntries(client, ["a", "b"]);

    expect(client.entries()).toEqual([]);
  });

  it("keeps the newest entries as the cache crosses below, at and above the cap", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 3 });

    client.setQueryData(["a"], "a");
    vi.advanceTimersByTime(1);
    client.setQueryData(["b"], "b");
    expect(cachedKeys(client)).toEqual(["a", "b"]);

    vi.advanceTimersByTime(1);
    client.setQueryData(["c"], "c");
    expect(cachedKeys(client)).toEqual(["a", "b", "c"]);

    vi.advanceTimersByTime(1);
    client.setQueryData(["d"], "d");
    expect(cachedKeys(client)).toEqual(["b", "c", "d"]);

    vi.advanceTimersByTime(1);
    client.setQueryData(["e"], "e");
    expect(cachedKeys(client)).toEqual(["c", "d", "e"]);
  });
});

describe("inactive entry cap eligibility", () => {
  it("never counts or evicts entries that still have subscribers", () => {
    const client = createQueryClient({ maxInactiveEntries: 0 });
    const releaseFirst = client.subscribe(["active-one"], () => {});
    const releaseSecond = client.subscribe(["active-two"], () => {});

    seedInactiveEntries(client, ["active-one", "active-two", "inactive"]);

    expect(cachedKeys(client)).toEqual(["active-one", "active-two"]);

    releaseFirst();
    expect(cachedKeys(client)).toEqual(["active-two"]);

    releaseSecond();
    expect(client.entries()).toEqual([]);
  });

  it("protects an in-flight fetch from the cap until it settles", async () => {
    const client = createQueryClient({ maxInactiveEntries: 0 });
    const deferred = createDeferred<string>();
    const pending = client.fetchQuery({
      queryKey: ["in-flight"],
      queryFn: () => deferred.promise,
    });

    client.setQueryData(["other"], "other");
    expect(cachedKeys(client)).toEqual(["in-flight"]);

    deferred.resolve("done");
    await pending;

    expect(client.entries()).toEqual([]);
  });

  it("protects an in-flight fetch that rejects until the rejection settles", async () => {
    const client = createQueryClient({ maxInactiveEntries: 0 });
    const deferred = createDeferred<string>();
    const pending = client.fetchQuery({
      queryKey: ["failing"],
      retry: 0,
      queryFn: () => deferred.promise,
    });
    const failure = new Error("boom");

    client.setQueryData(["other"], "other");
    expect(cachedKeys(client)).toEqual(["failing"]);

    (deferred as unknown as { resolve: (value: unknown) => void }).resolve(
      Promise.reject(failure),
    );
    await expect(pending).rejects.toThrow("boom");

    expect(client.entries()).toEqual([]);
  });

  it("re-protects an entry when a new subscriber arrives after it went inactive", () => {
    const client = createQueryClient({ maxInactiveEntries: 1 });

    client.setQueryData(["kept"], "kept");
    const release = client.subscribe(["kept"], () => {});
    client.setQueryData(["extra"], "extra");

    expect(cachedKeys(client)).toEqual(["kept", "extra"]);

    release();
    expect(cachedKeys(client)).toEqual(["extra"]);
  });

  it("keeps bookkeeping correct across repeated subscribe and release cycles", () => {
    const client = createQueryClient({ maxInactiveEntries: 2 });

    seedInactiveEntries(client, ["a", "b"]);
    for (let round = 0; round < 5; round += 1) {
      const release = client.subscribe(["a"], () => {});
      client.setQueryData(["a"], `a${round}`);
      release();
    }

    expect(cachedKeys(client).sort()).toEqual(["a", "b"]);
    expect(client.getQueryData(["a"])).toBe("a4");
  });
});

describe("inactive entry cap removal order", () => {
  it("evicts the oldest updatedAt first rather than the least recently read", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 3 });

    client.setQueryData(["oldest"], "oldest");
    vi.advanceTimersByTime(10);
    client.setQueryData(["middle"], "middle");
    vi.advanceTimersByTime(10);
    client.setQueryData(["newest"], "newest");

    // Reading the oldest entry must not rescue it: the policy is updatedAt, not recency.
    expect(client.getQueryData(["oldest"])).toBe("oldest");
    vi.advanceTimersByTime(10);
    client.setQueryData(["extra"], "extra");

    expect(cachedKeys(client)).toEqual(["middle", "newest", "extra"]);
  });

  it("evicts by updatedAt rather than by cache insertion order", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 2 });

    client.setQueryData(["first-inserted"], "first");
    vi.advanceTimersByTime(10);
    client.setQueryData(["second-inserted"], "second");
    vi.advanceTimersByTime(10);
    // Refreshing the earliest inserted entry makes it the newest by updatedAt.
    client.setQueryData(["first-inserted"], "refreshed");
    vi.advanceTimersByTime(10);
    client.setQueryData(["third-inserted"], "third");

    expect(cachedKeys(client)).toEqual(["first-inserted", "third-inserted"]);
  });

  it("evicts the earliest inserted entry when updatedAt values are equal", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 2 });

    client.setQueryData(["first"], "first");
    client.setQueryData(["second"], "second");
    client.setQueryData(["third"], "third");

    const entries = client.entries();
    expect(new Set(entries.map((entry) => entry.updatedAt)).size).toBe(1);
    expect(cachedKeys(client)).toEqual(["second", "third"]);
  });

  it("evicts the oldest excess entries by updatedAt when several become evictable at once", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 2 });
    const releaseActive = client.subscribe(["active"], () => {});
    let observedDuringUpdater: string[] = [];

    client.setQueryData(["active"], "active");
    vi.advanceTimersByTime(10);
    client.setQueryData(["older"], "older");
    vi.advanceTimersByTime(10);
    client.setQueryData(["newer"], "newer");
    vi.advanceTimersByTime(10);

    // Four entries are evictable at the nested write, and the entry created for
    // the updater itself is the oldest, so insertion order and updatedAt order
    // disagree about which two entries have to go.
    client.setQueryData(["updater"], (previous: string | undefined) => {
      client.setQueryData(["nested"], "nested");
      observedDuringUpdater = cachedKeys(client);
      return previous ?? "value";
    });

    expect(observedDuringUpdater).toEqual(["active", "newer", "nested"]);
    expect(cachedKeys(client)).toEqual(["active", "nested", "updater"]);

    releaseActive();
  });

  it("evicts every excess entry when several become evictable before one enforcement", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 1 });
    let observedDuringUpdater: string[] = [];

    client.setQueryData(["existing"], "existing");
    vi.advanceTimersByTime(10);

    // The updater runs after its own entry is created but before the cap is
    // enforced, so the nested write sees three evictable entries at once.
    client.setQueryData(["updated"], (previous: string | undefined) => {
      client.setQueryData(["nested"], "nested");
      observedDuringUpdater = cachedKeys(client);
      return previous ?? "value";
    });

    expect(observedDuringUpdater).toEqual(["nested"]);
    expect(cachedKeys(client)).toEqual(["updated"]);
  });

  it("evicts several entries at once when the cache overflows the cap by more than one", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 4 });
    const release = client.subscribe(["pinned"], () => {});

    client.setQueryData(["pinned"], "pinned");
    for (const key of ["a", "b", "c", "d"]) {
      vi.advanceTimersByTime(1);
      client.setQueryData([key], key);
    }
    expect(cachedKeys(client)).toEqual(["pinned", "a", "b", "c", "d"]);

    release();

    expect(cachedKeys(client)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("inactive entry cap reentrancy", () => {
  it("does not revive entries removed from inside a notification", () => {
    const client = createQueryClient({ maxInactiveEntries: 2 });
    let removed = false;

    seedInactiveEntries(client, ["victim"]);
    const release = client.subscribe(["trigger"], () => {
      if (!removed) {
        removed = true;
        client.removeQueries({ queryKey: ["victim"] });
      }
    });

    client.setQueryData(["trigger"], "trigger");
    release();

    expect(cachedKeys(client)).toEqual(["trigger"]);
  });

  it("keeps counts consistent when a notification cancels an in-flight query", async () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 1 });
    const deferred = createDeferred<string>();
    let canceled = false;
    const pending = client.fetchQuery({
      queryKey: ["cancel-me"],
      queryFn: () => deferred.promise,
    });
    const release = client.subscribe(["trigger"], () => {
      if (!canceled) {
        canceled = true;
        // Cancelling restamps updatedAt, so advancing first makes the canceled
        // entry unambiguously newer than the subscribed one.
        vi.advanceTimersByTime(10);
        client.cancelQueries({ queryKey: ["cancel-me"] });
      }
    });

    client.setQueryData(["trigger"], "trigger");
    deferred.resolve("late");
    await pending;

    // The canceled entry is inactive again but still within the cap.
    expect(cachedKeys(client)).toEqual(["cancel-me", "trigger"]);

    release();

    expect(cachedKeys(client)).toEqual(["cancel-me"]);

    vi.advanceTimersByTime(10);
    client.setQueryData(["after"], "after");

    expect(cachedKeys(client)).toEqual(["after"]);
  });

  it("keeps counts consistent when a notification re-subscribes to an evicted key", () => {
    const client = createQueryClient({ maxInactiveEntries: 1 });
    let resubscribed = false;
    let inner: (() => void) | undefined;

    seedInactiveEntries(client, ["recycled"]);
    const release = client.subscribe(["trigger"], () => {
      if (!resubscribed) {
        resubscribed = true;
        inner = client.subscribe(["recycled"], () => {});
      }
    });

    client.setQueryData(["trigger"], "trigger");

    expect(cachedKeys(client).sort()).toEqual(["recycled", "trigger"]);

    inner?.();
    release();

    expect(cachedKeys(client)).toEqual(["trigger"]);
  });

  it("keeps the cap enforced after every entry is removed and repopulated", () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 2 });

    seedInactiveEntries(client, ["a", "b"]);
    client.removeQueries();
    expect(client.entries()).toEqual([]);

    client.setQueryData(["c"], "c");
    vi.advanceTimersByTime(1);
    client.setQueryData(["d"], "d");
    vi.advanceTimersByTime(1);
    client.setQueryData(["e"], "e");

    expect(cachedKeys(client)).toEqual(["d", "e"]);
  });
});
