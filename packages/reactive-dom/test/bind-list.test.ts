// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
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

  test("reorders keyed list items with one whole-parent replacement", async () => {
    const values = Array.from({ length: 1000 }, (_, index) => index);
    const items = cell(values);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        li.textContent = String(item);
        return li;
      },
      { key: (item) => item },
    );

    const firstNode = parent.childNodes[0];
    let parentInsertions = 0;
    let parentReplacements = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;

    items.set(values.toReversed());
    await flushEffects();

    expect(parentInsertions).toBe(0);
    expect(parentReplacements).toBe(1);
    expect(parent.childNodes[0]?.textContent).toBe("999");
    expect(parent.childNodes[999]).toBe(firstNode);

    dispose();
  });
});
