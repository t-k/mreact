import { describe, expect, test, vi } from "vitest";
import { Link, linkProps, type LinkSinkProps } from "../src/link.js";

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

    expect(html).toBe('<a class="nav-link" href="/about" data-mreact-prefetch="none">About</a>');
  });

  test("renders an external href as a plain anchor", () => {
    const html = Link({
      children: "External",
      href: "https://example.com/about",
    });

    expect(html).toBe('<a href="https://example.com/about">External</a>');
  });

  test.each(["onclick", "onMouseOver", "ONFOCUS"])(
    "does not serialize event-like prop %s in server or HtmlSink forms",
    (name) => {
      const html = Link({
        children: "Profile",
        href: "/profile",
        [name]: "alert(1)",
        style: { color: "red" },
      });
      let sinkHtml = "";
      Link(
        {
          append(value) {
            sinkHtml += value;
          },
        },
        { children: "Profile", href: "/profile", [name]: "alert(1)" } as unknown as LinkSinkProps,
      );

      expect(html).toBe('<a style="color:red" href="/profile">Profile</a>');
      expect(sinkHtml).toBe('<a href="/profile">Profile</a>');
    },
  );

  test("drops unsafe href values in server and HtmlSink forms", () => {
    expect(
      Link({
        children: "Unsafe",
        href: "javascript:alert(1)",
      }),
    ).toBe("<a>Unsafe</a>");

    let html = "";
    Link(
      {
        append(value) {
          html += value;
        },
      },
      { children: "Unsafe", href: "javascript:alert(1)" },
    );

    expect(html).toBe("<a>Unsafe</a>");
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

    expect(html).toBe('<a href="/profile">&lt;script&gt;alert(1)&lt;/script&gt;</a>');
  });

  test("escapes entity-encoded javascript urls in string children", () => {
    let html = "";
    Link(
      {
        append(value) {
          html += value;
        },
      },
      {
        children: '<a href="java&#x73;cript:alert(1)">x</a>',
        href: "/profile",
      },
    );

    expect(html).toBe(
      '<a href="/profile">&lt;a href="java&amp;#x73;cript:alert(1)"&gt;x&lt;/a&gt;</a>',
    );
  });

  test("escapes ordinary text children containing markup characters", () => {
    const html = Link({
      children: "1 < 2 & 3",
      href: "/math",
    });

    expect(html).toBe('<a href="/math">1 &lt; 2 &amp; 3</a>');
  });

  test("warns in development when HtmlSink props cannot be serialized", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let html = "";

    try {
      Link(
        {
          append(value) {
            html += value;
          },
        },
        {
          "data-config": { mode: "full" },
          children: {} as Node,
          href: "/profile",
          onClick() {},
          ref: { current: null },
        } as unknown as LinkSinkProps,
      );

      expect(html).toBe('<a href="/profile"></a>');
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("MR_LINK_SINK_UNSUPPORTED_PROP"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("onClick"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ref"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("data-config"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("children"));
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  test("does not emit HtmlSink prop diagnostics in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      Link({ append() {} }, { href: "/profile", onClick() {} } as unknown as LinkSinkProps);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  test.each([
    "x onmouseover",
    "x=onmouseover",
    "x`onmouseover",
    "x\u0000onmouseover",
    'x"onmouseover',
  ])("drops malformed attribute name %j before SSR or HtmlSink serialization", (name) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const serverHtml = Link({ href: "/safe", [name]: "alert(1)" });
      let sinkHtml = "";
      Link(
        {
          append(value) {
            sinkHtml += value;
          },
        },
        { href: "/safe", [name]: "alert(1)" } as unknown as LinkSinkProps,
      );

      expect(serverHtml).toBe('<a href="/safe"></a>');
      expect(sinkHtml).toBe('<a href="/safe"></a>');
      expect(serverHtml).not.toContain("onmouseover=");
      expect(sinkHtml).not.toContain("onmouseover=");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(name));
    } finally {
      warn.mockRestore();
    }
  });

  test("serializes a reactive href getter as the value read at request time", () => {
    let requested = "/tickets/0";
    const props = {
      children: "Open detail page",
      prefetch: "viewport" as const,
      get href() {
        return requested;
      },
    };
    let sinkHtml = "";

    const serverHtml = Link(props);
    Link(
      {
        append(value) {
          sinkHtml += value;
        },
      },
      props as unknown as LinkSinkProps,
    );

    expect(serverHtml).toBe(
      '<a href="/tickets/0" data-mreact-prefetch="viewport">Open detail page</a>',
    );
    expect(sinkHtml).toBe(serverHtml);

    requested = "/tickets/1";

    expect(Link(props)).toBe(
      '<a href="/tickets/1" data-mreact-prefetch="viewport">Open detail page</a>',
    );
  });
});
