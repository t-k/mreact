// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindList, bindText } from "../src/index.js";
import { registerDispose } from "../src/scope.js";

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
});
