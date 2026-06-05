// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect } from "@reckona/mreact-reactive-core";
import { flushSync } from "../src/index.js";

describe("flushSync with reactive-core updates", () => {
  test("flushes cell-driven DOM effects before returning", () => {
    const node = document.createTextNode("old");
    const value = cell("old");
    const dispose = effect(() => {
      node.data = value.get();
    });

    try {
      flushSync(() => {
        value.set("new");
      });

      expect(node.data).toBe("new");
    } finally {
      dispose();
    }
  });

  test("flushes computed-derived DOM effects before returning", () => {
    const node = document.createTextNode("");
    const count = cell(1);
    const doubled = computed(() => count.get() * 2);
    const dispose = effect(() => {
      node.data = String(doubled.get());
    });

    try {
      expect(node.data).toBe("2");

      flushSync(() => {
        count.set(5);
      });

      expect(node.data).toBe("10");
    } finally {
      dispose();
    }
  });

  test("flushes computed-derived updates queued inside an outer batch", () => {
    const node = document.createTextNode("");
    const count = cell(1);
    const doubled = computed(() => count.get() * 2);
    const dispose = effect(() => {
      node.data = String(doubled.get());
    });

    try {
      batch(() => {
        count.set(3);

        flushSync(() => {});

        expect(node.data).toBe("6");
      });
    } finally {
      dispose();
    }
  });

  test("returns the callback result after flushing reactive updates", () => {
    const node = document.createTextNode("old");
    const value = cell("old");
    const dispose = effect(() => {
      node.data = value.get();
    });

    try {
      const result = flushSync(() => {
        value.set("next");
        return "done";
      });

      expect(result).toBe("done");
      expect(node.data).toBe("next");
    } finally {
      dispose();
    }
  });
});
