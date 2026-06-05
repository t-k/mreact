// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { batch, cell } from "@reckona/mreact-reactive-core";
import { bindText } from "../src/index.js";

// document.startViewTransition(updateCallback) captures the new-state snapshot
// at the first rendering opportunity after the promise returned by the update
// callback settles. Rendering steps never interleave with the microtask queue,
// so any DOM mutation flushed in a microtask queued during the callback is
// guaranteed to be visible to that snapshot. These tests pin the event-loop
// contract: cell-driven DOM bindings commit no later than promise reactions
// queued after the update callback returns. If the default reactive scheduler
// ever moves to a macrotask (setTimeout/MessageChannel), they fail.
describe("view transition update callback contract", () => {
  test("cell.set inside a sync update callback commits before the callback promise settles", async () => {
    const selected = cell("a");
    const text = document.createTextNode("");
    const dispose = bindText(text, () => selected.get());

    try {
      const updateCallback = () => {
        selected.set("b");
      };

      await Promise.resolve(updateCallback());

      expect(text.data).toBe("b");
    } finally {
      dispose();
    }
  });

  test("cell.set inside an async update callback commits before the returned promise settles", async () => {
    const selected = cell("a");
    const text = document.createTextNode("");
    const dispose = bindText(text, () => selected.get());

    try {
      const updateCallback = async () => {
        await Promise.resolve();
        selected.set("b");
      };

      await updateCallback();

      expect(text.data).toBe("b");
    } finally {
      dispose();
    }
  });

  test("batched cell updates inside an update callback commit before the callback promise settles", async () => {
    const first = cell("a");
    const second = cell("x");
    const text = document.createTextNode("");
    const dispose = bindText(text, () => `${first.get()}${second.get()}`);

    try {
      const updateCallback = () => {
        batch(() => {
          first.set("b");
          second.set("y");
        });
      };

      await Promise.resolve(updateCallback());

      expect(text.data).toBe("by");
    } finally {
      dispose();
    }
  });
});
