// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement, createRoot } from "../src/index.js";

function freshContainer(): HTMLElement {
  return document.createElement("div");
}

describe("react-compat URL scheme guard (Issue 075)", () => {
  test("drops javascript: from a[href] on render", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(createElement("a", { href: "javascript:alert(1)" }, "x"));
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBeNull();
  });

  test("keeps https URLs on render", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(createElement("a", { href: "https://example.com/" }, "x"));
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/");
  });

  test("drops data:text/html on iframe[src]", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(
      createElement("iframe", {
        src: "data:text/html,<script>alert(1)</script>",
      }),
    );
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBeNull();
  });

  test("keeps data:image on img[src]", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(
      createElement("img", {
        src: "data:image/png;base64,iVBORw0KGgo=",
        alt: "x",
      }),
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  test("drops javascript: from button[formaction]", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(
      createElement(
        "button",
        { formaction: "javascript:alert(1)" },
        "go",
      ),
    );
    const button = container.querySelector("button")!;
    expect(button.getAttribute("formaction")).toBeNull();
  });

  test("drops vbscript: from a[href]", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(createElement("a", { href: "vbscript:MsgBox(1)" }, "x"));
    expect(container.querySelector("a")!.getAttribute("href")).toBeNull();
  });

  test("re-render after mount drops an unsafe URL update", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(createElement("a", { href: "https://example.com/" }, "x"));
    expect(container.querySelector("a")!.getAttribute("href")).toBe(
      "https://example.com/",
    );

    root.render(
      createElement("a", { href: "javascript:alert(1)" }, "x"),
    );
    expect(container.querySelector("a")!.getAttribute("href")).toBeNull();
  });

  test("strips javascript: with leading whitespace / control bytes", () => {
    const container = freshContainer();
    const root = createRoot(container);
    root.render(
      createElement("a", { href: "  \tjavascript:alert(1)" }, "x"),
    );
    expect(container.querySelector("a")!.getAttribute("href")).toBeNull();
  });
});
