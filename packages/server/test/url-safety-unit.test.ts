import { describe, expect, test } from "vitest";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isSrcsetAttribute,
  isUnsafeMetaRefreshContent,
  isUnsafeUrlAttribute,
  isUrlAttribute,
  safeUrlAttributeValue,
} from "../src/url-safety.js";

describe("server url-safety unit-level coverage", () => {
  test("isUrlAttribute / isSrcsetAttribute / isDangerousHtmlAttribute classify by name", () => {
    expect(isUrlAttribute("href")).toBe(true);
    expect(isUrlAttribute("class")).toBe(false);
    expect(isSrcsetAttribute("srcset")).toBe(true);
    expect(isSrcsetAttribute("imagesrcset")).toBe(true);
    expect(isSrcsetAttribute("src")).toBe(false);
    expect(isDangerousHtmlAttribute("srcdoc")).toBe(true);
    expect(isDangerousHtmlAttribute("href")).toBe(false);
  });

  test("isDangerousHtmlOptIn validates the {__html: string} shape", () => {
    expect(isDangerousHtmlOptIn({ __html: "<b>x</b>" })).toBe(true);
    expect(isDangerousHtmlOptIn(null)).toBe(false);
    expect(isDangerousHtmlOptIn("text")).toBe(false);
    expect(isDangerousHtmlOptIn({ __html: 1 })).toBe(false);
    expect(isDangerousHtmlOptIn({})).toBe(false);
  });

  test("isUnsafeUrlAttribute drops javascript:/vbscript:/livescript:/mhtml:/file:/data:", () => {
    for (const value of [
      "javascript:alert(1)",
      "vbscript:Msg(1)",
      "livescript:alert(1)",
      "mhtml:http://example.com/!body",
      "file:///etc/passwd",
      "data:text/html,<script>",
    ]) {
      expect(isUnsafeUrlAttribute("href", value)).toBe(true);
    }
  });

  test("isUnsafeUrlAttribute keeps non-SVG data:image/* on src and poster only", () => {
    const dataImage = "data:image/png;base64,AAA";
    expect(isUnsafeUrlAttribute("src", dataImage)).toBe(false);
    expect(isUnsafeUrlAttribute("poster", dataImage)).toBe(false);
    expect(isUnsafeUrlAttribute("href", dataImage)).toBe(true);
    expect(isUnsafeUrlAttribute("src", "data:image/svg+xml,<svg></svg>")).toBe(true);
    expect(isUnsafeUrlAttribute("poster", "data:image/svg+xml;charset=utf-8,<svg></svg>")).toBe(
      true,
    );
  });

  test("isUnsafeUrlAttribute on srcset taints when any candidate URL is unsafe", () => {
    expect(
      isUnsafeUrlAttribute(
        "srcset",
        "https://safe.example/img.png 1x, javascript:alert(1) 2x",
      ),
    ).toBe(true);
    expect(
      isUnsafeUrlAttribute(
        "srcset",
        "https://safe.example/img.png 1x, /local/path 2x, , data:image/png;base64,AAA 3x",
      ),
    ).toBe(false);
  });

  test("isUnsafeUrlAttribute strips embedded tabs/newlines and leading control bytes", () => {
    expect(isUnsafeUrlAttribute("href", "  \tjava\nscript:alert(1)")).toBe(true);
    expect(isUnsafeUrlAttribute("href", "JAVASCRIPT:alert(1)")).toBe(true);
  });

  test("isUnsafeUrlAttribute on non-URL/non-srcset names is always false", () => {
    expect(isUnsafeUrlAttribute("class", "javascript:alert(1)")).toBe(false);
  });

  test("safeUrlAttributeValue echoes safe values and drops unsafe ones", () => {
    expect(safeUrlAttributeValue("href", "https://example.com/")).toBe("https://example.com/");
    expect(safeUrlAttributeValue("href", "javascript:alert(1)")).toBeUndefined();
  });

  test("isUnsafeMetaRefreshContent only fires on http-equiv=refresh with a redirect URL", () => {
    expect(isUnsafeMetaRefreshContent("refresh", "0;url=javascript:alert(1)")).toBe(true);
    expect(isUnsafeMetaRefreshContent("refresh", "0;url=https://example.com/")).toBe(false);
    expect(isUnsafeMetaRefreshContent("REFRESH", "0;URL=javascript:alert(1)")).toBe(true);
    // No url= component → safe (this is just a delay-only refresh).
    expect(isUnsafeMetaRefreshContent("refresh", "5")).toBe(false);
    // Non-refresh http-equiv → never URL-bearing.
    expect(isUnsafeMetaRefreshContent("content-type", "text/html; charset=utf-8")).toBe(false);
  });
});
