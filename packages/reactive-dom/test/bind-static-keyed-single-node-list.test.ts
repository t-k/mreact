// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindStaticKeyedSingleNodeList, bindText } from "../src/index.js";

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

  test("preserves sibling nodes around an embedded marker", async () => {
    const items = cell([1, 2]);
    const parent = document.createElement("section");
    const before = document.createElement("header");
    const after = document.createElement("footer");
    const marker = document.createComment("rows");
    before.textContent = "before";
    after.textContent = "after";
    parent.append(before, marker, after);

    const dispose = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const row = document.createElement("p");
        row.textContent = String(item);
        return row;
      },
      { key: (item) => item },
    );

    expect(parent.childNodes[0]).toBe(before);
    expect(parent.childNodes[3]).toBe(marker);
    expect(parent.childNodes[4]).toBe(after);

    items.set([]);
    await flushEffects();

    expect(parent.childNodes.length).toBe(3);
    expect(parent.childNodes[0]).toBe(before);
    expect(parent.childNodes[1]).toBe(marker);
    expect(parent.childNodes[2]).toBe(after);

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

  test("promotes delegated row events by default without detached fallback listeners", () => {
    const items = cell([1, 2]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    const calls: number[] = [];
    let rowClickFallbacks = 0;
    parent.append(marker);
    document.body.append(parent);

    const dispose = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const tr = document.createElement("tr");
        const addEventListener = tr.addEventListener.bind(tr);
        tr.addEventListener = ((type, listener, options) => {
          if (type === "click") {
            rowClickFallbacks += 1;
          }
          addEventListener(type, listener, options);
        }) as typeof tr.addEventListener;
        bindEvent(tr, "click", () => {
          calls.push(item);
        });
        tr.textContent = String(item);
        return tr;
      },
      { key: (item) => item },
    );

    expect(rowClickFallbacks).toBe(0);

    (parent.firstElementChild as HTMLTableRowElement).click();
    expect(calls).toEqual([1]);

    dispose();
    parent.remove();
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

  test("recreates records when a renderer depends on the item index", async () => {
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
      (item, index) => {
        const tr = document.createElement("tr");
        tr.textContent = `${index}:${item.label}`;
        return tr;
      },
      { key: (item) => item.id },
    );

    const firstRow = parent.children[0];

    items.set([
      { id: 2, label: "B" },
      { id: 1, label: "A" },
    ]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<tr>0:B</tr><tr>1:A</tr><!--rows-->");
    expect(parent.children[1]).not.toBe(firstRow);

    dispose();
  });

  test("creates single-node records without per-record object spread", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );
    const createRecordStart = source.indexOf("function createSingleNodeRecord");
    const updateRecordStart = source.indexOf("function updateSameOrderRecords");
    const createRecordSource = source.slice(createRecordStart, updateRecordStart);

    expect(createRecordSource).not.toContain("...");
    expect(createRecordSource).not.toContain("currentIndex: index");
    expect(createRecordSource).not.toContain("currentItems: items");
    expect(createRecordSource).toContain("deferEventPromotion");
  });

  test("creates scoped render node results without per-row object spread", async () => {
    const source = await readFile("packages/reactive-dom/src/render-scope.ts", "utf8");
    const helperStart = source.indexOf("export function createScopedRenderNodeScope");
    const helperSource = source.slice(helperStart);

    expect(helperSource).not.toContain("...");
  });
});
