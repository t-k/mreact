import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createCollection } from "../src/index.js";

interface Row {
  id: string;
  status: "open" | "done";
  label: string;
}

const row = (id: string, status: Row["status"] = "open"): Row => ({
  id,
  status,
  label: id,
});

describe("createCollection", () => {
  it("exposes keyed rows, order, count, and an ordinary array snapshot", () => {
    const rows = createCollection([row("a"), row("b")], { key: (item) => item.id });

    expect(rows.order.get()).toEqual(["a", "b"]);
    expect(rows.count.get()).toBe(2);
    expect(rows.row("a")?.get()).toEqual(row("a"));
    expect(rows.toArray()).toEqual([row("a"), row("b")]);
    expect("set" in rows.order).toBe(false);
    expect("set" in rows.count).toBe(false);
    expect("set" in rows.row("a")!).toBe(false);
  });

  it("keeps a row cell stable across patches and moves", () => {
    const rows = createCollection([row("a"), row("b"), row("c")], {
      key: (item) => item.id,
    });
    const a = rows.row("a")!;

    rows.patch("a", { status: "done" });
    rows.move("a", { before: "c" });

    expect(rows.row("a")).toBe(a);
    expect(a.get()).toEqual(row("a", "done"));
    expect(rows.order.get()).toEqual(["b", "a", "c"]);
    expect(rows.toArray()).toEqual([row("b"), row("a", "done"), row("c")]);
  });

  it("updates row, order, and count subscribers independently", async () => {
    const rows = createCollection([row("a"), row("b")], { key: (item) => item.id });
    const seenA: Array<Row | undefined> = [];
    const seenOrder: Array<readonly string[]> = [];
    const seenCount: number[] = [];
    const stopA = effect(() => {
      seenA.push(rows.row("a")?.get());
    });
    const stopOrder = effect(() => {
      seenOrder.push(rows.order.get());
    });
    const stopCount = effect(() => {
      seenCount.push(rows.count.get());
    });

    rows.patch("b", { status: "done" });
    await flushEffects();
    expect(seenA).toHaveLength(1);
    expect(seenOrder).toHaveLength(1);
    expect(seenCount).toEqual([2]);

    rows.patch("a", { status: "done" });
    await flushEffects();
    expect(seenA).toEqual([row("a"), row("a", "done")]);
    expect(seenOrder).toHaveLength(1);
    expect(seenCount).toEqual([2]);

    rows.move("b", { before: "a" });
    await flushEffects();
    expect(seenA).toHaveLength(2);
    expect(seenOrder).toEqual([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(seenCount).toEqual([2]);

    rows.append(row("c"));
    await flushEffects();
    expect(seenA).toHaveLength(2);
    expect(seenOrder.at(-1)).toEqual(["b", "a", "c"]);
    expect(seenCount).toEqual([2, 3]);
    stopA();
    stopOrder();
    stopCount();
  });

  it("rejects duplicate and missing keys without changing the collection", () => {
    expect(() => createCollection([row("a"), row("a")], { key: (item) => item.id })).toThrow(
      /duplicate/i,
    );
    const rows = createCollection([row("a"), row("b")], { key: (item) => item.id });
    const initial = rows.toArray();

    expect(() => rows.append(row("a"))).toThrow(/duplicate/i);
    expect(() => rows.patch("missing", { status: "done" })).toThrow(/missing/i);
    expect(() => rows.patch("a", { id: "renamed" })).toThrow(/key/i);
    expect(() => rows.move("missing", { before: "a" })).toThrow(/missing/i);
    expect(() => rows.move("a", { before: "missing" })).toThrow(/missing/i);
    expect(() => rows.remove("missing")).toThrow(/missing/i);
    expect(rows.toArray()).toEqual(initial);
  });

  it("treats self and adjacent moves as no-ops", async () => {
    const rows = createCollection([row("a"), row("b")], { key: (item) => item.id });
    let orderRuns = 0;
    const stop = effect(() => {
      rows.order.get();
      orderRuns += 1;
    });

    rows.move("a", { before: "a" });
    rows.move("a", { before: "b" });
    await flushEffects();

    expect(rows.order.get()).toEqual(["a", "b"]);
    expect(orderRuns).toBe(1);
    stop();
  });

  it("moves a row before a non-adjacent target and removes only the chosen row", () => {
    const rows = createCollection([row("a"), row("b"), row("c"), row("d")], {
      key: (item) => item.id,
    });

    rows.move("d", { before: "b" });
    expect(rows.order.get()).toEqual(["a", "d", "b", "c"]);
    rows.remove("b");
    expect(rows.order.get()).toEqual(["a", "d", "c"]);
    expect(rows.toArray()).toEqual([row("a"), row("d"), row("c")]);
  });

  it("uses Map equality for NaN and signed-zero keys", () => {
    const rows = createCollection(
      [
        { id: Number.NaN, label: "nan" },
        { id: -0, label: "zero" },
      ],
      {
        key: (item) => item.id,
      },
    );

    rows.patch(Number.NaN, { label: "updated" });
    expect(rows.row(Number.NaN)?.get()?.label).toBe("updated");
    expect(() => rows.append({ id: +0, label: "duplicate" })).toThrow(/duplicate/i);
    rows.move(+0, { before: Number.NaN });
    expect(rows.toArray().map((item) => item.label)).toEqual(["zero", "updated"]);
    rows.remove(Number.NaN);
    expect(rows.toArray().map((item) => item.label)).toEqual(["zero"]);
  });

  it("ends a removed row cell and gives reinsertion a new cell", () => {
    const rows = createCollection([row("a")], { key: (item) => item.id });
    const stale = rows.row("a")!;
    rows.remove("a");
    expect(stale.get()).toBeUndefined();
    expect(rows.row("a")).toBeUndefined();
    expect(rows.count.get()).toBe(0);

    rows.append(row("a", "done"));
    expect(rows.row("a")).not.toBe(stale);
    expect(stale.get()).toBeUndefined();
    expect(rows.row("a")?.get()).toEqual(row("a", "done"));
  });

  it("matches a reference array model through a deterministic operation sequence", () => {
    const rows = createCollection<Row, string>([], { key: (item) => item.id });
    const model: Row[] = [];
    let seed = 49271;
    let nextId = 0;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };

    for (let step = 0; step < 250; step += 1) {
      const operation = model.length === 0 ? 0 : next() % 4;
      if (operation === 0) {
        const item = row(String(nextId++));
        model.push(item);
        rows.append(item);
      } else if (operation === 1) {
        const index = next() % model.length;
        const item = model[index]!;
        model[index] = { ...item, status: "done" };
        rows.patch(item.id, { status: "done" });
      } else if (operation === 2) {
        const source = next() % model.length;
        const target = next() % model.length;
        const item = model[source]!;
        const before = model[target]!.id;
        if (source !== target) {
          model.splice(source, 1);
          model.splice(
            model.findIndex((candidate) => candidate.id === before),
            0,
            item,
          );
        }
        rows.move(item.id, { before });
      } else {
        const index = next() % model.length;
        const [item] = model.splice(index, 1);
        rows.remove(item!.id);
      }

      expect(rows.toArray()).toEqual(model);
      expect(rows.order.get()).toEqual(model.map((item) => item.id));
      expect(rows.count.get()).toBe(model.length);
    }
  });
});
