// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindList, bindText } from "../src/index.js";
import { registerDispose } from "../src/scope.js";

describe("bindList", () => {
  test("promotes delegated row events after mount without detached fallback listeners", () => {
    const items = cell([1, 2]);
    const parent = document.createElement("div");
    const marker = document.createComment("list");
    const calls: number[] = [];
    let buttonClickFallbacks = 0;
    parent.append(marker);
    document.body.append(parent);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const button = document.createElement("button");
        const addEventListener = button.addEventListener.bind(button);
        button.addEventListener = ((type, listener, options) => {
          if (type === "click") {
            buttonClickFallbacks += 1;
          }
          addEventListener(type, listener, options);
        }) as typeof button.addEventListener;
        bindEvent(button, "click", () => {
          calls.push(item);
        });
        button.textContent = String(item);
        return button;
      },
      { itemMode: "static", key: (item) => item },
    );

    expect(buttonClickFallbacks).toBe(0);

    (parent.firstElementChild as HTMLButtonElement).click();
    expect(calls).toEqual([1]);

    dispose();
    parent.remove();
  });

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

  test("builds keyed item key arrays without Array.from allocation", async () => {
    const source = await readFile(
      join(process.cwd(), "packages/reactive-dom/src/bind-list.ts"),
      "utf8",
    );

    expect(source).toContain("new Array<unknown>(length)");
    expect(source).not.toContain("Array.from({ length })");
  });

  test("updates keyed row index-dependent bindings after reorder", async () => {
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
      (item, index) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        li.append(text);
        bindText(text, () => `${Number(index)}:${item.label}`);
        return li;
      },
      { key: (item) => item.id },
    );

    items.set([
      { id: "b", label: "B" },
      { id: "a", label: "A" },
    ]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>0:B</li><li>1:A</li><!--list-->");

    dispose();
  });

  test("updates keyed row event closures with current index and items after reorder", async () => {
    const items = cell([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    const clicks: string[] = [];
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item, index, rows) => {
        const button = document.createElement("button");
        button.textContent = item.label;
        button.addEventListener("click", () => {
          clicks.push(`${Number(index)}:${Array.from(rows, (row) => row.id).join(",")}`);
        });
        return button;
      },
      { key: (item) => item.id },
    );

    items.set([
      { id: "b", label: "B" },
      { id: "a", label: "A" },
    ]);
    await flushEffects();

    parent.querySelector("button")?.click();

    expect(clicks).toEqual(["0:b,a"]);

    dispose();
  });

  test("updates stable-key primitive rows", async () => {
    const items = cell(["Ada"]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        li.append(text);
        bindText(text, () => String(item));
        return li;
      },
      { key: () => "same" },
    );

    items.set(["Grace"]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>Grace</li><!--list-->");

    dispose();
  });

  test("updates stable-key primitive number and boolean rows", async () => {
    const items = cell<Array<number | boolean>>([1, false]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        li.append(text);
        bindText(text, () => String(item));
        return li;
      },
      { key: (_item, index) => index },
    );

    items.set([2, true]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>2</li><li>true</li><!--list-->");

    dispose();
  });

  test("ignores duplicate keyed rows without leaking orphan records", async () => {
    const items = cell([
      { id: "a", label: "A1" },
      { id: "a", label: "A2" },
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

    expect(parent.innerHTML).toBe("<li>A1</li><!--list-->");

    items.set([{ id: "b", label: "B" }]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>B</li><!--list-->");
    expect(parent.querySelectorAll("li")).toHaveLength(1);

    dispose();
  });

  test("removes stale keyed row nodes even when their disposer throws", async () => {
    const items = cell([{ id: "a", label: "A" }]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        registerDispose(() => {
          if (item.id === "a") {
            throw new Error("dispose a");
          }
        });
        const li = document.createElement("li");
        li.textContent = item.label;
        return li;
      },
      { key: (item) => item.id },
    );

    items.set([{ id: "b", label: "B" }]);
    await expect(flushEffects()).rejects.toThrow("dispose a");

    expect(parent.innerHTML).toBe("<li>B</li><!--list-->");

    dispose();
  });

  test("keeps numeric and string keys as distinct keyed rows", async () => {
    const items = cell([
      { id: 1 as number | string, label: "number" },
      { id: "1" as number | string, label: "string" },
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

    const numberRow = parent.childNodes[0];
    const stringRow = parent.childNodes[1];

    items.set([
      { id: "1", label: "string" },
      { id: 1, label: "number" },
    ]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<li>string</li><li>number</li><!--list-->");
    expect(parent.childNodes[0]).toBe(stringRow);
    expect(parent.childNodes[1]).toBe(numberRow);

    dispose();
  });

  test("renders initial keyed rows with one fragment-backed whole-parent replacement", () => {
    const values = Array.from({ length: 1000 }, (_, index) => index);
    const items = cell(values);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);
    let parentInsertions = 0;
    let parentReplacements = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    let replacementArgumentCount = 0;
    let firstReplacementNode: Node | undefined;
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      replacementArgumentCount = nodes.length;
      firstReplacementNode = nodes[0];
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;

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

    expect(parentInsertions).toBe(0);
    expect(parentReplacements).toBe(1);
    expect(replacementArgumentCount).toBe(2);
    expect(firstReplacementNode).toBeInstanceOf(DocumentFragment);
    expect(parent.childNodes[0]?.textContent).toBe("0");
    expect(parent.childNodes[1000]).toBe(marker);

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

  test("moves only changed keyed records when the list does not own the whole parent", async () => {
    const values = [0, 1, 2, 3, 4];
    const items = cell(values);
    const parent = document.createElement("section");
    const prefix = document.createElement("h1");
    prefix.textContent = "Rows";
    const marker = document.createComment("list");
    parent.append(prefix, marker);

    const dispose = bindList(
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

    const originalNodes = Array.from(parent.childNodes);
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

    items.set([0, 1, 3, 2, 4]);
    await flushEffects();

    expect(parentInsertions).toBe(1);
    expect(parentReplacements).toBe(0);
    expect(parent.childNodes[0]).toBe(prefix);
    expect(parent.childNodes[1]).toBe(originalNodes[1]);
    expect(parent.childNodes[2]).toBe(originalNodes[2]);
    expect(parent.childNodes[3]).toBe(originalNodes[4]);
    expect(parent.childNodes[4]).toBe(originalNodes[3]);
    expect(parent.childNodes[5]).toBe(originalNodes[5]);
    expect(parent.childNodes[6]).toBe(marker);
    expect(parent.innerHTML).toBe("<h1>Rows</h1><p>0</p><p>1</p><p>3</p><p>2</p><p>4</p><!--list-->");

    dispose();
  });

  test("keyed reorder computes previous positions without an extra Map allocation", async () => {
    const values = [0, 1, 2, 3, 4];
    const items = cell(values);
    const parent = document.createElement("section");
    parent.append(document.createElement("h1"));
    const marker = document.createComment("list");
    parent.append(marker);
    const dispose = bindList(
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
    const OriginalMap = globalThis.Map;
    let mapCreations = 0;

    try {
      globalThis.Map = class CountingMap<K, V> extends OriginalMap<K, V> {
        constructor(entries?: Iterable<readonly [K, V]> | null) {
          mapCreations += 1;
          super(entries);
        }
      } as MapConstructor;

      items.set([0, 1, 3, 2, 4]);
      await flushEffects();
    } finally {
      globalThis.Map = OriginalMap;
    }

    expect(parent.innerHTML).toBe("<h1></h1><p>0</p><p>1</p><p>3</p><p>2</p><p>4</p><!--list-->");
    expect(mapCreations).toBe(1);
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

  test("keeps keyed input focus and value across unrelated parent updates", async () => {
    const tick = cell(0);
    const items = cell([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);
    document.body.append(parent);

    const dispose = bindList(
      parent,
      marker,
      () => {
        tick.get();
        return items.get();
      },
      (item) => {
        const li = document.createElement("li");
        const input = document.createElement("input");
        input.defaultValue = item.label;
        li.append(input);
        return li;
      },
      { key: (item) => item.id },
    );
    const focusedInput = parent.querySelector<HTMLInputElement>("li:nth-child(2) input");

    expect(focusedInput).toBeInstanceOf(HTMLInputElement);
    focusedInput?.focus();
    if (focusedInput !== null) {
      focusedInput.value = "typed";
    }

    tick.set(1);
    await flushEffects();

    const retainedInput = parent.querySelector<HTMLInputElement>("li:nth-child(2) input");
    expect(retainedInput).toBe(focusedInput);
    expect(retainedInput?.isSameNode(focusedInput)).toBe(true);
    expect(document.activeElement).toBe(focusedInput);
    expect(retainedInput?.value).toBe("typed");
    expect(parent.innerHTML).toBe(
      '<li><input value="A"></li><li><input value="B"></li><!--list-->',
    );

    dispose();
    parent.remove();
  });

  test("preserves inner keyed list nodes when only outer keyed rows reorder", async () => {
    const groups = cell([
      {
        id: "a",
        items: [
          { id: "a1", label: "A1" },
          { id: "a2", label: "A2" },
        ],
      },
      {
        id: "b",
        items: [
          { id: "b1", label: "B1" },
          { id: "b2", label: "B2" },
        ],
      },
    ]);
    const parent = document.createElement("section");
    const marker = document.createComment("groups");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => groups.get(),
      (group) => {
        const article = document.createElement("article");
        const heading = document.createElement("h2");
        const list = document.createElement("ul");
        const listMarker = document.createComment("items");
        heading.textContent = group.id;
        list.append(listMarker);
        article.append(heading, list);
        bindList(
          list,
          listMarker,
          () => group.items,
          (item) => {
            const li = document.createElement("li");
            li.textContent = item.label;
            return li;
          },
          { key: (item) => item.id },
        );
        return article;
      },
      { key: (group) => group.id },
    );

    const groupA = parent.querySelector("article:nth-of-type(1)");
    const groupB = parent.querySelector("article:nth-of-type(2)");
    const innerA1 = groupA?.querySelector("li:nth-child(1)");
    const innerB1 = groupB?.querySelector("li:nth-child(1)");

    groups.set([groups.get()[1]!, groups.get()[0]!]);
    await flushEffects();

    expect(parent.querySelector("article:nth-of-type(1)")).toBe(groupB);
    expect(parent.querySelector("article:nth-of-type(2)")).toBe(groupA);
    expect(groupA?.querySelector("li:nth-child(1)")).toBe(innerA1);
    expect(groupB?.querySelector("li:nth-child(1)")).toBe(innerB1);
    expect(parent.textContent).toBe("bB1B2aA1A2");

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

  test("does not crash keyed File object rows after file input style updates", async () => {
    const first = new File(["alpha"], "upload.txt", { lastModified: 1 });
    const second = new File(["beta"], "upload.txt", { lastModified: 1 });
    const items = cell<readonly File[]>([first]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (file) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        li.append(text);
        bindText(text, () => file.name);
        return li;
      },
      { key: (file) => `${file.name}-${file.lastModified}` },
    );

    items.set([second]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("upload.txt");

    dispose();
  });

  test("does not crash if a keyed object record is later updated with a primitive", async () => {
    const items = cell<readonly unknown[]>([{ id: "same", label: "A" }]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        li.append(text);
        bindText(text, () => String((item as { label?: string }).label ?? ""));
        return li;
      },
      { key: () => "same" },
    );

    items.set(["primitive"]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("");

    dispose();
  });

  test("keeps keyed object item proxies stable across unrelated cell updates", async () => {
    const items = cell([{ id: "book", label: "Book" }]);
    const selectedId = cell("");
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const anchor = document.createElement("a");
        const selected = document.createTextNode("");
        anchor.href = `/?item=${encodeURIComponent(item.id)}`;
        anchor.textContent = item.label;
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          selectedId.set(item.id);
        });
        li.append(anchor, selected);
        bindText(selected, () => (selectedId.get() === item.id ? " selected" : ""));
        return li;
      },
      { key: (item) => item.id },
    );

    (parent.querySelector("a") as HTMLAnchorElement).click();

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("Book selected");

    dispose();
  });

  test("keeps static keyed row snapshots while preserving append remove and reverse identity", async () => {
    const items = cell([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ]);
    const selectedId = cell("");
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const label = document.createTextNode("");
        const selected = document.createTextNode("");
        bindText(label, () => item.label);
        bindText(selected, () => (selectedId.get() === item.id ? " selected" : ""));
        li.append(label, selected);
        return li;
      },
      { itemMode: "static", key: (item) => item.id },
    );

    const nodeA = parent.childNodes[0];
    const nodeB = parent.childNodes[1];
    const nodeC = parent.childNodes[2];

    items.set([
      { id: "a", label: "A updated" },
      { id: "b", label: "B updated" },
      { id: "c", label: "C updated" },
      { id: "d", label: "D" },
    ]);
    selectedId.set("b");
    await flushEffects();

    expect(parent.textContent).toBe("AB selectedCD");
    expect(parent.childNodes[0]).toBe(nodeA);
    expect(parent.childNodes[1]).toBe(nodeB);
    expect(parent.childNodes[2]).toBe(nodeC);
    const nodeD = parent.childNodes[3];

    items.set([
      { id: "d", label: "D updated" },
      { id: "b", label: "B latest" },
    ]);
    selectedId.set("d");
    await flushEffects();

    expect(parent.textContent).toBe("D selectedB");
    expect(parent.childNodes[0]).toBe(nodeD);
    expect(parent.childNodes[1]).toBe(nodeB);

    items.set([]);
    await flushEffects();

    expect(parent.innerHTML).toBe("<!--list-->");

    dispose();
  });

  test("keeps reactive keyed rows updating object field reads by default", async () => {
    const items = cell([{ id: "a", label: "A" }]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        const text = document.createTextNode("");
        bindText(text, () => item.label);
        li.append(text);
        return li;
      },
      { key: (item) => item.id },
    );

    items.set([{ id: "a", label: "A updated" }]);
    await flushEffects();

    expect(parent.textContent).toBe("A updated");

    dispose();
  });

  test("keeps nested object properties readable in keyed rows after async list population", async () => {
    const members = cell<
      readonly {
        readonly user: {
          readonly id: string;
          readonly displayName: string;
          readonly email: string;
        };
        readonly role: "owner" | "editor" | "viewer";
      }[]
    >([]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => members.get(),
      (member) => {
        const li = document.createElement("li");
        const name = document.createTextNode("");
        const email = document.createTextNode("");
        li.append(name, " ", email);
        bindText(name, () => member.user.displayName);
        bindText(email, () => member.user.email);
        return li;
      },
      { key: (member) => member.user.id, nestedObjectFallback: true },
    );

    members.set([
      {
        user: {
          id: "u1",
          displayName: "Ada Lovelace",
          email: "ada@example.test",
        },
        role: "owner",
      },
    ]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("Ada Lovelace ada@example.test");

    members.set([
      {
        user: {
          id: "u1",
          displayName: "Ada Byron",
          email: "ada.byron@example.test",
        },
        role: "owner",
      },
    ]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("Ada Byron ada.byron@example.test");

    dispose();
  });

  test("does not throw if a reused keyed row temporarily loses a nested object", async () => {
    const members = cell<readonly unknown[]>([
      {
        user: {
          id: "u1",
          displayName: "Ada Lovelace",
        },
      },
    ]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => members.get(),
      (member) => {
        const li = document.createElement("li");
        const name = document.createTextNode("");
        li.append(name);
        bindText(
          name,
          () => ((member as { user: { displayName: string } }).user.displayName),
        );
        return li;
      },
      { key: () => "u1", nestedObjectFallback: true },
    );

    members.set([{ role: "owner" }]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("");

    members.set([
      {
        user: {
          id: "u1",
          displayName: "Ada Byron",
        },
      },
    ]);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("Ada Byron");

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
    let parentAppends = 0;
    const appendedNodes: Node[] = [];
    let parentReplacements = 0;
    let parentRemovals = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    const appendChild = parent.appendChild.bind(parent);
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;
    parent.appendChild = ((node) => {
      parentAppends += 1;
      appendedNodes.push(node);
      return appendChild(node);
    }) as typeof parent.appendChild;
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

    // Tail appends use one fragment append plus one marker re-append;
    // existing rows must never be rebuilt, replaced, or removed.
    expect(parentInsertions).toBe(0);
    expect(parentAppends).toBeGreaterThan(0);
    expect(appendedNodes.some((node) => node instanceof DocumentFragment)).toBe(true);
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

  test("batches delegated root release lookups when clearing keyed rows", async () => {
    const values = Array.from({ length: 10 }, (_, index) => index);
    const items = cell(values);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);
    document.body.append(parent);
    const mapGet = Map.prototype.get;
    let clickRootLookups = 0;

    Map.prototype.get = function countedGet<K, V>(this: Map<K, V>, key: K): V | undefined {
      if (key === "click") {
        clickRootLookups += 1;
      }
      return mapGet.call(this, key);
    };

    try {
      const dispose = bindList(
        parent,
        marker,
        () => items.get(),
        (item) => {
          const button = document.createElement("button");
          button.textContent = String(item);
          bindEvent(button, "click", () => {});
          return button;
        },
        { itemMode: "static", key: (item) => item },
      );

      clickRootLookups = 0;
      items.set([]);
      await flushEffects();

      expect(clickRootLookups).toBeLessThan(values.length);

      dispose();
    } finally {
      Map.prototype.get = mapGet;
      parent.remove();
    }
  });

  test("appends keyed list items without building an extra appended-key set", async () => {
    const items = cell([0, 1, 2]);
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

    const OriginalSet = globalThis.Set;
    let setCreations = 0;

    try {
      globalThis.Set = class CountingSet<T> extends OriginalSet<T> {
        constructor(values?: Iterable<T> | null) {
          super(values ?? undefined);
          setCreations += 1;
        }
      } as SetConstructor;

      items.set([0, 1, 2, 3, 4]);
      await flushEffects();
    } finally {
      globalThis.Set = OriginalSet;
    }

    expect(setCreations).toBe(3);
    expect(parent.innerHTML).toBe("<li>0</li><li>1</li><li>2</li><li>3</li><li>4</li><!--list-->");
    dispose();
  });

  test("swaps keyed list items with targeted moves instead of replacing the owned parent", async () => {
    const items = cell([0, 1, 2, 3, 4]);
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

    const originalNodes = Array.from(parent.childNodes).slice(0, 5);
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

    items.set([0, 3, 2, 1, 4]);
    await flushEffects();

    expect(parentReplacements).toBe(0);
    expect(parentInsertions).toBe(2);
    expect(Array.from(parent.childNodes).slice(0, 5)).toEqual([
      originalNodes[0],
      originalNodes[3],
      originalNodes[2],
      originalNodes[1],
      originalNodes[4],
    ]);
    expect(parent.innerHTML).toBe("<li>0</li><li>3</li><li>2</li><li>1</li><li>4</li><!--list-->");

    dispose();
  });

  test("reorders swapped keyed records without allocating a full LIS array", async () => {
    const values = [0, 1, 2, 3, 4, 5];
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
      { itemMode: "static", key: (item) => item },
    );

    const originalNodes = Array.from(parent.childNodes).slice(0, values.length);
    const arrayFrom = Array.from;
    const arrayPush = Array.prototype.push;
    let lisArrayAllocations = 0;
    let orderedNodePushes = 0;
    let orderedRecordPushes = 0;

    Array.from = function countedArrayFrom<T>(
      source: ArrayLike<T> | Iterable<T>,
      mapFn?: (value: T, index: number) => T,
      thisArg?: unknown,
    ): T[] {
      if (
        typeof source === "object" &&
        source !== null &&
        "length" in source &&
        source.length === values.length &&
        mapFn !== undefined
      ) {
        lisArrayAllocations += 1;
      }

      return arrayFrom.call(Array, source, mapFn as never, thisArg) as T[];
    } as typeof Array.from;
    Array.prototype.push = function countedArrayPush<T>(
      this: T[],
      ...valuesToPush: T[]
    ): number {
      if (valuesToPush.every((value) => value instanceof Node)) {
        orderedNodePushes += valuesToPush.length;
      } else if (
        valuesToPush.every(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            "nodes" in value &&
            "currentItem" in value,
        )
      ) {
        orderedRecordPushes += valuesToPush.length;
      }

      return arrayPush.apply(this, valuesToPush);
    };

    try {
      items.set([0, 4, 2, 3, 1, 5]);
      await flushEffects();
    } finally {
      Array.from = arrayFrom;
      Array.prototype.push = arrayPush;
    }

    expect(lisArrayAllocations).toBe(0);
    expect(orderedNodePushes).toBe(0);
    expect(orderedRecordPushes).toBe(0);
    expect(parent.innerHTML).toBe(
      "<li>0</li><li>4</li><li>2</li><li>3</li><li>1</li><li>5</li><!--list-->",
    );
    expect(parent.childNodes[1]).toBe(originalNodes[4]);
    expect(parent.childNodes[4]).toBe(originalNodes[1]);

    dispose();
  });

  test("updates reactive keyed records while using the swapped-record fast path", async () => {
    const items = cell([
      { id: 0, label: "0" },
      { id: 1, label: "1" },
      { id: 2, label: "2" },
      { id: 3, label: "3" },
      { id: 4, label: "4" },
      { id: 5, label: "5" },
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
        bindText(li.appendChild(document.createTextNode("")), () => item.label);
        return li;
      },
      { key: (item) => item.id },
    );

    let parentInsertions = 0;
    const insertBefore = parent.insertBefore.bind(parent);
    parent.insertBefore = ((node, child) => {
      parentInsertions += 1;
      return insertBefore(node, child);
    }) as typeof parent.insertBefore;

    items.set([
      { id: 0, label: "zero" },
      { id: 4, label: "four" },
      { id: 2, label: "two" },
      { id: 3, label: "three" },
      { id: 1, label: "one" },
      { id: 5, label: "five" },
    ]);
    await flushEffects();

    expect(parentInsertions).toBe(2);
    expect(parent.innerHTML).toBe(
      "<li>zero</li><li>four</li><li>two</li><li>three</li><li>one</li><li>five</li><!--list-->",
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

  test("clears owned keyed list rows with one parent replacement", async () => {
    const items = cell([0, 1, 2]);
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

    let parentReplacements = 0;
    let explicitRecordRemovals = 0;
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;
    parent.removeChild = ((node) => {
      if (new Error().stack?.includes("removeRecordNodes")) {
        explicitRecordRemovals += 1;
      }
      return removeChild(node);
    }) as typeof parent.removeChild;

    items.set([]);
    await flushEffects();

    expect(parentReplacements).toBe(1);
    expect(explicitRecordRemovals).toBe(0);
    expect(parent.innerHTML).toBe("<!--list-->");

    dispose();
  });

  test("clears owned keyed list rows without building an empty keyed item set", async () => {
    const items = cell([0, 1, 2]);
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

    const OriginalSet = globalThis.Set;
    let setCreations = 0;

    try {
      globalThis.Set = class CountingSet<T> extends OriginalSet<T> {
        constructor(values?: Iterable<T> | null) {
          super(values ?? undefined);
          setCreations += 1;
        }
      } as SetConstructor;

      items.set([]);
      await flushEffects();
    } finally {
      globalThis.Set = OriginalSet;
      dispose();
    }

    expect(setCreations).toBe(0);
    expect(parent.innerHTML).toBe("<!--list-->");
  });

  test("replaces disjoint owned keyed rows without explicitly removing stale row nodes", async () => {
    const items = cell([0, 1, 2]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);
    let disposedRows = 0;

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        registerDispose(() => {
          disposedRows += 1;
        });
        const li = document.createElement("li");
        li.textContent = String(item);
        return li;
      },
      { key: (item) => item },
    );

    let parentReplacements = 0;
    let explicitRecordRemovals = 0;
    const replaceChildren = parent.replaceChildren.bind(parent);
    const removeChild = parent.removeChild.bind(parent);
    parent.replaceChildren = ((...nodes) => {
      parentReplacements += 1;
      return replaceChildren(...nodes);
    }) as typeof parent.replaceChildren;
    parent.removeChild = ((node) => {
      if (new Error().stack?.includes("removeRecordNodes")) {
        explicitRecordRemovals += 1;
      }
      return removeChild(node);
    }) as typeof parent.removeChild;

    items.set([10, 11, 12]);
    await flushEffects();

    expect(parentReplacements).toBe(1);
    expect(explicitRecordRemovals).toBe(0);
    expect(disposedRows).toBe(3);
    expect(parent.innerHTML).toBe("<li>10</li><li>11</li><li>12</li><!--list-->");

    dispose();
  });

  test("does not update newly created keyed records during owned replacement", async () => {
    const items = cell([{ id: 0 }, { id: 1 }, { id: 2 }]);
    const parent = document.createElement("ul");
    const marker = document.createComment("list");
    parent.append(marker);

    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        const li = document.createElement("li");
        li.textContent = String(item.id);
        return li;
      },
      { key: (item) => item.id },
    );

    const originalObjectIs = Object.is;
    let objectIsCalls = 0;

    try {
      Object.is = ((left, right) => {
        objectIsCalls += 1;
        return originalObjectIs(left, right);
      }) as typeof Object.is;

      items.set([{ id: 3 }, { id: 4 }, { id: 5 }]);
      await flushEffects();
    } finally {
      Object.is = originalObjectIs;
    }

    expect(objectIsCalls).toBe(2);
    expect(parent.innerHTML).toBe("<li>3</li><li>4</li><li>5</li><!--list-->");
    dispose();
  });

  test("replaces disjoint owned keyed rows without probing stale records", async () => {
    const initialRows = [
      { id: Symbol("a"), label: "0" },
      { id: Symbol("b"), label: "1" },
      { id: Symbol("c"), label: "2" },
    ];
    const replacementRows = [
      { id: Symbol("d"), label: "3" },
      { id: Symbol("e"), label: "4" },
      { id: Symbol("f"), label: "5" },
    ];
    const probedKeys = new Set<symbol>(replacementRows.map((row) => row.id));
    const items = cell(initialRows);
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

    const originalGet = Map.prototype.get;
    let mapGetCalls = 0;

    try {
      Map.prototype.get = function countedGet<K, V>(
        this: Map<K, V>,
        key: K,
      ): V | undefined {
        if (typeof key === "symbol" && probedKeys.has(key)) {
          mapGetCalls += 1;
        }
        return originalGet.call(this, key);
      };

      items.set(replacementRows);
      await flushEffects();
    } finally {
      Map.prototype.get = originalGet;
    }

    expect(mapGetCalls).toBe(0);
    expect(parent.innerHTML).toBe("<li>3</li><li>4</li><li>5</li><!--list-->");
    dispose();
  });

  test("replaces disjoint owned keyed rows without probing stale keys during disposal", async () => {
    const initialRows = [
      { id: Symbol("a"), label: "0" },
      { id: Symbol("b"), label: "1" },
      { id: Symbol("c"), label: "2" },
    ];
    const replacementRows = [
      { id: Symbol("d"), label: "3" },
      { id: Symbol("e"), label: "4" },
      { id: Symbol("f"), label: "5" },
    ];
    const staleKeys = new Set<symbol>(initialRows.map((row) => row.id));
    const items = cell(initialRows);
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

    const originalHas = Map.prototype.has;
    let staleKeyHasCalls = 0;

    try {
      Map.prototype.has = function countedHas<K, V>(this: Map<K, V>, key: K): boolean {
        if (typeof key === "symbol" && staleKeys.has(key)) {
          staleKeyHasCalls += 1;
        }
        return originalHas.call(this, key);
      };

      items.set(replacementRows);
      await flushEffects();
    } finally {
      Map.prototype.has = originalHas;
    }

    expect(staleKeyHasCalls).toBe(0);
    expect(parent.innerHTML).toBe("<li>3</li><li>4</li><li>5</li><!--list-->");
    dispose();
  });

  test("appends keyed rows without map-get probing the unchanged prefix", async () => {
    const initialRows = [
      { id: 0, label: "0" },
      { id: 1, label: "1" },
      { id: 2, label: "2" },
    ];
    const appendedRows = [
      ...initialRows,
      { id: 3, label: "3" },
      { id: 4, label: "4" },
    ];
    const prefixKeys = new Set(initialRows.map((row) => row.id));
    const items = cell(initialRows);
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

    const originalGet = Map.prototype.get;
    let prefixMapGetCalls = 0;

    try {
      Map.prototype.get = function countedGet<K, V>(
        this: Map<K, V>,
        key: K,
      ): V | undefined {
        if (typeof key === "number" && prefixKeys.has(key)) {
          prefixMapGetCalls += 1;
        }
        return originalGet.call(this, key);
      };

      items.set(appendedRows);
      await flushEffects();
    } finally {
      Map.prototype.get = originalGet;
    }

    expect(prefixMapGetCalls).toBe(0);
    expect(parent.innerHTML).toBe(
      "<li>0</li><li>1</li><li>2</li><li>3</li><li>4</li><!--list-->",
    );
    dispose();
  });
});
