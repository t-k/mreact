// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindDomRef, createList, insertDynamic, insertRenderValue } from "../src/index.js";
import { createMemo } from "../src/create-memo.js";
import { createListWithRenderArity } from "../src/create-list.js";
import { insertMemo } from "../src/insert-memo.js";
import { insertMemoDynamic } from "../src/insert-memo-dynamic.js";
import { bindText } from "../src/bind-text.js";
import { installCompatRenderValueNormalizer } from "../src/compat-normalize.js";
import { registerDispose } from "../src/scope.js";
import { LIST_RENDER_VALUE, type RenderValue } from "../src/types.js";

const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("react.transitional.element");

installCompatRenderValueNormalizer();

function jsx(type: unknown, props: Record<string, unknown>) {
  return {
    $$typeof: REACT_COMPAT_ELEMENT_TYPE,
    key: null,
    props,
    ref: null,
    type,
  };
}

const jsxs = jsx;

describe("insertDynamic", () => {
  test("updates rest-parameter list renderers when keyed indexes change", async () => {
    const rows = cell([{ id: "a" }, { id: "b" }]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () =>
      createList(
        () => rows.get(),
        (...args) => {
          const [row, index] = args;
          return `${row.id}:${index}`;
        },
        { key: (row) => row.id },
      ),
    );

    expect(parent.textContent).toBe("a:0b:1");
    rows.set([rows.get()[1] as { id: string }, rows.get()[0] as { id: string }]);
    await flushEffects();
    expect(parent.textContent).toBe("b:0a:1");

    dispose();
  });

  test("updates default-parameter list renderers when keyed indexes change", async () => {
    const rows = cell([{ id: "a" }, { id: "b" }]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () =>
      createList(
        () => rows.get(),
        (row, index = 0) => `${row.id}:${index}`,
        { key: (row) => row.id },
      ),
    );

    expect(parent.textContent).toBe("a:0b:1");
    rows.set([rows.get()[1] as { id: string }, rows.get()[0] as { id: string }]);
    await flushEffects();
    expect(parent.textContent).toBe("b:0a:1");

    dispose();
  });

  test("updates function renderers that read keyed indexes through arguments", async () => {
    const rows = cell([{ id: "a" }, { id: "b" }]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () =>
      createList(
        () => rows.get(),
        function (row) {
          return `${row.id}:${String(arguments[1])}`;
        },
        { key: (row) => row.id },
      ),
    );

    rows.set([rows.get()[1] as { id: string }, rows.get()[0] as { id: string }]);
    await flushEffects();
    expect(parent.textContent).toBe("b:0a:1");

    dispose();
  });

  test("refreshes public destructured renderers after same-key replacement", async () => {
    const rows = cell<readonly (readonly [string, string])[]>([["a", "Old"]]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () =>
      createList(
        () => rows.get(),
        ([id, label]) => `${id}:${label}`,
        { key: ([id]) => id },
      ),
    );

    rows.set([["a", "New"]]);
    await flushEffects();
    expect(parent.textContent).toBe("a:New");

    dispose();
  });

  test("ignores unrelated properties on hand-built public list values", async () => {
    const rows = cell([{ id: "a" }, { id: "b" }]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => ({
      [LIST_RENDER_VALUE]: true as const,
      a: 1,
      items: () => rows.get(),
      renderItem: (row: { id: string }, index: number) => `${row.id}:${String(index)}`,
      options: { key: (row: { id: string }) => row.id },
    }));

    rows.set([rows.get()[1] as { id: string }, rows.get()[0] as { id: string }]);
    await flushEffects();
    expect(parent.textContent).toBe("b:0a:1");

    dispose();
  });

  test.each([
    ["optional", (read: () => readonly { id: string }[]) => (_unused?: unknown) => read()],
    [
      "default",
      (read: () => readonly { id: string }[]) =>
        (_unused = undefined) =>
          read(),
    ],
    [
      "rest",
      (read: () => readonly { id: string }[]) =>
        (..._unused: unknown[]) =>
          read(),
    ],
  ])(
    "does not infer renderer dependencies from a public %s items accessor",
    async (_name, items) => {
      const rows = cell([{ id: "a" }, { id: "b" }]);
      const parent = document.createElement("div");
      const marker = document.createComment("marker");
      parent.append(marker);

      const dispose = insertDynamic(parent, marker, () =>
        createList(
          items(() => rows.get()),
          (row, index) => `${row.id}:${String(index)}`,
          {
            key: (row) => row.id,
          },
        ),
      );

      rows.set([rows.get()[1] as { id: string }, rows.get()[0] as { id: string }]);
      await flushEffects();
      expect(parent.textContent).toBe("b:0a:1");

      dispose();
    },
  );

  test("replaces only the dynamic range before the marker", async () => {
    const value = cell<RenderValue>("first");
    const parent = document.createElement("div");
    const before = document.createTextNode("before:");
    const marker = document.createComment("marker");
    const after = document.createTextNode(":after");

    parent.append(before, marker, after);
    const dispose = insertDynamic(parent, marker, () => value.get());

    expect(parent.textContent).toBe("before:first:after");

    const strong = document.createElement("strong");
    strong.textContent = "node";
    value.set([strong, 2]);
    await flushEffects();

    expect(parent.innerHTML).toBe("before:<strong>node</strong>2<!--marker-->:after");

    value.set(null);
    await flushEffects();

    expect(parent.textContent).toBe("before::after");

    dispose();
    value.set("ignored");
    await flushEffects();

    expect(parent.textContent).toBe("before::after");
  });

  test("reuses a text marker for primitive render values and clears it on disposal", async () => {
    const value = cell<RenderValue>("first");
    const parent = document.createElement("div");
    const marker = document.createTextNode("template placeholder");
    parent.append(marker);

    const dispose = insertRenderValue(parent, marker, () => value.get());

    expect(parent.innerHTML).toBe("first");
    expect(parent.firstChild).toBe(marker);

    const strong = document.createElement("strong");
    strong.textContent = "node";
    value.set(strong);
    await flushEffects();

    expect(parent.innerHTML).toBe("<strong>node</strong>");
    expect(parent.lastChild).toBe(marker);

    value.set(2);
    await flushEffects();

    expect(parent.innerHTML).toBe("2");
    expect(parent.firstChild).toBe(marker);

    dispose();

    expect(parent.innerHTML).toBe("");
  });

  test("does not remove and reinsert the same node instance", async () => {
    const node = document.createElement("strong");
    node.textContent = "stable";
    const value = cell({ node });
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => value.get().node);
    expect(parent.firstChild).toBe(node);

    value.set({ node });
    await flushEffects();

    expect(parent.firstChild).toBe(node);
    expect(parent.innerHTML).toBe("<strong>stable</strong><!--marker-->");

    dispose();
  });

  test("retains an equal memo render value and its cleanup scope", async () => {
    const props = cell({ signature: "stable", revision: 0 });
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertMemo(parent, marker, () =>
      createMemo(
        "Card",
        props.get(),
        (nextProps) => {
          events.push(`render:${nextProps.revision}`);
          registerDispose(() => events.push(`dispose:${nextProps.revision}`));
          const article = document.createElement("article");
          article.dataset.revision = String(nextProps.revision);
          return article;
        },
        (previous, next) => previous.signature === next.signature,
      ),
    );
    const article = parent.querySelector("article");

    props.set({ signature: "stable", revision: 1 });
    await flushEffects();

    expect(parent.querySelector("article")).toBe(article);
    expect(article?.dataset.revision).toBe("0");
    expect(events).toEqual(["render:0"]);

    dispose();
    expect(events).toEqual(["render:0", "dispose:0"]);
  });

  test("replaces an unequal memo render value and disposes each scope once", async () => {
    const props = cell({ signature: "a" });
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertMemo(parent, marker, () =>
      createMemo(
        "Card",
        props.get(),
        (nextProps) => {
          events.push(`render:${nextProps.signature}`);
          registerDispose(() => events.push(`dispose:${nextProps.signature}`));
          const article = document.createElement("article");
          article.textContent = nextProps.signature;
          return article;
        },
        (previous, next) => previous.signature === next.signature,
      ),
    );
    const firstArticle = parent.querySelector("article");

    props.set({ signature: "b" });
    await flushEffects();

    expect(parent.querySelector("article")).not.toBe(firstArticle);
    expect(parent.querySelector("article")?.textContent).toBe("b");
    expect(events).toEqual(["render:a", "dispose:a", "render:b"]);

    dispose();
    expect(events).toEqual(["render:a", "dispose:a", "render:b", "dispose:b"]);
  });

  test("retains a memo list render scope until replacement or disposal", async () => {
    const props = cell({ signature: "a", revision: 0 });
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertMemoDynamic(parent, marker, () =>
      createMemo(
        "List",
        props.get(),
        (nextProps) => {
          events.push(`render:${nextProps.revision}`);
          registerDispose(() => events.push(`dispose:${nextProps.revision}`));
          return createList(
            () => [`row:${nextProps.revision}`],
            (row) => document.createTextNode(row),
          );
        },
        (previous, next) => previous.signature === next.signature,
      ),
    );

    expect(parent.textContent).toBe("row:0");
    expect(events).toEqual(["render:0"]);

    props.set({ signature: "a", revision: 1 });
    await flushEffects();

    expect(parent.textContent).toBe("row:0");
    expect(events).toEqual(["render:0"]);

    props.set({ signature: "b", revision: 2 });
    await flushEffects();

    expect(parent.textContent).toBe("row:2");
    expect(events).toEqual(["render:0", "dispose:0", "render:2"]);

    dispose();
    expect(events).toEqual(["render:0", "dispose:0", "render:2", "dispose:2"]);
  });

  test("uses shallow prop equality when a memo comparator is omitted", async () => {
    const props = cell({ label: "stable" });
    let renders = 0;
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertMemo(parent, marker, () =>
      createMemo("Label", props.get(), (nextProps) => {
        renders += 1;
        const span = document.createElement("span");
        span.textContent = nextProps.label;
        return span;
      }),
    );
    const firstSpan = parent.querySelector("span");

    props.set({ label: "stable" });
    await flushEffects();
    expect(parent.querySelector("span")).toBe(firstSpan);
    expect(renders).toBe(1);

    props.set({ label: "changed" });
    await flushEffects();
    expect(parent.querySelector("span")).not.toBe(firstSpan);
    expect(parent.textContent).toBe("changed");
    expect(renders).toBe(2);

    dispose();
  });

  test("compares after a bailout against the last rendered props", async () => {
    const props = cell({ revision: 0 });
    const comparisons: Array<[number, number]> = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertMemo(parent, marker, () =>
      createMemo(
        "Revision",
        props.get(),
        (nextProps) => {
          const span = document.createElement("span");
          span.textContent = String(nextProps.revision);
          return span;
        },
        (previous, next) => {
          comparisons.push([previous.revision, next.revision]);
          return previous.revision + 1 === next.revision;
        },
      ),
    );
    const firstSpan = parent.querySelector("span");

    props.set({ revision: 1 });
    await flushEffects();
    expect(parent.querySelector("span")).toBe(firstSpan);

    props.set({ revision: 2 });
    await flushEffects();
    expect(comparisons).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(parent.querySelector("span")).not.toBe(firstSpan);
    expect(parent.textContent).toBe("2");

    dispose();
  });

  test("completes branch replacement after the previous cleanup throws", async () => {
    const value = cell("a");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);
    document.body.append(parent);
    const dispose = insertDynamic(parent, marker, () => {
      const section = document.createElement("section");
      section.textContent = value.get();
      bindDomRef(section, () => () => {
        if (section.textContent === "a") {
          throw new Error("cleanup failed");
        }
      });
      return section;
    });
    await Promise.resolve();

    value.set("b");

    await expect(flushEffects()).rejects.toThrow("cleanup failed");
    expect(parent.innerHTML).toBe("<section>b</section><!--marker-->");
    dispose();
    parent.remove();
  });

  test("keeps keyed list render value nodes across unrelated dynamic updates", async () => {
    const selected = cell(false);
    const items = cell([{ id: "a" }, { id: "b" }]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => {
      selected.get();
      return createList(
        () => items.get(),
        (item) => {
          const article = document.createElement("article");
          article.dataset.id = item.id;
          const image = document.createElement("img");
          image.alt = item.id;
          article.append(image);
          return article;
        },
        { key: (item) => item.id },
      );
    });
    const firstCard = parent.querySelector('[data-id="a"]');
    const firstImage = firstCard?.querySelector("img");

    expect(firstCard).toBeInstanceOf(HTMLElement);
    expect(firstImage).toBeInstanceOf(HTMLImageElement);

    selected.set(true);
    await flushEffects();

    expect(parent.querySelector('[data-id="a"]')).toBe(firstCard);
    expect(parent.querySelector('[data-id="a"] img')).toBe(firstImage);

    dispose();
  });

  test("retargets compiler-owned one-argument keyed list render values without replacing nodes", async () => {
    const items = cell([{ id: "a", label: "One" }]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () =>
      createListWithRenderArity(
        () => items.get(),
        (item) => {
          const article = document.createElement("article");
          const text = document.createTextNode("");
          article.append(text);
          bindText(text, () => item.label);
          return article;
        },
        1,
        { key: (item) => item.id },
      ),
    );
    const row = parent.querySelector("article");

    items.set([{ id: "a", label: "Updated" }]);
    await flushEffects();

    expect(parent.querySelector("article")).toBe(row);
    expect(row?.textContent).toBe("Updated");
    dispose();
  });

  test.each([
    ["dynamic", insertDynamic],
    ["memo dynamic", insertMemoDynamic],
  ])("retains compiler-owned zero-argument rows through %s insertion", async (_name, insert) => {
    const items = cell([{}]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    let renders = 0;
    parent.append(marker);

    const dispose = insert(parent, marker, () =>
      createListWithRenderArity(
        () => items.get(),
        () => {
          renders += 1;
          const row = document.createElement("article");
          row.textContent = "constant";
          return row;
        },
        0,
        { key: () => "same" },
      ),
    );
    const row = parent.querySelector("article");

    items.set([{}]);
    await flushEffects();

    expect(parent.querySelector("article")).toBe(row);
    expect(renders).toBe(1);
    dispose();
  });

  test("does not throw when the marker has been removed before a queued update", async () => {
    const value = cell<RenderValue>("first");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => value.get());
    expect(parent.textContent).toBe("first");

    marker.remove();
    value.set("second");

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("");

    dispose();
  });

  test("continues updating when a fragment marker is moved into the document", async () => {
    const value = cell<RenderValue>("first");
    const fragment = document.createDocumentFragment();
    const marker = document.createComment("marker");
    const host = document.createElement("div");

    fragment.append(marker);
    const dispose = insertDynamic(fragment, marker, () => value.get());
    host.append(fragment);
    await flushEffects();

    expect(host.innerHTML).toBe("first<!--marker-->");

    value.set("second");
    await flushEffects();

    expect(host.innerHTML).toBe("second<!--marker-->");

    dispose();
  });

  test("tracks inserted document fragment children for later updates", async () => {
    const value = cell(true);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => {
      if (!value.get()) {
        return null;
      }

      const fragment = document.createDocumentFragment();
      const aside = document.createElement("aside");
      aside.textContent = "Consent";
      fragment.append(aside);
      return fragment;
    });

    expect(parent.innerHTML).toBe("<aside>Consent</aside><!--marker-->");

    value.set(false);
    await flushEffects();

    expect(parent.innerHTML).toBe("<!--marker-->");
    dispose();
  });

  test("disposes nested reactive bindings when a dynamic branch is removed", async () => {
    const currentFamily = cell<{ role: string } | null>({ role: "owner" });
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    function FamilyReadyState(props: { readonly familyWithRole: { readonly role: string } }) {
      const span = document.createElement("span");
      const role = document.createTextNode("");
      span.append(role);
      bindText(role, () => props.familyWithRole.role);
      return span;
    }

    const dispose = insertDynamic(parent, marker, () => {
      const activeFamily = currentFamily.get();

      if (activeFamily === null) {
        const empty = document.createElement("p");
        empty.textContent = "No family";
        return empty;
      }

      return FamilyReadyState({
        get familyWithRole() {
          return currentFamily.get() as { role: string };
        },
      });
    });

    expect(parent.textContent).toBe("owner");

    currentFamily.set(null);

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("No family");

    dispose();
  });

  test("disposes the previous branch before evaluating its replacement", async () => {
    const events: string[] = [];
    const selected = cell("a");
    const shared = cell("initial");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => {
      const branch = selected.get();
      registerDispose(() => events.push(`dispose:${branch}`));
      events.push(`render:${branch}`);
      shared.set(branch);
      return document.createTextNode(branch);
    });

    selected.set("b");
    await flushEffects();

    expect(events).toEqual(["render:a", "dispose:a", "render:b"]);
    expect(shared.get()).toBe("b");

    dispose();
  });

  test("clears the stopped branch when evaluating its replacement throws", async () => {
    const selected = cell<"ready" | "error">("ready");
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => {
      const branch = selected.get();
      registerDispose(() => events.push(`dispose:${branch}`));

      if (branch === "error") {
        throw new Error("replacement failed");
      }

      return document.createTextNode(branch);
    });

    selected.set("error");

    await expect(flushEffects()).rejects.toThrow("replacement failed");
    expect(events).toEqual(["dispose:ready", "dispose:error"]);
    expect(parent.innerHTML).toBe("<!--marker-->");

    dispose();
  });

  test("clears the current branch when its reactive cleanup owner is disposed", () => {
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);
    const ownerDisposers: Array<() => void> = [];

    withCleanupScope(
      (dispose) => {
        ownerDisposers.push(dispose);
      },
      () =>
        insertDynamic(parent, marker, () => {
          registerDispose(() => events.push("cleanup"));
          return document.createTextNode("owned");
        }),
    );

    for (const dispose of ownerDisposers) {
      dispose();
    }

    expect(events).toEqual(["cleanup"]);
    expect(parent.innerHTML).toBe("<!--marker-->");
  });

  test("normalizes compat JSX elements passed through dynamic component children", () => {
    function Panel(props: { readonly children?: unknown }) {
      return jsxs("main", {
        children: [jsx("h1", { children: "Reset" }), props.children],
      });
    }

    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(
      parent,
      marker,
      () => jsx(Panel, { children: jsx("p", { children: "Updated abc" }) }) as never,
    );

    expect(parent.innerHTML).toBe("<main><h1>Reset</h1><p>Updated abc</p></main><!--marker-->");

    dispose();
  });
});
