import { describe, expect, test } from "vitest";
import type { AppRoute } from "../src/routes.js";
import {
  applyFileConventionMetadata,
  injectHeadMetadata,
  mergeRouteMetadata,
  responseHeadersForMetadata,
  serializeRobots,
  serializeSitemap,
  validateRouteMetadata,
} from "../src/metadata.js";

describe("router metadata contract", () => {
  test("rejects non-JSON and non-schema metadata values with a field path", () => {
    expect(() =>
      validateRouteMetadata(
        {
          title: () => "bad",
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.title: expected string, number, or boolean");

    expect(() =>
      validateRouteMetadata(
        {
          openGraph: { images: [{ width: new Date("2026-06-07T00:00:00.000Z") }] },
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.openGraph.images.0.url");

    expect(() =>
      validateRouteMetadata(
        {
          csp: { directives: { "style-src": [123] } },
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.csp.directives.style-src.0");

    expect(() =>
      validateRouteMetadata(
        {
          head: [{ attrs: { "src=https://evil.example/x.js": true }, tag: "script" }],
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.head.0.attrs.src=https://evil.example/x.js");

    expect(() =>
      validateRouteMetadata(
        {
          head: [{ attrs: { onload: "alert(1)" }, tag: "script" }],
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.head.0.attrs.onload");

    expect(() =>
      validateRouteMetadata(
        {
          head: [{ attrs: { href: "javascript:alert(1)" }, tag: "link" }],
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.head.0.attrs.href");

    expect(() =>
      validateRouteMetadata(
        {
          head: [{ attrs: { srcset: "javascript:alert(1) 1x" }, tag: "link" }],
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.head.0.attrs.srcset");

    expect(() =>
      validateRouteMetadata(
        {
          head: [
            {
              attrs: {
                httpEquiv: "not-refresh",
                "HTTP-EQUIV": "refresh",
                content: "0; url=javascript:alert(1)",
              },
              tag: "meta",
            },
          ],
        },
        "metadata",
      ),
    ).toThrow("Invalid metadata field metadata.head.0.attrs.content");
  });

  test("accepts safe meta refresh route metadata", () => {
    const metadata = {
      head: [
        { attrs: { "http-equiv": "refresh", content: "5; url=/next" }, tag: "meta" as const },
        {
          attrs: { httpEquiv: "refresh", content: "10; url=https://example.test/next" },
          tag: "meta" as const,
        },
      ],
    };

    expect(validateRouteMetadata(metadata)).toBe(metadata);
    expect(injectHeadMetadata("<html><head></head><body></body></html>", metadata)).toContain(
      'content="5; url=/next"',
    );
  });

  test("merges inherited metadata without dropping additive head or open graph images", () => {
    expect(
      mergeRouteMetadata([
        {
          csp: {
            directives: { "default-src": "'self'", "script-src": ["'self'"] },
          },
          head: [{ attrs: { name: "root" }, tag: "meta" }],
          openGraph: { images: ["/root.png"], title: "Root" },
        },
        {
          csp: {
            remove: ["default-src"],
            replace: { "script-src": ["'nonce-value'"] },
          },
          head: [{ attrs: { name: "page" }, tag: "meta" }],
          openGraph: { description: "Page", image: "/page.png" },
        },
      ]),
    ).toEqual({
      csp: {
        directives: { "script-src": ["'nonce-value'"] },
        remove: ["default-src"],
        replace: { "script-src": ["'nonce-value'"] },
      },
      head: [
        { attrs: { name: "root" }, tag: "meta" },
        { attrs: { name: "page" }, tag: "meta" },
      ],
      openGraph: {
        description: "Page",
        image: "/page.png",
        images: ["/root.png", "/page.png"],
        title: "Root",
      },
    });
  });

  test("injects escaped head metadata and html lang without replacing the body", () => {
    const html = injectHeadMetadata('<html lang="en"><head></head><body>Body</body></html>', {
      csp: { nonce: "abc123" },
      description: "A <B>",
      head: [
        { attrs: { async: true, src: "/client.js" }, content: "x < y", nonce: true, tag: "script" },
      ],
      lang: "ja",
      robots: { follow: false, index: false },
      themeColor: { color: "#101820", media: "(prefers-color-scheme: dark)" },
      title: "Title <safe>",
      viewport: { initialScale: 1, width: "device-width" },
    });

    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("<title>Title &lt;safe&gt;</title>");
    expect(html).toContain('<meta name="description" content="A &lt;B&gt;">');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#101820">',
    );
    expect(html).toContain('<meta name="viewport" content="initial-scale=1, width=device-width">');
    expect(html).toContain('<script async src="/client.js" nonce="abc123">x \\u003c y</script>');
    expect(html).toContain("<body>Body</body>");
  });

  test("injects metadata head void descriptors without closing tags", () => {
    const html = injectHeadMetadata("<html><head></head><body>Body</body></html>", {
      head: [
        {
          attrs: { name: "viewport", content: "width=device-width" },
          content: "ignored",
          tag: "meta",
        },
        {
          attrs: { rel: "preload", href: "/font.woff2", as: "font" },
          content: "ignored",
          tag: "link",
        },
        { attrs: { href: "https://example.com/" }, content: "ignored", tag: "base" },
      ],
    });

    expect(html).toContain('<meta name="viewport" content="width=device-width">');
    expect(html).toContain('<link rel="preload" href="/font.woff2" as="font">');
    expect(html).toContain('<base href="https://example.com/">');
    expect(html).not.toContain("</meta>");
    expect(html).not.toContain("</link>");
    expect(html).not.toContain("</base>");
    expect(html).not.toContain("ignored");
  });

  test("adds file convention metadata only when page metadata leaves a slot empty", () => {
    const routes: AppRoute[] = [
      { file: "/app/blog/[slug]/page.tsx", kind: "page", path: "/blog/:slug", segments: [] },
      {
        convention: "opengraph-image",
        file: "/app/blog/[slug]/opengraph-image.tsx",
        kind: "metadata",
        path: "/blog/:slug/opengraph-image",
        segments: [],
      },
      {
        convention: "icon",
        file: "/app/icon.png",
        kind: "asset",
        path: "/icon",
        segments: [],
      },
    ];

    expect(
      applyFileConventionMetadata(
        { openGraph: { title: "Post" } },
        routes,
        "/app/blog/[slug]/page.tsx",
        { slug: "hello world" },
      ),
    ).toEqual({
      icons: { icon: "/icon" },
      openGraph: {
        image: "/blog/hello%20world/opengraph-image",
        title: "Post",
      },
    });
  });

  test("serializes metadata conventions with escaping", () => {
    expect(
      serializeRobots({
        host: "example.com",
        rules: { allow: ["/"], disallow: ["/admin"], userAgent: ["*"] },
        sitemap: ["https://example.com/sitemap.xml"],
      }),
    ).toBe(
      "User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml\nHost: example.com\n",
    );

    expect(
      serializeSitemap([
        {
          changeFrequency: "daily",
          lastModified: new Date("2026-05-25T00:00:00.000Z"),
          priority: 0.8,
          url: "https://example.com/a&b",
        },
      ]),
    ).toContain("<loc>https://example.com/a&amp;b</loc>");
  });

  test("combines metadata security headers with explicit response headers", () => {
    expect(
      responseHeadersForMetadata(
        { csp: { directives: { "default-src": "'self'" } } },
        new Request("https://example.com"),
        { "x-extra": "yes" },
      ),
    ).toMatchObject({
      "content-security-policy": "default-src 'self'",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-extra": "yes",
    });
  });
});
