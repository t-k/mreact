// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
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

  test.each(["onclick", "onMouseOver", "ONFOCUS"])(
    "rejects executable string event attribute %s without echoing its value",
    (name) => {
      const payload = "globalThis.__mreactLinkExecuted = true";
      const browser = globalThis as typeof globalThis & { __mreactLinkExecuted?: boolean };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      browser.__mreactLinkExecuted = false;

      try {
        const anchor = Link({ href: "/safe", [name]: payload }) as HTMLAnchorElement;
        anchor.dispatchEvent(new Event(name.slice(2).toLowerCase()));

        expect(anchor.getAttribute(name)).toBeNull();
        expect(browser.__mreactLinkExecuted).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(name));
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(payload));
      } finally {
        delete browser.__mreactLinkExecuted;
        warn.mockRestore();
      }
    },
  );

  test("keeps supported bubble and capture handlers as listeners instead of attributes", () => {
    const calls: string[] = [];
    const anchor = Link({
      href: "/safe",
      onClick: () => calls.push("bubble"),
      onClickCapture: () => calls.push("capture"),
    }) as HTMLAnchorElement;

    anchor.click();

    expect(calls).toEqual(["capture", "bubble"]);
    expect(anchor.getAttribute("onclick")).toBeNull();
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
