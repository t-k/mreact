// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { bindList } from "../src/index.js";

describe("bindList", () => {
  test("renders a simple unkeyed list and redraws on update", async () => {
    const items = cell(["A", "B"]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(parent, marker, () => items.get(), (item, index) => {
      const li = document.createElement("li");
      li.textContent = `${index}:${item}`;
      return li;
    });

    expect(parent.innerHTML).toBe("<li>0:A</li><li>1:B</li><!--list-->");

    items.set(["C"]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>0:C</li><!--list-->");

    dispose();
    items.set(["D"]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<!--list-->");
  });

  test("reorders keyed list items without recreating existing nodes", async () => {
    const items = cell([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        li.textContent = item.label;
        return li;
      },
      { key: (item) => item.id },
    );

    const firstA = parent.childNodes[0];
    const firstB = parent.childNodes[1];

    items.set([
      { id: "b", label: "B" },
      { id: "a", label: "A" },
    ]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>B</li><li>A</li><!--list-->");
    expect(parent.childNodes[0]).toBe(firstB);
    expect(parent.childNodes[1]).toBe(firstA);

    dispose();
  });
});
