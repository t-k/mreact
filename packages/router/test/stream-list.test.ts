import { describe, expect, test } from "vitest";
import { streamList } from "../src/stream-list.js";

describe("streamList", () => {
  test("creates stable ordered batch promises", async () => {
    const batches = streamList([1, 2, 3, 4, 5], {
      batchSize: 2,
      loadBatch: async (ids) => ids.map((id) => `story-${id}`),
    });

    expect(batches.map((batch) => ({ index: batch.index, size: batch.size, start: batch.start })))
      .toEqual([
        { index: 0, size: 2, start: 0 },
        { index: 1, size: 2, start: 2 },
        { index: 2, size: 1, start: 4 },
      ]);
    await expect(batches[1]!.value).resolves.toEqual({
      index: 1,
      items: ["story-3", "story-4"],
      size: 2,
      start: 2,
    });
  });

  test("uses a minimum batch size of one", () => {
    const batches = streamList([1, 2], {
      batchSize: 0,
      loadBatch: async (ids) => ids,
    });

    expect(batches).toHaveLength(2);
  });

  test("treats non-finite batch sizes as one", async () => {
    const batches = streamList([1, 2], {
      batchSize: Number.NaN,
      loadBatch: async (ids) => ids,
    });

    expect(batches.map((batch) => ({ size: batch.size, start: batch.start }))).toEqual([
      { size: 1, start: 0 },
      { size: 1, start: 1 },
    ]);
    await expect(Promise.all(batches.map((batch) => batch.value))).resolves.toEqual([
      { index: 0, items: [1], size: 1, start: 0 },
      { index: 1, items: [2], size: 1, start: 1 },
    ]);
  });
});
