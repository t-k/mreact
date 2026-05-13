import { describe, expect, test } from "vitest";
import { createElement } from "@modular-react/react-compat";
import { html as renderHtml } from "../src/index.js";

async function jsxToString(node: unknown): Promise<string> {
  return await renderHtml(node).text();
}

describe("SSR URL scheme safety (Issue 062)", () => {
  test("strips javascript: from a[href]", async () => {
    const out = await jsxToString(
      createElement("a", { href: "javascript:alert(1)" }, "x"),
    );
    expect(out).not.toContain("javascript:");
    expect(out).toBe("<a>x</a>");
  });

  test("strips javascript: with mixed case from a[href]", async () => {
    const out = await jsxToString(
      createElement("a", { href: "JaVaScRiPt:alert(1)" }, "x"),
    );
    expect(out).not.toContain("alert(1)");
    expect(out).not.toMatch(/javascript:/i);
  });

  test("strips javascript: with leading whitespace / control bytes", async () => {
    const out = await jsxToString(
      createElement("a", { href: "  \tjavascript:alert(1)" }, "x"),
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  test("strips data: from iframe[src]", async () => {
    const out = await jsxToString(
      createElement("iframe", {
        src: "data:text/html,<script>alert(1)</script>",
      }),
    );
    expect(out).not.toContain("data:text/html");
  });

  test("strips vbscript: from a[href]", async () => {
    const out = await jsxToString(
      createElement("a", { href: "vbscript:MsgBox(1)" }, "x"),
    );
    expect(out).not.toContain("vbscript:");
  });

  test("strips file: scheme", async () => {
    const out = await jsxToString(
      createElement("a", { href: "file:///etc/passwd" }, "x"),
    );
    expect(out).not.toContain("file:");
  });

  test("strips javascript: from formaction", async () => {
    const out = await jsxToString(
      createElement("button", { formaction: "javascript:alert(1)" }, "go"),
    );
    expect(out).not.toContain("javascript:");
  });

  test("strips javascript: from xlink:href on SVG", async () => {
    const out = await jsxToString(
      createElement("use", { "xlink:href": "javascript:alert(1)" }),
    );
    expect(out).not.toContain("javascript:");
  });

  test("allows http(s) URLs", async () => {
    const out = await jsxToString(
      createElement("a", { href: "https://example.com/path?x=1" }, "ok"),
    );
    expect(out).toContain('href="https://example.com/path?x=1"');
  });

  test("allows path-absolute URLs", async () => {
    const out = await jsxToString(
      createElement("a", { href: "/foo/bar" }, "ok"),
    );
    expect(out).toContain('href="/foo/bar"');
  });

  test("allows protocol-relative URLs (browser picks https)", async () => {
    const out = await jsxToString(
      createElement("a", { href: "//example.com" }, "ok"),
    );
    expect(out).toContain('href="//example.com"');
  });

  test("allows mailto: scheme", async () => {
    const out = await jsxToString(
      createElement("a", { href: "mailto:foo@example.com" }, "ok"),
    );
    expect(out).toContain('href="mailto:foo@example.com"');
  });

  test("allows tel: scheme", async () => {
    const out = await jsxToString(
      createElement("a", { href: "tel:+81-3-0000-0000" }, "ok"),
    );
    expect(out).toContain('href="tel:+81-3-0000-0000"');
  });

  test("allows data: image on img[src] (img is not a script context)", async () => {
    // data: on img is a common pattern (base64 image preview). Permitted to
    // keep the safe-default focused on script-execution sinks.
    const out = await jsxToString(
      createElement("img", {
        src: "data:image/png;base64,iVBORw0KGgo=",
        alt: "x",
      }),
    );
    expect(out).toContain("data:image/png");
  });

  test("blocks data: on iframe even with html mediatype", async () => {
    const out = await jsxToString(createElement("iframe", { src: "data:text/html,x" }));
    expect(out).not.toContain("data:text/html");
  });
});
