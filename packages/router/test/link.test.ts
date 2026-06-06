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

  test("renders an anchor HTML string on the server", () => {
    const html = Link({
      children: "About",
      className: "nav-link",
      href: "/about",
      prefetch: false,
    });

    expect(html).toBe(
      '<a class="nav-link" href="/about" data-mreact-prefetch="none">About</a>',
    );
  });

  test("renders an external href as a plain anchor", () => {
    const html = Link({
      children: "External",
      href: "https://example.com/about",
    });

    expect(html).toBe('<a href="https://example.com/about">External</a>');
  });

  test("escapes string children in the sink/server form", () => {
    let html = "";
    Link(
      {
        append(value) {
          html += value;
        },
      },
      {
        children: "<script>alert(1)</script>",
        href: "/profile",
      },
    );

    expect(html).toBe(
      '<a href="/profile">&lt;script&gt;alert(1)&lt;/script&gt;</a>',
    );
  });
});
