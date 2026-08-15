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

const unsafeSchemes = ["javascript", "data", "vbscript", "livescript", "mhtml", "file"] as const;

const urlAttributes = [
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "ping",
  "poster",
  "background",
  "manifest",
  "data",
  "codebase",
] as const;

describe("URL safety helpers", () => {
  test("classifies URL, srcset, and dangerous HTML attribute names", () => {
    for (const name of urlAttributes) {
      expect(isUrlAttribute(name), name).toBe(true);
    }

    expect(isUrlAttribute("class")).toBe(false);
    expect(isSrcsetAttribute("srcset")).toBe(true);
    expect(isSrcsetAttribute("imagesrcset")).toBe(true);
    expect(isSrcsetAttribute("src")).toBe(false);
    expect(isDangerousHtmlAttribute("srcdoc")).toBe(true);
    expect(isDangerousHtmlAttribute("srcDoc")).toBe(true);
    expect(isDangerousHtmlAttribute("SRCDOC")).toBe(true);
    expect(isUrlAttribute("HREF")).toBe(true);
    expect(isSrcsetAttribute("SRCSET")).toBe(true);
  });

  test("requires an explicit string __html opt-in for dangerous HTML attributes", () => {
    expect(isDangerousHtmlOptIn({ __html: "<p>trusted</p>" })).toBe(true);
    expect(isDangerousHtmlOptIn({ __html: 1 })).toBe(false);
    expect(isDangerousHtmlOptIn({})).toBe(false);
    expect(isDangerousHtmlOptIn(null)).toBe(false);
    expect(isDangerousHtmlOptIn("<p>trusted</p>")).toBe(false);
  });

  test("property-like matrix rejects unsafe URL schemes across URL attributes", () => {
    const variants = unsafeSchemes.flatMap((scheme) => [
      `${scheme}:alert(1)`,
      `${scheme.toUpperCase()}:alert(1)`,
      ` \t\n${scheme}:alert(1)`,
      `${scheme.slice(0, 2)}\n${scheme.slice(2)}:alert(1)`,
      `${scheme.slice(0, 3)}\r${scheme.slice(3)}:alert(1)`,
    ]);

    for (const attributeName of urlAttributes) {
      for (const value of variants) {
        if (
          (attributeName === "src" || attributeName === "poster") &&
          /^data:image\/png/i.test(value.trim())
        ) {
          continue;
        }

        expect(isUnsafeUrlAttribute(attributeName, value), `${attributeName}=${value}`).toBe(true);
      }
    }
  });

  test("rejects unsafe URL schemes for mixed-case attribute names", () => {
    expect(isUnsafeUrlAttribute("HREF", "javascript:alert(1)")).toBe(true);
    expect(isUnsafeUrlAttribute("Src", "data:text/html,<script>1</script>")).toBe(true);
    expect(isUnsafeUrlAttribute("SRCSET", "/safe.png 1x, javascript:alert(1) 2x")).toBe(true);
  });

  test("keeps relative, http, https, mailto, and tel URL values", () => {
    for (const value of ["/local", "./asset.png", "?q=1", "#section", "https://example.test/x"]) {
      expect(isUnsafeUrlAttribute("href", value), value).toBe(false);
    }

    expect(isUnsafeUrlAttribute("href", "mailto:hello@example.test")).toBe(false);
    expect(isUnsafeUrlAttribute("href", "tel:+15555550100")).toBe(false);
  });

  test("allows non-SVG data images only for image-like src and poster sinks", () => {
    const png = "data:image/png;base64,AAA";

    expect(isUnsafeUrlAttribute("src", png)).toBe(false);
    expect(isUnsafeUrlAttribute("poster", png)).toBe(false);
    expect(isUnsafeUrlAttribute("href", png)).toBe(true);
    expect(isUnsafeUrlAttribute("src", "data:image/svg+xml,<svg></svg>")).toBe(true);
    expect(isUnsafeUrlAttribute("poster", "data:image/svg+xml;charset=utf-8,<svg></svg>")).toBe(
      true,
    );
  });

  test("taints srcset and imagesrcset when any candidate URL is unsafe", () => {
    expect(
      isUnsafeUrlAttribute("srcset", "https://safe.test/a.png 1x, java\nscript:alert(1) 2x"),
    ).toBe(true);
    expect(isUnsafeUrlAttribute("imagesrcset", "/local.png 1x, data:image/png;base64,AAA 2x")).toBe(
      false,
    );
    expect(isUnsafeUrlAttribute("srcset", ",, , /safe.png 1x")).toBe(false);
  });

  test("safeUrlAttributeValue drops unsafe values and preserves safe values", () => {
    expect(safeUrlAttributeValue("href", "javascript:alert(1)")).toBeUndefined();
    expect(safeUrlAttributeValue("href", "https://example.test/")).toBe("https://example.test/");
    expect(safeUrlAttributeValue("class", "javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  test("detects unsafe meta refresh redirects including quoted URL values", () => {
    expect(isUnsafeMetaRefreshContent("refresh", "0; url=javascript:alert(1)")).toBe(true);
    expect(isUnsafeMetaRefreshContent("REFRESH", "0; URL=java\nscript:alert(1)")).toBe(true);
    expect(isUnsafeMetaRefreshContent("refresh", "0; url='javascript:alert(1)'")).toBe(true);
    expect(isUnsafeMetaRefreshContent("refresh", '0; url="vbscript:MsgBox(1)"')).toBe(true);
    expect(isUnsafeMetaRefreshContent("refresh", "0; url=https://example.test/")).toBe(false);
    expect(isUnsafeMetaRefreshContent("content-type", "0; url=javascript:alert(1)")).toBe(false);
    expect(isUnsafeMetaRefreshContent("refresh", "5")).toBe(false);
  });
});
