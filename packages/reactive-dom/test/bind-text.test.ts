// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { setScheduler } from "@reckona/mreact-reactive-core/internal";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
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

  test("can preserve an already-initialized text node until the first update", async () => {
    const count = cell(0);
    const text = document.createTextNode("server");
    const dispose = bindText(text, () => count.get(), {
      preserveInitial: true,
    });

    expect(text.data).toBe("server");

    count.set(1);
    await flushEffects();
    expect(text.data).toBe("1");

    dispose();
  });

  test("binds text directly to a readonly cell", async () => {
    const count = cell(0);
    const text = document.createTextNode("");
    const dispose = bindText(text, count);

    expect(text.data).toBe("0");

    count.set(1);
    await flushEffects();
    expect(text.data).toBe("1");

    dispose();
    count.set(2);
    await flushEffects();
    expect(text.data).toBe("1");
  });

  test("direct readonly cell binding can preserve an already-initialized text node", async () => {
    const count = cell(0);
    const text = document.createTextNode("server");
    const dispose = bindText(text, count, {
      preserveInitial: true,
    });

    expect(text.data).toBe("server");

    count.set(1);
    await flushEffects();
    expect(text.data).toBe("1");

    dispose();
  });

  test("direct readonly cell binding uses the reactive scheduler", async () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const count = cell(0);
      const text = document.createTextNode("");
      const dispose = bindText(text, count);

      count.set(1);

      expect(text.data).toBe("0");
      expect(scheduled).toHaveLength(1);

      await flushEffects();
      expect(text.data).toBe("1");

      dispose();
    } finally {
      restoreScheduler();
    }
  });

  test("direct readonly cell subscriptions share computation methods", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "reactive-core", "src", "cell-subscription.ts"),
      "utf8",
    );

    expect(source).toContain("const CELL_SUBSCRIPTION_COMPUTATION_METHODS");
    expect(source).not.toContain("emptyDeps");
    expect(source).not.toContain("...CELL_SUBSCRIPTION_COMPUTATION_METHODS");
    expect(source).not.toContain("markDirty() {");
    expect(source).not.toContain("run() {");
    expect(source).not.toContain("dispose() {");
  });

  test("direct readonly cell binding does not allocate the effect fallback reader first", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "reactive-dom", "src", "bind-text.ts"),
      "utf8",
    );
    const directBranchStart = source.indexOf('if (typeof value !== "function")');
    const subscribeCellStart = source.indexOf("const directDispose = subscribeCell");
    const readValueStart = source.indexOf("const readValue");

    expect(readValueStart).toBeGreaterThan(subscribeCellStart);
    expect(readValueStart).toBeGreaterThan(directBranchStart);
  });

  test("direct readonly cell binding keeps preserveInitial checks out of the update listener", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "reactive-dom", "src", "bind-text.ts"),
      "utf8",
    );
    const subscribeCellStart = source.indexOf("const directDispose = subscribeCell");
    const directReturnStart = source.indexOf("return registerIdempotentDispose(directDispose)");
    const directBranch = source.slice(subscribeCellStart, directReturnStart);

    expect(directBranch).not.toContain("shouldWrite");
    expect(directBranch).toContain('typeof nextValue === "string"');
    expect(directBranch).toContain("? nextValue");
    expect(directBranch).toContain(": normalizeText(nextValue)");
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

  test("bindTextBatch can preserve already-initialized text nodes until the first update", async () => {
    const count = cell(0);
    const nodes = Array.from({ length: 3 }, () =>
      document.createTextNode("server"),
    );
    const dispose = bindTextBatch(nodes, () => count.get(), {
      preserveInitial: true,
    });

    expect(nodes.map((node) => node.data)).toEqual([
      "server",
      "server",
      "server",
    ]);

    count.set(1);
    await flushEffects();

    expect(nodes.map((node) => node.data)).toEqual(["1", "1", "1"]);

    dispose();
  });
});
