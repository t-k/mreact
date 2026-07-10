// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { Link } from "../src/link.js";

describe("Link client rendering", () => {
  test("drops unsafe client href values", () => {
    const anchor = Link({
      children: "profile",
      href: "javascript:alert(1)",
    }) as HTMLAnchorElement;

    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBeNull();
    expect(anchor.textContent).toBe("profile");
  });

  test("preserves ordinary anchor events, styles, boolean attributes, and refs", () => {
    let clicks = 0;
    let ref: HTMLAnchorElement | null = null;
    const anchor = Link({
      children: "download",
      download: true,
      href: "/report",
      onClick: () => {
        clicks += 1;
      },
      ref: (element: HTMLAnchorElement | null) => {
        ref = element;
      },
      style: { color: "red" },
    }) as HTMLAnchorElement;

    anchor.click();

    expect(clicks).toBe(1);
    expect(anchor.style.color).toBe("red");
    expect(anchor.getAttribute("download")).toBe("");
    expect(ref).toBe(anchor);
  });
});
