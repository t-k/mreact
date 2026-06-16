// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindStaticKeyedSingleNodeList, bindText } from "../src/index.js";

describe("bindStaticKeyedSingleNodeList", () => {
  test("creates, replaces, swaps, removes, and clears keyed single-node rows", async () => {
    const firstLabel = cell("A");
    const secondLabel = cell("B");
    const thirdLabel = cell("C");
    const items = cell([
      { id: 1, label: firstLabel },
      { id: 2, label: secondLabel },
    ]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    parent.append(marker);

    const dispose = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        const text = document.createTextNode(item.label.get());
        td.append(text);
        tr.append(td);
        bindText(text, item.label, { preserveInitial: true });
        return tr;
      },
      { key: (item) => item.id },
    );

    const firstRow = parent.children[0];
    const secondRow = parent.children[1];

    expect(parent.innerHTML).toBe("<tr><td>A</td></tr><tr><td>B</td></tr><!--rows-->");

    firstLabel.set("A!");
    await flushEffects();
    expect(parent.innerHTML).toBe("<tr><td>A!</td></tr><tr><td>B</td></tr><!--rows-->");

    items.set([
      { id: 2, label: secondLabel },
      { id: 1, label: firstLabel },
    ]);
    await flushEffects();
    expect(parent.children[0]).toBe(secondRow);
    expect(parent.children[1]).toBe(firstRow);

    items.set([{ id: 3, label: thirdLabel }]);
    await flushEffects();
    expect(parent.innerHTML).toBe("<tr><td>C</td></tr><!--rows-->");
    expect(parent.children[0]).not.toBe(firstRow);
    expect(parent.children[0]).not.toBe(secondRow);

    items.set([]);
    await flushEffects();
    expect(parent.innerHTML).toBe("<!--rows-->");

    dispose();
  });

  test("can bind selected class for keyed row elements with one list-level subscription", async () => {
    const selected = cell<number | null>(null);
    const items = cell([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    parent.append(marker);

    const dispose = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const tr = document.createElement("tr");
        tr.textContent = item.label;
        return tr;
      },
      {
        key: (item) => item.id,
        selectedClass: {
          className: "danger",
          source: selected,
        },
      },
    );

    expect(parent.children[0]?.className).toBe("");
    expect(parent.children[1]?.className).toBe("");

    selected.set(2);
    await flushEffects();
    expect(parent.children[0]?.className).toBe("");
    expect(parent.children[1]?.className).toBe("danger");

    selected.set(1);
    await flushEffects();
    expect(parent.children[0]?.className).toBe("danger");
    expect(parent.children[1]?.className).toBe("");

    items.set([{ id: 3, label: "C" }]);
    await flushEffects();
    expect(parent.children[0]?.className).toBe("");

    selected.set(3);
    await flushEffects();
    expect(parent.children[0]?.className).toBe("danger");

    items.set([]);
    await flushEffects();
    selected.set(1);
    await flushEffects();
    expect(parent.innerHTML).toBe("<!--rows-->");

    dispose();
  });

  test("can preserve initial selected class state without classList writes", () => {
    const selected = cell<number | null>(null);
    const items = cell([{ id: 1, label: "A" }]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    let writes = 0;
    parent.append(marker);

    const dispose = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const tr = document.createElement("tr");
        const add = tr.classList.add.bind(tr.classList);
        const remove = tr.classList.remove.bind(tr.classList);
        tr.classList.add = ((...tokens) => {
          writes += 1;
          return add(...tokens);
        }) as typeof tr.classList.add;
        tr.classList.remove = ((...tokens) => {
          writes += 1;
          return remove(...tokens);
        }) as typeof tr.classList.remove;
        tr.textContent = item.label;
        return tr;
      },
      {
        key: (item) => item.id,
        selectedClass: {
          className: "danger",
          preserveInitial: true,
          source: selected,
        },
      },
    );

    expect(writes).toBe(0);

    dispose();
  });
});
