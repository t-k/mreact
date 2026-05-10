// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { insertDynamic } from "../src/index.js";

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
});
