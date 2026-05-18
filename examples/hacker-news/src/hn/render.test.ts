import { describe, expect, test } from "vitest";
import { chunkStoryIds, storyPlaceholderRanks } from "./render.js";
import { safeHttpUrl } from "./url.js";

describe("HN render helpers", () => {
  test("allows only http and https story URLs", () => {
    expect(safeHttpUrl("https://example.com/story")).toBe("https://example.com/story");
    expect(safeHttpUrl("http://example.com/story")).toBe("http://example.com/story");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHttpUrl("java\nscript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });

  test("chunks story ids into stable ranked batches", () => {
    expect(chunkStoryIds([10, 11, 12, 13, 14, 15, 16], 3)).toEqual([
      { ids: [10, 11, 12], startRank: 1 },
      { ids: [13, 14, 15], startRank: 4 },
      { ids: [16], startRank: 7 },
    ]);
  });

  test("creates stable placeholder ranks for streamed story rows", () => {
    expect(storyPlaceholderRanks(6, 4)).toEqual([6, 7, 8, 9]);
    expect(storyPlaceholderRanks(1, 0)).toEqual([]);
  });
});
