import { describe, expect, test } from "vitest";
import { hasUnguardedBrowserGlobalReference } from "../src/internal.js";

describe("hasUnguardedBrowserGlobalReference", () => {
  test("returns false for a module without browser globals", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `export function Card() { return <p>ok</p>; }`,
      }),
    ).toBe(false);
  });

  test("flags an unguarded module-scope read", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const width = window.innerWidth;`,
      }),
    ).toBe(true);
  });

  test("flags an unguarded read inside a function", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `export function current() { return window.location.href; }`,
      }),
    ).toBe(true);
  });

  test("treats a typeof check alone as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const isServer = typeof window === "undefined";`,
      }),
    ).toBe(false);
  });

  test("treats a guarded early-return read as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function currentPath() {
  if (typeof window !== "undefined") return window.location.pathname;
  return "/";
}`,
      }),
    ).toBe(false);
  });

  test("treats a guarded block as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function focusBody() {
  if (typeof document !== "undefined") {
    document.body.focus();
  }
}`,
      }),
    ).toBe(false);
  });

  test("treats a guarded ternary read as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const width = typeof window === "undefined" ? 0 : window.innerWidth;`,
      }),
    ).toBe(false);
  });

  test("treats a guarded logical-and read as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const y = typeof window !== "undefined" && window.scrollY;`,
      }),
    ).toBe(false);
  });

  test("treats a guarded logical-or read as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const stored = typeof localStorage === "undefined" || localStorage.getItem("k");`,
      }),
    ).toBe(false);
  });

  test("treats statements after a server early-exit guard as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function start() {
  if (typeof window === "undefined" || started.get()) return;
  window.addEventListener("load", handler);
}`,
      }),
    ).toBe(false);
  });

  test("treats callbacks scheduled after a server early-exit guard as safe", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function start() {
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    document.title = "loaded";
  });
}`,
      }),
    ).toBe(false);
  });

  test("flags a read in the server branch of a guard", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function broken() {
  if (typeof window === "undefined") {
    return window.location.pathname;
  }
  return "/";
}`,
      }),
    ).toBe(true);
  });

  test("flags a read before a server early-exit guard", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function start() {
  const path = window.location.pathname;
  if (typeof window === "undefined") return;
  return path;
}`,
      }),
    ).toBe(true);
  });

  test("flags a read after a guard whose consequent does not exit", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function start() {
  if (typeof window === "undefined") log("server");
  window.addEventListener("load", handler);
}`,
      }),
    ).toBe(true);
  });

  test("flags an aliased environment check it cannot follow", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const isBrowser = typeof window !== "undefined";
function start() {
  if (isBrowser) {
    window.addEventListener("load", handler);
  }
}`,
      }),
    ).toBe(true);
  });

  test("supports a reversed typeof comparison", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const width = "undefined" === typeof window ? 0 : window.innerWidth;`,
      }),
    ).toBe(false);
  });

  test("supports a negated guard expression", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function current() {
  if (!(typeof window === "undefined")) return window.location.pathname;
  return "/";
}`,
      }),
    ).toBe(false);
  });

  test("supports a conjunction guard with extra conditions", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function maybeFocus(ready) {
  if (typeof document !== "undefined" && ready) {
    document.body.focus();
  }
}`,
      }),
    ).toBe(false);
  });

  test("accepts a guard on one browser global covering another", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `function title() {
  if (typeof window !== "undefined") return document.title;
  return "";
}`,
      }),
    ).toBe(false);
  });

  test("ignores the word in strings, comments, and JSX text", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `// close the window before leaving
const label = "window";
export function Hint() { return <p>Open a new window to compare documents.</p>; }`,
      }),
    ).toBe(false);
  });

  test("ignores member property and object key positions", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const config = { window: 1 };
const value = settings.window;`,
      }),
    ).toBe(false);
  });

  test("flags an object shorthand reference", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `const env = { window };`,
      }),
    ).toBe(true);
  });

  test("ignores type-only positions", () => {
    expect(
      hasUnguardedBrowserGlobalReference({
        code: `type Win = typeof window;
export function Card(props: { win?: Window }) { return <p>ok</p>; }`,
      }),
    ).toBe(false);
  });
});
