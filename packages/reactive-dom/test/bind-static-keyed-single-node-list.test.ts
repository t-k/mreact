// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindStaticKeyedSingleNodeList, bindText } from "../src/index.js";
import { bindCompilerKeyedSingleNodeList } from "../src/internal.js";

describe("bindStaticKeyedSingleNodeList", () => {
  test("keeps compiler row identity while updating item, index, items, and events", async () => {
    const items = cell<readonly { readonly id: number; readonly label: string }[]>([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    const payloads: string[] = [];
    parent.append(marker);
    document.body.append(parent);

    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (context) => {
        const tr = document.createElement("tr");
        const text = document.createTextNode("");
        const input = document.createElement("input");
        const button = document.createElement("button");
        bindText(text, () => `${context.item.label}:${context.index}:${context.items.length}`);
        bindEvent(button, "click", () => {
          payloads.push(`${context.item.label}:${context.index}:${context.items.length}`);
        });
        tr.append(text, input, button);
        return tr;
      },
      { key: (item) => item.id },
    );
    await flushEffects();

    const firstRow = parent.children[0] as HTMLTableRowElement;
    const firstInput = firstRow.querySelector("input") as HTMLInputElement;
    firstInput.value = "edited";
    firstInput.focus();

    items.set([
      { id: 1, label: "A!" },
      { id: 2, label: "B" },
    ]);
    await flushEffects();
    expect(parent.children[0]).toBe(firstRow);
    expect(firstRow.textContent).toBe("A!:0:2");
    expect(firstInput.value).toBe("edited");
    expect(document.activeElement).toBe(firstInput);

    items.set([
      { id: 2, label: "B" },
      { id: 1, label: "A!" },
    ]);
    await flushEffects();
    expect(parent.children[1]).toBe(firstRow);
    expect(firstRow.textContent).toBe("A!:1:2");
    firstRow.querySelector("button")?.click();
    expect(payloads).toEqual(["A!:1:2"]);

    dispose();
    firstRow.querySelector("button")?.click();
    expect(payloads).toEqual(["A!:1:2"]);
    parent.remove();
  });

  test("does not notify item-only compiler rows for an unused array identity change", async () => {
    const first = { id: 1, label: "A" };
    const items = cell<readonly (typeof first)[]>([first]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    let reads = 0;
    parent.append(marker);

    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (context) => {
        const row = document.createElement("tr");
        const text = document.createTextNode("");
        bindText(text, () => {
          reads += 1;
          return context.item.label;
        });
        row.append(text);
        return row;
      },
      { key: (item) => item.id },
    );
    await flushEffects();
    const readsAfterMount = reads;

    items.set(items.get().slice());
    await flushEffects();

    expect(reads).toBe(readsAfterMount);
    dispose();
  });
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

  test("appends multiple rows without corrupting record keys", async () => {
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
      { key: (item) => item.id, deferEventPromotion: false },
    );

    items.set([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
      { id: 3, label: "C" },
      { id: 4, label: "D" },
    ]);
    await flushEffects();
    expect(parent.innerHTML).toBe("<tr>A</tr><tr>B</tr><tr>C</tr><tr>D</tr><!--rows-->");

    items.set([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
      { id: 4, label: "D" },
    ]);
    await flushEffects();
    expect(parent.innerHTML).toBe("<tr>A</tr><tr>B</tr><tr>D</tr><!--rows-->");

    dispose();
  });

  test("does not retain detached appended records when append rendering throws", async () => {
    const items = cell([{ id: 1, label: "A" }]);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    parent.append(marker);
    let throwOnId: number | undefined;

    const dispose = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        if (item.id === throwOnId) {
          throw new Error("render failed");
        }

        const tr = document.createElement("tr");
        tr.textContent = item.label;
        return tr;
      },
      { key: (item) => item.id, deferEventPromotion: false },
    );

    throwOnId = 3;
    items.set([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
      { id: 3, label: "C" },
    ]);
    await expect(flushEffects()).rejects.toThrow("render failed");
    expect(parent.innerHTML).toBe("<tr>A</tr><!--rows-->");

    throwOnId = undefined;
    items.set([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<tr>A</tr><tr>B</tr><!--rows-->");

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

  test("activates preserved selected class records on the first selected value change", async () => {
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
          preserveInitial: true,
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

  test("appends keyed single-node rows with one fragment insertion and no existing row moves", async () => {
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
      { key: (item) => item.id },
    );

    const firstRow = parent.children[0];
    const secondRow = parent.children[1];
    const appendedNodes: Node[] = [];
    const insertedNodes: Node[] = [];
    let replacements = 0;
    let removals = 0;
    const appendChild = parent.appendChild.bind(parent);
    const insertBefore = parent.insertBefore.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);

    parent.appendChild = ((node) => {
      appendedNodes.push(node);
      return appendChild(node);
    }) as typeof parent.appendChild;
    parent.insertBefore = ((node, child) => {
      insertedNodes.push(node);
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    parent.replaceChildren = ((...nodes) => {
      replacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;
    parent.removeChild = ((node) => {
      removals += 1;
      return removeChild(node);
    }) as typeof parent.removeChild;

    items.set([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
      { id: 3, label: "C" },
      { id: 4, label: "D" },
    ]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<tr>A</tr><tr>B</tr><tr>C</tr><tr>D</tr><!--rows-->");
    expect(parent.children[0]).toBe(firstRow);
    expect(parent.children[1]).toBe(secondRow);
    expect(appendedNodes).toEqual([]);
    expect(insertedNodes.some((node) => node instanceof DocumentFragment)).toBe(true);
    expect(replacements).toBe(0);
    expect(removals).toBe(0);

    dispose();
  });

  test("has dedicated append and remove fast paths for keyed single-node rows", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("function tryAppendSingleNodeRecords");
    expect(source).toContain("function tryRemoveSingleNodeRecords");
    expect(source).not.toContain("const staleKeys");
  });

  test("checks simple swaps before building the generic keyed item set", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("function trySwapSingleNodeItems");
    expect(source.indexOf("trySwapSingleNodeItems(")).toBeLessThan(
      source.indexOf("const keyedItems = uniqueSingleNodeKeyedItems("),
    );
  });

  test("detects single-node row swaps without a second full key scan", async () => {
    const initialRows = Array.from({ length: 1_000 }, (_, index) => ({
      id: index + 1,
      label: String(index + 1),
    }));
    const items = cell(initialRows);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    parent.append(marker);
    let keyCalls = 0;

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
        key: (item) => {
          keyCalls += 1;
          return item.id;
        },
      },
    );

    keyCalls = 0;
    const nextRows = initialRows.slice();
    const secondRow = nextRows[1] as (typeof initialRows)[number];
    const nineHundredNinetyNinthRow = nextRows[998] as (typeof initialRows)[number];

    nextRows[1] = nineHundredNinetyNinthRow;
    nextRows[998] = secondRow;
    items.set(nextRows);
    await flushEffects();

    expect(keyCalls).toBeLessThanOrEqual(initialRows.length + 1);
    expect(parent.children[1]?.textContent).toBe("999");
    expect(parent.children[998]?.textContent).toBe("2");

    dispose();
  });

  test("keeps same-order single-node rows without a second full key scan", async () => {
    const initialRows = Array.from({ length: 1_000 }, (_, index) => ({
      id: index + 1,
      label: String(index + 1),
    }));
    const items = cell(initialRows);
    const parent = document.createElement("tbody");
    const marker = document.createComment("rows");
    parent.append(marker);
    let keyCalls = 0;

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
        key: (item) => {
          keyCalls += 1;
          return item.id;
        },
      },
    );

    keyCalls = 0;
    items.set(initialRows.slice());
    await flushEffects();

    expect(keyCalls).toBeLessThanOrEqual(initialRows.length + 1);
    expect(parent.children[1]?.textContent).toBe("2");
    expect(parent.children[998]?.textContent).toBe("999");

    dispose();
  });

  test("has dedicated bulk replacement and selected-class clear helpers", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("function createSingleNodeRecordsWithFragment");
    expect(source).toContain("function clearSelectedClassRecords");
  });

  test("skips retained-row refresh when selected classes preserve initial state", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("function shouldRefreshSelectedClassRecords");
    expect(source).toContain("const refreshSelectedClasses");
  });

  test("lazily builds selected-class maps while preserving initial class state", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("function activateSelectedClassRecords");
    expect(source).toContain("activeRecords: !preserveInitial");
    expect(source).toContain("if (!state.activeRecords)");
  });

  test("skips delegated release batching and promotion walks when event promotion is disabled", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("disposeRecords(records.values(), deferEventPromotion)");
    expect(source).toContain("removeRecordNodes(records.values(), deferEventPromotion)");
    expect(source).toContain("if (batchDelegatedRootReleases)");
    expect(source).toContain("if (deferEventPromotion)");
    expect(source).toContain("const appendedRecords: SingleNodeRecord[] = []");
    expect(source).toContain("disposeRecordValues(appendedRecords, deferEventPromotion)");
    expect(source).toContain("function removeChangedSingleNodeRecords");
    expect(source).toContain("staleRecord: SingleNodeRecord");
  });

  test("uses a local scope dispose fast path for single-node records", async () => {
    const source = await readFile(
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts",
      "utf8",
    );

    expect(source).toContain("function disposeSingleNodeRecordScope");
    expect(source).toContain("disposers.length === 1");
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
