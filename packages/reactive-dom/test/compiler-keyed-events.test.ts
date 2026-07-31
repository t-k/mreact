// @vitest-environment happy-dom

import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { describe, expect, test, vi } from "vitest";
import { bindCompilerKeyedSingleNodeList, markCompilerKeyedEventSlot } from "../src/internal.js";

interface Row {
  id: number;
  label: string;
}

describe("compiler keyed events", () => {
  test("delegates row slots through one parent listener with current row context", async () => {
    const parent = document.createElement("tbody");
    const marker = document.createComment("");
    parent.append(marker);
    document.body.append(parent);
    const rows = cell<readonly Row[]>([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ]);
    const parentAdds = vi.spyOn(parent, "addEventListener");
    const parentRemoves = vi.spyOn(parent, "removeEventListener");
    const calls: string[] = [];
    const currentTargets: EventTarget[] = [];

    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => rows.get(),
      (_row) => {
        const tr = document.createElement("tr");
        const button = document.createElement("button");
        const child = document.createElement("span");
        button.append(child);
        tr.append(button);
        markCompilerKeyedEventSlot(button, "click", 0);
        return tr;
      },
      {
        key: (row) => row.id,
        compilerEvents: [
          {
            type: "click",
            dispatch: (_slot, row, event, currentTarget) => {
              calls.push(`${row.item.label}:${row.index}:${row.items.length}`);
              currentTargets.push(event.currentTarget as EventTarget, currentTarget);
            },
          },
        ],
      },
    );

    expect(parentAdds.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);
    const [firstRow, secondRow] = Array.from(parent.querySelectorAll("tr"));
    const firstButton = firstRow?.querySelector("button");
    firstButton?.querySelector("span")?.click();
    expect(calls).toEqual(["A:0:2"]);
    expect(currentTargets).toEqual([firstButton, firstButton]);

    rows.set([
      { id: 2, label: "B!" },
      { id: 1, label: "A!" },
    ]);
    await flushEffects();
    expect(parent.querySelectorAll("tr")[0]).toBe(secondRow);
    expect(parent.querySelectorAll("tr")[1]).toBe(firstRow);
    firstButton?.click();
    expect(calls).toEqual(["A:0:2", "A!:1:2"]);

    dispose();
    expect(parentRemoves.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);
    firstButton?.click();
    expect(calls).toEqual(["A:0:2", "A!:1:2"]);
  });

  test("honors propagation when nested slots share an event type", () => {
    const parent = document.createElement("tbody");
    const marker = document.createComment("");
    parent.append(marker);
    document.body.append(parent);
    const calls: number[] = [];

    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => [{ id: 1 }],
      () => {
        const tr = document.createElement("tr");
        const outer = document.createElement("button");
        const inner = document.createElement("span");
        markCompilerKeyedEventSlot(outer, "click", 1);
        markCompilerKeyedEventSlot(inner, "click", 0);
        outer.append(inner);
        tr.append(outer);
        return tr;
      },
      {
        key: (row) => row.id,
        compilerEvents: [
          {
            type: "click",
            dispatch: (slot, _row, event) => {
              calls.push(slot);
              if (slot === 0) {
                event.stopPropagation();
              }
            },
          },
        ],
      },
    );

    parent.querySelector("span")?.click();
    expect(calls).toEqual([0]);
    dispose();
  });

  test("isolates delegated events between compiler keyed lists sharing one parent", () => {
    const parent = document.createElement("main");
    const firstMarker = document.createComment("first");
    const secondMarker = document.createComment("second");
    parent.append(firstMarker, secondMarker);
    document.body.append(parent);
    const calls: string[] = [];

    const bindList = (name: string, marker: Comment, id: number) =>
      bindCompilerKeyedSingleNodeList(
        parent,
        marker,
        () => [{ id, label: name }],
        () => {
          const row = document.createElement("section");
          const button = document.createElement("button");
          markCompilerKeyedEventSlot(button, "click", 0);
          row.append(button);
          return row;
        },
        {
          key: (row) => row.id,
          compilerEvents: [
            {
              type: "click",
              dispatch: (_slot, row) => {
                calls.push(`${name}:${row.item.label}`);
              },
            },
          ],
        },
      );

    const disposeFirst = bindList("A", firstMarker, 1);
    const disposeSecond = bindList("B", secondMarker, 2);

    parent.querySelectorAll("button")[1]?.click();
    expect(calls).toEqual(["B:B"]);

    disposeSecond();
    disposeFirst();
  });
});
