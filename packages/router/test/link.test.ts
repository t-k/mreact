import { describe, expect, test } from "vitest";
import { Link, linkProps } from "../src/link.js";

describe("router Link", () => {
  test("maps prefetch, scroll, transition, and reload options to data attributes", () => {
    expect(
      linkProps({
        href: "/about",
        prefetch: "viewport",
        reload: true,
        scroll: "preserve",
        transition: "auto",
      }),
    ).toEqual({
      "data-mreact-prefetch": "viewport",
      "data-mreact-reload": "true",
      "data-mreact-scroll": "preserve",
      "data-mreact-transition": "auto",
      href: "/about",
    });
  });

  test("omits default intent prefetch attributes", () => {
    expect(linkProps({ href: "/about", prefetch: "intent" })).toEqual({
      href: "/about",
    });
  });

  test("renders an anchor element", () => {
    const element = Link({
      children: "About",
      className: "nav-link",
      href: "/about",
      prefetch: false,
    });

    expect(element.type).toBe("a");
    expect(element.props).toMatchObject({
      "data-mreact-prefetch": "none",
      children: "About",
      className: "nav-link",
      href: "/about",
    });
  });

  test("renders an external href as a plain anchor", () => {
    const element = Link({
      children: "External",
      href: "https://example.com/about",
    });

    expect(element.type).toBe("a");
    expect(element.props).toMatchObject({
      children: "External",
      href: "https://example.com/about",
    });
  });
});
