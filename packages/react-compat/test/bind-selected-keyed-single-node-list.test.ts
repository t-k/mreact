// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindText } from "@reckona/mreact-reactive-dom";
import { bindSelectedKeyedSingleNodeList } from "../src/internal.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("bindSelectedKeyedSingleNodeList", () => {
  test("retains keyed rows while item, index, items, selection, and events stay live", async () => {
    const state = cell<{
      readonly rows: readonly { readonly id: number; readonly label: string }[];
      readonly selected: number | null;
    }>({
      rows: [
        { id: 1, label: "A" },
        { id: 2, label: "B" },
      ],
      selected: null,
    });
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    const payloads: string[] = [];
    parent.append(marker);
    document.body.append(parent);

    const dispose = bindSelectedKeyedSingleNodeList(
      parent,
      marker,
      () => state.get().rows,
      (context) => {
        const row = document.createElement("tr");
        const text = document.createTextNode("");
        const input = document.createElement("input");
        const button = document.createElement("button");
        bindText(text, () => `${context.item.label}:${context.index}:${context.items.length}`);
        bindEvent(button, "click", () => {
          payloads.push(`${context.item.label}:${context.index}:${context.items.length}`);
        });
        row.append(text, input, button);
        return row;
      },
      {
        key: (item) => item.id,
        selectedClass: {
          className: "danger",
          selected: () => state.get().selected,
        },
      },
    );
    await flushEffects();

    const firstRow = parent.children[0] as HTMLTableRowElement;
    const secondRow = parent.children[1] as HTMLTableRowElement;
    const firstInput = firstRow.querySelector("input") as HTMLInputElement;
    firstInput.value = "edited";
    firstInput.focus();

    state.set({
      rows: [
        { id: 1, label: "A!" },
        { id: 2, label: "B" },
      ],
      selected: 2,
    });
    await flushEffects();

    expect(parent.children[0]).toBe(firstRow);
    expect(parent.children[1]).toBe(secondRow);
    expect(firstRow.textContent).toBe("A!:0:2");
    expect(firstInput.value).toBe("edited");
    expect(document.activeElement).toBe(firstInput);
    expect(Array.from(parent.children, (row) => row.className)).toEqual(["", "danger"]);

    state.set({
      rows: [
        { id: 2, label: "B" },
        { id: 1, label: "A!" },
      ],
      selected: 1,
    });
    await flushEffects();

    expect(parent.children[0]).toBe(secondRow);
    expect(parent.children[1]).toBe(firstRow);
    expect(firstRow.textContent).toBe("A!:1:2");
    expect(Array.from(parent.children, (row) => row.className)).toEqual(["", "danger"]);
    firstRow.querySelector("button")?.click();
    expect(payloads).toEqual(["A!:1:2"]);

    state.set({ rows: [{ id: 2, label: "B" }], selected: null });
    await flushEffects();
    expect(firstRow.isConnected).toBe(false);

    dispose();
    secondRow.querySelector("button")?.click();
    expect(payloads).toEqual(["A!:1:2"]);
  });
});
