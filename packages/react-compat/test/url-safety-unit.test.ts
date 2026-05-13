import { describe, expect, test } from "vitest";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isSrcsetAttribute,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "../src/url-safety.js";

describe("react-compat url-safety: unit-level coverage", () => {
  test("isUrlAttribute / isSrcsetAttribute / isDangerousHtmlAttribute classify the known names", () => {
    expect(isUrlAttribute("href")).toBe(true);
    expect(isUrlAttribute("class")).toBe(false);
    expect(isSrcsetAttribute("srcset")).toBe(true);
    expect(isSrcsetAttribute("imagesrcset")).toBe(true);
    expect(isSrcsetAttribute("src")).toBe(false);
    expect(isDangerousHtmlAttribute("srcdoc")).toBe(true);
    expect(isDangerousHtmlAttribute("src")).toBe(false);
  });

  test("isDangerousHtmlOptIn requires an object with a string __html field", () => {
    expect(isDangerousHtmlOptIn({ __html: "<b>x</b>" })).toBe(true);
    expect(isDangerousHtmlOptIn(null)).toBe(false);
    expect(isDangerousHtmlOptIn("string")).toBe(false);
    expect(isDangerousHtmlOptIn({})).toBe(false);
    expect(isDangerousHtmlOptIn({ __html: 123 })).toBe(false);
  });

  test("isUnsafeUrlAttribute on non-URL/non-srcset attribute is always false", () => {
    expect(isUnsafeUrlAttribute("class", "javascript:alert(1)")).toBe(false);
  });

  test("isUnsafeUrlAttribute treats relative or scheme-less URLs as safe", () => {
    expect(isUnsafeUrlAttribute("href", "/local/path")).toBe(false);
    expect(isUnsafeUrlAttribute("href", "")).toBe(false);
    expect(isUnsafeUrlAttribute("href", "?query=1")).toBe(false);
  });

  test("isUnsafeUrlAttribute flags javascript: / data: / vbscript: / livescript: / mhtml: / file:", () => {
    for (const scheme of [
      "javascript:alert(1)",
      "vbscript:Msg(1)",
      "livescript:alert(1)",
      "mhtml:http://example.com/!body",
      "file:///etc/passwd",
    ]) {
      expect(isUnsafeUrlAttribute("href", scheme)).toBe(true);
    }
  });

  test("isUnsafeUrlAttribute allows data:image only on src and poster", () => {
    const dataImage = "data:image/png;base64,AAA";
    expect(isUnsafeUrlAttribute("src", dataImage)).toBe(false);
    expect(isUnsafeUrlAttribute("poster", dataImage)).toBe(false);
    // href + data:image is still unsafe even though scheme is data:image.
    expect(isUnsafeUrlAttribute("href", dataImage)).toBe(true);
    // data: with non-image MIME type is unsafe everywhere.
    expect(isUnsafeUrlAttribute("src", "data:text/html,<script>")).toBe(true);
  });

  test("isUnsafeUrlAttribute strips leading control bytes and tabs/newlines before scheme detection", () => {
    expect(isUnsafeUrlAttribute("href", "  \tjava\nscript:alert(1)")).toBe(true);
    expect(isUnsafeUrlAttribute("href", "JAVASCRIPT:alert(1)")).toBe(true);
  });

  test("isUnsafeUrlAttribute on srcset returns true when any candidate URL is unsafe", () => {
    const srcset =
      "https://safe.example/img.png 1x, javascript:alert(1) 2x, data:image/png;base64,AAA 3x";
    expect(isUnsafeUrlAttribute("srcset", srcset)).toBe(true);
  });

  test("isUnsafeUrlAttribute on srcset returns false when every candidate URL is safe", () => {
    const srcset = "https://safe.example/img.png 1x, /local/path 2x, , data:image/png;base64,AAA 3x";
    expect(isUnsafeUrlAttribute("srcset", srcset)).toBe(false);
  });

  test("isUnsafeUrlAttribute on imagesrcset honors the srcset path", () => {
    expect(
      isUnsafeUrlAttribute("imagesrcset", "javascript:alert(1) 1x"),
    ).toBe(true);
    expect(
      isUnsafeUrlAttribute("imagesrcset", "https://safe.example/img.png 1x"),
    ).toBe(false);
  });
});
