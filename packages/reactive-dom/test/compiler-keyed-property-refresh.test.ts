// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindCompilerKeyedPropertyText, bindCompilerKeyedSingleNodeList } from "../src/internal.js";

describe("compiler keyed property refresh", () => {
  test("refreshes selected classes only when DOM differs and repairs external changes", async () => {
    const items = cell([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ]);
    const selected = cell<unknown>(-1);
    const parent = document.createElement("div");
    const marker = document.createComment("rows");
    parent.append(marker);
    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (context) => {
        const row = document.createElement("span");
        row.className = "";
        const text = document.createTextNode("");
        bindCompilerKeyedPropertyText(context, text, "label");
        row.append(text);
        return row;
      },
      {
        key: (item) => item.id,
        compilerOwnsTextCleanup: true,
        compilerSelectedClass: { source: selected, className: "danger", initialClassValue: "" },
      },
    );
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(parent, { subtree: true, attributes: true, attributeFilter: ["class"] });
    const take = () => {
      mutations.push(...observer.takeRecords());
      return mutations.splice(0);
    };
    try {
      items.set([
        { id: 1, label: "A!" },
        { id: 2, label: "B!" },
      ]);
      await flushEffects();
      expect(take()).toHaveLength(0);
      selected.set(1);
      await flushEffects();
      expect(take().map((record) => record.target)).toEqual([parent.children[0]]);
      expect(parent.children[0]!.getAttribute("class")).toBe("danger");
      selected.set(2);
      await flushEffects();
      expect(take().map((record) => record.target)).toEqual([
        parent.children[0],
        parent.children[1],
      ]);
      expect(parent.children[0]!.getAttribute("class")).toBe("");
      expect(parent.children[1]!.getAttribute("class")).toBe("danger");
      parent.children[0]!.setAttribute("class", "external");
      parent.children[1]!.removeAttribute("class");
      take();
      items.set([...items.get()]);
      await flushEffects();
      expect(take()).toHaveLength(2);
      expect(parent.children[0]!.getAttribute("class")).toBe("");
      expect(parent.children[1]!.getAttribute("class")).toBe("danger");
    } finally {
      observer.disconnect();
      dispose();
    }
  });

  test("preserves row identity across same-order, adjacent, tail and fallback updates", async () => {
    const items = cell([1, 2, 3, 4].map((id) => ({ id, label: String(id) })));
    const parent = document.createElement("div");
    const marker = document.createComment("rows");
    parent.append(marker);
    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (context) => {
        const row = document.createElement("span");
        row.dataset.id = String(context.item.id);
        const text = document.createTextNode("");
        bindCompilerKeyedPropertyText(context, text, "label");
        row.append(text);
        return row;
      },
      { key: (item) => item.id, compilerOwnsTextCleanup: true },
    );
    try {
      const original = new Map(
        Array.from(parent.children, (node) => [Number((node as HTMLElement).dataset.id), node]),
      );
      for (const ids of [
        [1, 2, 3, 4],
        [2, 1, 3, 4],
        [2, 1, 4, 3],
        [2, 1, 4, 3],
        [1, 4, 2, 3],
        [1, 4, 2, 5],
      ]) {
        items.set(ids.map((id) => ({ id, label: `${id}!` })));
        await flushEffects();
        expect(Array.from(parent.children, (node) => node.textContent)).toEqual(
          ids.map((id) => `${id}!`),
        );
        for (let index = 0; index < ids.length; index += 1) {
          const existing = original.get(ids[index]!);
          if (existing !== undefined) expect(parent.children[index]).toBe(existing);
        }
      }
    } finally {
      dispose();
    }
  });

  test.each([false, true])(
    "writes only changed text with multiple bindings=%s",
    async (multiple) => {
      const items = cell([
        { id: 1, label: "A" },
        { id: 2, label: "B" },
      ]);
      const parent = document.createElement("div");
      const marker = document.createComment("rows");
      parent.append(marker);
      const dispose = bindCompilerKeyedSingleNodeList(
        parent,
        marker,
        () => items.get(),
        (context) => {
          const row = document.createElement("span");
          if (multiple) {
            const id = document.createTextNode("");
            bindCompilerKeyedPropertyText(context, id, "id");
            row.append(id);
          }
          const label = document.createTextNode("");
          bindCompilerKeyedPropertyText(context, label, "label");
          row.append(label);
          return row;
        },
        { key: (item) => item.id, compilerOwnsTextCleanup: true },
      );
      const mutations: MutationRecord[] = [];
      const observer = new MutationObserver((records) => mutations.push(...records));
      observer.observe(parent, { subtree: true, characterData: true });
      try {
        const rows = Array.from(parent.children);
        items.set([
          { id: 1, label: "A" },
          { id: 2, label: "B!" },
        ]);
        await flushEffects();
        mutations.push(...observer.takeRecords());
        expect(Array.from(parent.children)).toEqual(rows);
        expect(mutations.map((record) => record.target.textContent)).toEqual(["B!"]);
      } finally {
        observer.disconnect();
        dispose();
      }
    },
  );

  test("reevaluates equal getters, promotes tracking, repairs DOM and disposes tracking", async () => {
    const external = cell("A");
    let reads = 0;
    const items = cell<{ id: number; label: string }[]>([
      { id: 1, label: "A" },
      { id: 2, label: "B" },
    ]);
    const parent = document.createElement("div");
    const marker = document.createComment("rows");
    parent.append(marker);
    const dispose = bindCompilerKeyedSingleNodeList(
      parent,
      marker,
      () => items.get(),
      (context) => {
        const text = document.createTextNode("");
        bindCompilerKeyedPropertyText(context, text, "label");
        return text;
      },
      { key: (item) => item.id, compilerOwnsTextCleanup: true },
    );
    try {
      items.set([
        {
          id: 1,
          get label() {
            reads += 1;
            return "A";
          },
        },
        { id: 2, label: "B" },
      ]);
      await flushEffects();
      expect(reads).toBe(1);
      items.set([
        {
          id: 1,
          get label() {
            reads += 1;
            return external.get();
          },
        },
        { id: 2, label: "B" },
      ]);
      await flushEffects();
      expect(reads).toBe(2);
      external.set("C");
      await flushEffects();
      expect(parent.textContent).toBe("CB");
      expect(reads).toBe(3);
      const text = parent.childNodes[1] as Text;
      text.data = "external mutation";
      items.set([items.get()[0]!, { id: 2, label: "B" }]);
      await flushEffects();
      expect(text.data).toBe("B");
      items.set([]);
      await flushEffects();
      const readsAtClear = reads;
      external.set("D");
      await flushEffects();
      expect(reads).toBe(readsAtClear);
      expect(parent.textContent).toBe("");
    } finally {
      dispose();
    }
  });
});
