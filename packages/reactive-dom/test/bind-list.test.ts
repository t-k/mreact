// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindList, bindText } from "../src/index.js";

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

  test("keeps keyed list DOM in place when keys stay in the same order", async () => {
    const labels = new Map([
      ["a", cell("A")],
      ["b", cell("B")],
      ["c", cell("C")],
    ]);
    const items = cell(["a", "b", "c"]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (id) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        li.append(text);
        bindText(text, () => labels.get(id)?.get());
        return li;
      },
      { key: (item) => item },
    );

    const originalNodes = Array.from(parent.childNodes);
    let parentInsertions = 0;
    let parentReplacements = 0;
    let parentRemovals = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;
    parent.removeChild = ((node) => {
      parentRemovals += 1;
      return removeChild(node);
    }) as typeof parent.removeChild;

    labels.get("b")?.set("B2");
    items.set(["a", "b", "c"]);
    await flushEffects();

    expect(parentInsertions).toBe(0);
    expect(parentReplacements).toBe(0);
    expect(parentRemovals).toBe(0);
    expect(Array.from(parent.childNodes)).toEqual(originalNodes);
    expect(parent.innerHTML).toBe("<li>A</li><li>B2</li><li>C</li><!--list-->");

    dispose();
  });

  test("updates keyed row closures when an item object is replaced with the same key", async () => {
    const items = cell([{ id: "book", quantity: 1 }]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);
    const clickedQuantities: number[] = [];

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "read";
        button.addEventListener("click", () => {
          clickedQuantities.push(item.quantity);
        });
        li.append(text, button);
        bindText(text, () => String(item.quantity));
        return li;
      },
      { key: (item) => item.id },
    );

    const originalRow = parent.firstChild;
    expect(parent.textContent).toBe("1read");

    items.set([{ id: "book", quantity: 2 }]);
    await flushEffects();

    expect(parent.firstChild).toBe(originalRow);
    expect(parent.textContent).toBe("2read");

    (parent.querySelector("button") as HTMLButtonElement).click();
    expect(clickedQuantities).toEqual([2]);

    dispose();
  });

  test("does not throw when an unkeyed list marker has been removed before a queued update", async () => {
    const items = cell(["A"]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(parent, marker, () => items.get(), (item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    });
    expect(parent.innerHTML).toBe("<li>A</li><!--list-->");

    marker.remove();
    items.set(["B"]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.innerHTML).toBe("");

    dispose();
  });

  test("appends keyed list items without replacing existing parent contents", async () => {
    const values = [0, 1, 2];
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

    const originalNodes = Array.from(parent.childNodes).slice(0, values.length);
    let parentInsertions = 0;
    let parentReplacements = 0;
    let parentRemovals = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;
    parent.removeChild = ((node) => {
      parentRemovals += 1;
      return removeChild(node);
    }) as typeof parent.removeChild;

    items.set([0, 1, 2, 3, 4]);
    await flushEffects();

    expect(parentInsertions).toBe(2);
    expect(parentReplacements).toBe(0);
    expect(parentRemovals).toBe(0);
    expect(Array.from(parent.childNodes).slice(0, values.length)).toEqual(
      originalNodes,
    );
    expect(parent.innerHTML).toBe(
      "<li>0</li><li>1</li><li>2</li><li>3</li><li>4</li><!--list-->",
    );

    dispose();
  });

  test("removes keyed list items without replacing or reinserting retained nodes", async () => {
    const items = cell([0, 1, 2, 3]);
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

    const originalZero = parent.childNodes[0];
    const originalOne = parent.childNodes[1];
    const originalThree = parent.childNodes[3];
    let parentInsertions = 0;
    let parentReplacements = 0;
    let parentRemovals = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;
    parent.removeChild = ((node) => {
      parentRemovals += 1;
      return removeChild(node);
    }) as typeof parent.removeChild;

    items.set([0, 1, 3]);
    await flushEffects();

    expect(parentInsertions).toBe(0);
    expect(parentReplacements).toBe(0);
    expect(parentRemovals).toBe(1);
    expect(parent.childNodes[0]).toBe(originalZero);
    expect(parent.childNodes[1]).toBe(originalOne);
    expect(parent.childNodes[2]).toBe(originalThree);
    expect(parent.innerHTML).toBe("<li>0</li><li>1</li><li>3</li><!--list-->");

    dispose();
  });
});
