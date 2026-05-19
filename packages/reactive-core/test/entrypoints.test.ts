import { describe, expect, test } from "vitest";
import { batch, batchAsync, cell, computed, effect, untrack } from "../src/index.js";
import { setScheduler } from "../src/internal.js";
import { flushEffects, flushMicrotasks } from "../src/testing.js";

describe("reactive-core entrypoints", () => {
  test("public, internal, and testing entrypoints resolve", () => {
    expect(typeof cell).toBe("function");
    expect(typeof computed).toBe("function");
    expect(typeof effect).toBe("function");
    expect(typeof batch).toBe("function");
    expect(typeof batchAsync).toBe("function");
    expect(typeof untrack).toBe("function");
    expect(typeof setScheduler).toBe("function");
    expect(typeof flushMicrotasks).toBe("function");
    expect(typeof flushEffects).toBe("function");
  });
});
