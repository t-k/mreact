// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { insertDynamic } from "../src/index.js";
import { bindText } from "../src/bind-text.js";

const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("modular.react.element");

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
  test("replaces only the dynamic range before the marker", async () => {
    const value = cell<unknown>("first");
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

    expect(parent.innerHTML).toBe(
      "before:<strong>node</strong>2<!--marker-->:after",
    );

    value.set(null);
    await flushEffects();

    expect(parent.textContent).toBe("before::after");

    dispose();
    value.set("ignored");
    await flushEffects();

    expect(parent.textContent).toBe("before::after");
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

  test("does not throw when the marker has been removed before a queued update", async () => {
    const value = cell<unknown>("first");
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
    const value = cell<unknown>("first");
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

    function FamilyReadyState(props: {
      readonly familyWithRole: { readonly role: string };
    }) {
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

  test("normalizes compat JSX elements passed through dynamic component children", () => {
    function Panel(props: { readonly children?: unknown }) {
      return jsxs("main", {
        children: [jsx("h1", { children: "Reset" }), props.children],
      });
    }

    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () =>
      jsx(Panel, { children: jsx("p", { children: "Updated abc" }) }) as never,
    );

    expect(parent.innerHTML).toBe(
      "<main><h1>Reset</h1><p>Updated abc</p></main><!--marker-->",
    );

    dispose();
  });
});
