// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@modular-react/reactive-core";
import { setScheduler } from "@modular-react/reactive-core/internal";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { bindText, bindTextBatch } from "../src/index.js";

describe("bindText", () => {
  test("updates text data and stops after dispose", async () => {
    const count = cell(0);
    const text = document.createTextNode("");
    const dispose = bindText(text, () => count.get());

    expect(text.data).toBe("0");

    count.set(1);
    await flushEffects();
    expect(text.data).toBe("1");

    dispose();
    count.set(2);
    await flushEffects();
    expect(text.data).toBe("1");
  });

  test("bindTextBatch updates many text nodes through one scheduled effect", async () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const count = cell(0);
      const nodes = Array.from({ length: 1000 }, () =>
        document.createTextNode(""),
      );
      const dispose = bindTextBatch(nodes, () => count.get());

      expect(nodes[0]?.data).toBe("0");
      expect(nodes[999]?.data).toBe("0");

      count.set(1);

      expect(scheduled).toHaveLength(1);

      await flushEffects();
      expect(nodes[0]?.data).toBe("1");
      expect(nodes[999]?.data).toBe("1");

      dispose();
      count.set(2);
      await flushEffects();

      expect(nodes[999]?.data).toBe("1");
    } finally {
      restoreScheduler();
    }
  });
});
