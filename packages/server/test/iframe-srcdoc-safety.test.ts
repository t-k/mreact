import { describe, expect, test } from "vitest";
import { createElement } from "@modular-react/react-compat";
import { html as renderHtml } from "../src/index.js";

async function jsxToString(node: unknown): Promise<string> {
  return await renderHtml(node).text();
}

describe("iframe srcdoc safety (Issue 077)", () => {
  test("string srcdoc value is dropped (no opt-in)", async () => {
    const out = await jsxToString(
      createElement("iframe", {
        srcdoc: "<script>window.__pwned = true</script>",
      }),
    );
    expect(out).not.toContain("srcdoc=");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("__pwned");
  });

  test("number / boolean srcdoc value is dropped", async () => {
    const out1 = await jsxToString(
      createElement("iframe", { srcdoc: 42 }),
    );
    const out2 = await jsxToString(
      createElement("iframe", { srcdoc: true }),
    );
    expect(out1).not.toContain("srcdoc=");
    expect(out2).not.toContain("srcdoc=");
  });

  test("__html opt-in escapes the value and emits the attribute", async () => {
    const out = await jsxToString(
      createElement("iframe", {
        srcdoc: { __html: "<p>preview</p>" },
      }),
    );
    expect(out).toContain('srcdoc="');
    expect(out).toContain("&lt;p&gt;preview&lt;/p&gt;");
  });

  test("non-srcdoc attributes on iframe still work", async () => {
    const out = await jsxToString(
      createElement("iframe", {
        src: "https://example.com/",
        title: "ok",
      }),
    );
    expect(out).toContain('src="https://example.com/"');
    expect(out).toContain('title="ok"');
  });

  test("srcdoc XSS payload via __html opt-in is HTML-escaped, not raw", async () => {
    // The opt-in means "I take responsibility for this HTML" but the
    // attribute itself must still survive the HTML parser unmolested.
    // Escaping `<` and `"` is required for the value to round-trip
    // through the attribute syntax; the browser then decodes once and
    // hands the result to the iframe parser. So a literal `<script>`
    // in __html is exactly what the developer asked for.
    const out = await jsxToString(
      createElement("iframe", {
        srcdoc: { __html: '<script>console.log("hi")</script>' },
      }),
    );
    // Decoded form must reconstruct the original payload.
    const attr = /srcdoc="([^"]*)"/.exec(out)?.[1] ?? "";
    const decoded = attr
      .replaceAll("&quot;", '"')
      .replaceAll("&gt;", ">")
      .replaceAll("&lt;", "<")
      .replaceAll("&amp;", "&");
    expect(decoded).toBe('<script>console.log("hi")</script>');
  });
});
