// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell, selector, type Selector } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindSelectorClass } from "../src/index.js";

describe("bindSelectorClass", () => {
  test("toggles a class for only the selected key", async () => {
    const selected = cell<number | null>(null);
    const selectedFor = selector<number | null, number>(selected);
    const first = document.createElement("tr");
    const second = document.createElement("tr");
    const disposeFirst = bindSelectorClass(first, "danger", selectedFor, 1, {
      preserveInitial: true,
    });
    const disposeSecond = bindSelectorClass(second, "danger", selectedFor, 2, {
      preserveInitial: true,
    });

    selected.set(2);
    await flushEffects();

    expect(first.className).toBe("");
    expect(second.className).toBe("danger");

    selected.set(1);
    await flushEffects();

    expect(first.className).toBe("danger");
    expect(second.className).toBe("");

    disposeFirst();
    disposeSecond();
    selectedFor.dispose();
  });

  test("preserves an initially correct unselected class without touching classList", () => {
    const selected = cell<number | null>(null);
    const selectedFor = selector<number | null, number>(selected);
    const row = document.createElement("tr");
    let writes = 0;
    const add = row.classList.add.bind(row.classList);
    const remove = row.classList.remove.bind(row.classList);

    row.classList.add = ((...tokens) => {
      writes += 1;
      return add(...tokens);
    }) as typeof row.classList.add;
    row.classList.remove = ((...tokens) => {
      writes += 1;
      return remove(...tokens);
    }) as typeof row.classList.remove;

    const dispose = bindSelectorClass(row, "danger", selectedFor, 2, {
      preserveInitial: true,
    });

    expect(writes).toBe(0);

    dispose();
    selectedFor.dispose();
  });

  test("reads the initial selector value once", () => {
    const row = document.createElement("tr");
    let reads = 0;
    const selectedFor = ((key: number) => {
      reads += 1;
      return key === 1;
    }) as Selector<number, number>;

    selectedFor.subscribe = () => () => {};
    selectedFor.dispose = () => {};

    const dispose = bindSelectorClass(row, "danger", selectedFor, 1, {
      preserveInitial: true,
    });

    expect(reads).toBe(1);
    expect(row.className).toBe("");

    dispose();
  });
});
