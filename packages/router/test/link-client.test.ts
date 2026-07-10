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

  test("combines navigation attributes with user events and ordinary DOM properties", () => {
    const ref: { current: HTMLAnchorElement | null } = { current: null };
    let clicks = 0;
    const anchor = Link({
      "aria-label": "Account settings",
      "data-section": "account",
      children: "Settings",
      className: "navigation-link",
      href: "/settings",
      onClick: () => {
        clicks += 1;
      },
      prefetch: "viewport",
      ref,
    }) as HTMLAnchorElement;

    anchor.click();

    expect(clicks).toBe(1);
    expect(anchor.getAttribute("aria-label")).toBe("Account settings");
    expect(anchor.getAttribute("data-section")).toBe("account");
    expect(anchor.className).toBe("navigation-link");
    expect(anchor.getAttribute("data-mreact-prefetch")).toBe("viewport");
    expect(ref.current).toBe(anchor);
  });

  test("omits false boolean attributes and maps DOM property aliases", () => {
    const anchor = Link({ download: false, href: "/report", tabIndex: 2 }) as HTMLAnchorElement;

    expect(anchor.hasAttribute("download")).toBe(false);
    expect(anchor.getAttribute("tabindex")).toBe("2");
  });
});
