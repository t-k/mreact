import { describe, expect, test } from "vitest";
import { createElement } from "@reckona/mreact-compat";
import { html as renderHtml } from "../src/index.js";

async function jsxToString(node: unknown): Promise<string> {
  return await renderHtml(node).text();
}

describe("SSR attribute name safety (Issue 060)", () => {
  test("drops attribute names with whitespace or quote injection", async () => {
    const malicious: Record<string, unknown> = {
      'safe="x" onmouseover="alert(1)" foo': "bar",
    };
    const out = await jsxToString(createElement("div", malicious));

    expect(out).not.toContain("onmouseover");
    expect(out).not.toContain("alert(1)");
    expect(out).toBe("<div></div>");
  });

  test("drops attribute names that break out of the tag", async () => {
    const malicious: Record<string, unknown> = {
      "><script>alert(1)</script><div ": "x",
    };
    const out = await jsxToString(createElement("div", malicious));

    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)");
    expect(out).toBe("<div></div>");
  });

  test("drops attribute names starting with a digit", async () => {
    const out = await jsxToString(createElement("div", { "1bad": "x" }));
    expect(out).toBe("<div></div>");
  });

  test("drops empty attribute name", async () => {
    const out = await jsxToString(createElement("div", { "": "x" }));
    expect(out).toBe("<div></div>");
  });

  test("drops attribute name containing equal sign", async () => {
    const out = await jsxToString(createElement("div", { "a=b": "x" }));
    expect(out).toBe("<div></div>");
  });

  test("drops attribute name containing a space", async () => {
    const out = await jsxToString(createElement("div", { "a b": "x" }));
    expect(out).toBe("<div></div>");
  });

  test("drops attribute name containing a null byte", async () => {
    const out = await jsxToString(createElement("div", { "a\x00b": "x" }));
    expect(out).toBe("<div></div>");
  });

  test("allows standard attribute names", async () => {
    const out = await jsxToString(
      createElement("a", {
        id: "x",
        title: "ok",
        "data-foo": "1",
        "aria-label": "navigation",
      }),
    );
    expect(out).toContain('id="x"');
    expect(out).toContain('title="ok"');
    expect(out).toContain('data-foo="1"');
    expect(out).toContain('aria-label="navigation"');
  });

  test("allows xlink:href style names with a colon", async () => {
    const out = await jsxToString(
      createElement("use", { "xlink:href": "#icon" }),
    );
    expect(out).toContain('xlink:href="#icon"');
  });

  test("keeps escaping the attribute VALUE on safe names (sanity)", async () => {
    const out = await jsxToString(
      createElement("div", { title: '"><script>alert(1)</script>' }),
    );
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&quot;");
  });
});
