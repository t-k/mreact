// @vitest-environment happy-dom

import { cell, effect } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { describe, expect, test } from "vitest";
import {
  bindList,
  bindProp,
  bindSpreadProps,
  bindText,
} from "../src/index.js";
import { createScope, disposeScope, registerDispose, withScope } from "../src/scope.js";

describe("reactive-dom: edge branches in bind helpers", () => {
  test("bindText coerces null and undefined to an empty string", async () => {
    const node = document.createTextNode("");
    const c = cell<string | null | undefined>(null);
    const dispose = bindText(node, () => c.get());
    expect(node.data).toBe("");
    c.set("hello");
    await flushEffects();
    expect(node.data).toBe("hello");
    c.set(undefined);
    await flushEffects();
    expect(node.data).toBe("");
    dispose();
  });

  test("bindProp drops an unsafe URL value and clears the matching property", async () => {
    const a = document.createElement("a");
    const url = cell<string>("https://safe.example/");
    const dispose = bindProp(a, "href", () => url.get());
    expect(a.getAttribute("href")).toBe("https://safe.example/");
    url.set("javascript:alert(1)");
    await flushEffects();
    expect(a.getAttribute("href")).toBeNull();
    dispose();
  });

  test("bindProp uses removeAttribute for null / false on aria attributes", async () => {
    const div = document.createElement("div");
    const ariaPressed = cell<boolean | null>(true);
    const dispose = bindProp(div, "aria-pressed", () => ariaPressed.get());
    expect(div.getAttribute("aria-pressed")).toBe("");
    ariaPressed.set(null);
    await flushEffects();
    expect(div.getAttribute("aria-pressed")).toBeNull();
    ariaPressed.set(false);
    await flushEffects();
    expect(div.getAttribute("aria-pressed")).toBeNull();
    dispose();
  });

  test("bindSpreadProps drops unsafe URLs and respects className -> class", async () => {
    const div = document.createElement("div");
    const props = cell<Record<string, unknown>>({ className: "ok" });
    const dispose = bindSpreadProps(div, () => props.get());
    expect(div.getAttribute("class")).toBe("ok");
    props.set({ id: "x", style: { color: "red" } });
    await flushEffects();
    expect(div.getAttribute("class")).toBeNull();
    expect(div.getAttribute("id")).toBe("x");
    expect(div.style.color).toBe("red");
    dispose();
    expect(div.getAttribute("id")).toBeNull();
  });

  test("bindSpreadProps handles null props (returns early)", () => {
    const div = document.createElement("div");
    const dispose = bindSpreadProps(div, () => null);
    expect(div.attributes.length).toBe(0);
    dispose();
  });

  test("bindSpreadProps ignores children/key/ref and emits boolean attribute as empty value", () => {
    const div = document.createElement("div");
    const dispose = bindSpreadProps(div, () => ({
      children: "skipped",
      key: "k",
      ref: () => {},
      hidden: true,
    }));
    expect(div.getAttribute("children")).toBeNull();
    expect(div.getAttribute("key")).toBeNull();
    expect(div.getAttribute("ref")).toBeNull();
    expect(div.getAttribute("hidden")).toBe("");
    dispose();
  });

  test("bindList without a key uses the unkeyed insertDynamic path", async () => {
    const parent = document.createElement("ul");
    const marker = document.createComment("end");
    parent.appendChild(marker);
    const items = cell<readonly string[]>(["a", "b"]);
    const dispose = bindList(parent, marker, () => items.get(), (item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    });
    expect(parent.querySelectorAll("li").length).toBe(2);
    items.set(["a"]);
    await flushEffects();
    expect(parent.querySelectorAll("li").length).toBe(1);
    dispose();
  });

  test("bindList with a key option reuses records across renders", async () => {
    const parent = document.createElement("ul");
    const marker = document.createComment("end");
    parent.appendChild(marker);
    let renderCalls = 0;
    const items = cell([{ id: 1 }, { id: 2 }]);
    const dispose = bindList(
      parent,
      marker,
      () => items.get(),
      (item) => {
        renderCalls += 1;
        const li = document.createElement("li");
        li.textContent = String(item.id);
        return li;
      },
      { key: (item) => item.id },
    );
    expect(renderCalls).toBe(2);
    items.set([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await flushEffects();
    expect(renderCalls).toBe(3);
    items.set([{ id: 3 }]);
    await flushEffects();
    expect(parent.querySelectorAll("li").length).toBe(1);
    dispose();
    expect(parent.querySelectorAll("li").length).toBe(0);
  });
});

describe("reactive-dom scope: edge branches", () => {
  test("registerDispose without an active scope returns the dispose function unchanged", () => {
    let calls = 0;
    const dispose = registerDispose(() => {
      calls += 1;
    });
    dispose();
    expect(calls).toBe(1);
  });

  test("registerDispose on a disposed scope is a no-op wrapper around the original dispose", () => {
    const scope = createScope();
    scope.disposed = true;
    let calls = 0;
    const dispose = withScope(scope, () =>
      registerDispose(() => {
        calls += 1;
      }),
    );
    dispose();
    expect(calls).toBe(1);
  });

  test("disposeScope runs disposers in reverse insertion order", () => {
    const events: string[] = [];
    const scope = createScope();
    withScope(scope, () => {
      effect(() => {});
      registerDispose(() => events.push("first-registered"));
      registerDispose(() => events.push("second-registered"));
    });
    disposeScope(scope);
    expect(events).toEqual(["second-registered", "first-registered"]);
  });

  test("disposeScope re-throws the first error after running every disposer", () => {
    const events: string[] = [];
    const scope = createScope();
    withScope(scope, () => {
      registerDispose(() => events.push("one"));
      registerDispose(() => {
        events.push("two-throws");
        throw new Error("boom");
      });
      registerDispose(() => events.push("three"));
    });
    expect(() => disposeScope(scope)).toThrow("boom");
    expect(events).toEqual(["three", "two-throws", "one"]);
  });

  test("disposeScope on an already-disposed scope is a no-op", () => {
    const scope = createScope();
    let calls = 0;
    withScope(scope, () => {
      registerDispose(() => {
        calls += 1;
      });
    });
    disposeScope(scope);
    disposeScope(scope);
    expect(calls).toBe(1);
  });
});
