import { describe, expect, test } from "vitest";
import { createElement } from "@modular-react/react-compat";
import { html as renderHtml } from "../src/index.js";

async function jsxToString(node: unknown): Promise<string> {
  return await renderHtml(node).text();
}

describe("URL scheme bypass via in-scheme whitespace (Issue 078)", () => {
  test("tab between letters of `javascript:` is rejected", async () => {
    const out = await jsxToString(
      createElement("a", { href: "java\tscript:alert(1)" }, "x"),
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toContain("alert(1)");
  });

  test("newline in the scheme is rejected", async () => {
    const out = await jsxToString(
      createElement("a", { href: "java\nscript:alert(1)" }, "x"),
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  test("CR in the scheme is rejected", async () => {
    const out = await jsxToString(
      createElement("a", { href: "java\rscript:alert(1)" }, "x"),
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  test("mixed tab + CR + LF still rejected", async () => {
    const out = await jsxToString(
      createElement("a", { href: "j\ta\rv\na\rscript:alert(1)" }, "x"),
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  test("tab before scheme is also rejected (leading strip still works)", async () => {
    const out = await jsxToString(
      createElement("a", { href: "\tjavascript:alert(1)" }, "x"),
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  test("real https URL still passes", async () => {
    const out = await jsxToString(
      createElement("a", { href: "https://example.com/" }, "x"),
    );
    expect(out).toContain('href="https://example.com/"');
  });
});

describe("srcset URL scheme guard (Issue 078)", () => {
  test("img[srcset] containing javascript: candidate is dropped", async () => {
    const out = await jsxToString(
      createElement("img", {
        srcset: "javascript:alert(1) 1x, /a.png 2x",
        alt: "x",
      }),
    );
    expect(out).not.toContain("javascript:");
    // The remaining candidates should also be dropped (atomic decision:
    // if any candidate is unsafe, we drop the whole attribute rather
    // than emitting a partial srcset that still leaves the attacker
    // candidate in play).
    expect(out).not.toContain("srcset=");
  });

  test("img[srcset] with only safe candidates passes", async () => {
    const out = await jsxToString(
      createElement("img", {
        srcset: "/a.png 1x, /b.png 2x",
        alt: "x",
      }),
    );
    expect(out).toContain('srcset="/a.png 1x, /b.png 2x"');
  });

  test("img[srcset] with tab-bypass candidate is dropped", async () => {
    const out = await jsxToString(
      createElement("img", {
        srcset: "java\tscript:alert(1) 1x",
        alt: "x",
      }),
    );
    expect(out).not.toMatch(/srcset=/i);
  });
});

describe("meta http-equiv=refresh content guard (Issue 078)", () => {
  test("meta refresh with javascript: url is dropped", async () => {
    const out = await jsxToString(
      createElement("meta", {
        "http-equiv": "refresh",
        content: "0;url=javascript:alert(1)",
      }),
    );
    expect(out).not.toContain("javascript:");
  });

  test("meta refresh with https url is preserved", async () => {
    const out = await jsxToString(
      createElement("meta", {
        "http-equiv": "refresh",
        content: "0;url=https://example.com/",
      }),
    );
    expect(out).toContain("https://example.com/");
  });

  test("meta http-equiv=content-type is unaffected", async () => {
    const out = await jsxToString(
      createElement("meta", {
        "http-equiv": "content-type",
        content: "text/html; charset=utf-8",
      }),
    );
    expect(out).toContain('content="text/html; charset=utf-8"');
  });
});
