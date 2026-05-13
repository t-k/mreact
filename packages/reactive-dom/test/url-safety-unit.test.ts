import { describe, expect, test } from "vitest";
import {
  isSrcsetAttribute,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "../src/url-safety.js";

describe("reactive-dom url-safety: unit-level coverage", () => {
  test("isUrlAttribute and isSrcsetAttribute classify the known names", () => {
    expect(isUrlAttribute("href")).toBe(true);
    expect(isUrlAttribute("class")).toBe(false);
    expect(isSrcsetAttribute("srcset")).toBe(true);
    expect(isSrcsetAttribute("imagesrcset")).toBe(true);
    expect(isSrcsetAttribute("src")).toBe(false);
  });

  test("isUnsafeUrlAttribute on non-URL/non-srcset attribute is always false", () => {
    expect(isUnsafeUrlAttribute("class", "javascript:alert(1)")).toBe(false);
  });

  test("isUnsafeUrlAttribute treats relative or scheme-less URLs as safe", () => {
    expect(isUnsafeUrlAttribute("href", "/local/path")).toBe(false);
    expect(isUnsafeUrlAttribute("href", "")).toBe(false);
  });

  test("isUnsafeUrlAttribute flags javascript: / data: / vbscript: / livescript: / mhtml: / file:", () => {
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

  test("isUnsafeUrlAttribute allows data:image only on src and poster", () => {
    const dataImage = "data:image/png;base64,AAA";
    expect(isUnsafeUrlAttribute("src", dataImage)).toBe(false);
    expect(isUnsafeUrlAttribute("poster", dataImage)).toBe(false);
    expect(isUnsafeUrlAttribute("href", dataImage)).toBe(true);
  });

  test("isUnsafeUrlAttribute strips leading control bytes and tabs/newlines before scheme detection", () => {
    expect(isUnsafeUrlAttribute("href", "  \tjava\nscript:alert(1)")).toBe(true);
    expect(isUnsafeUrlAttribute("href", "JAVASCRIPT:alert(1)")).toBe(true);
  });

  test("isUnsafeUrlAttribute on srcset returns true when any candidate URL is unsafe", () => {
    const srcset =
      "https://safe.example/img.png 1x, javascript:alert(1) 2x, data:image/png;base64,AAA 3x";
    expect(isUnsafeUrlAttribute("srcset", srcset)).toBe(true);
  });

  test("isUnsafeUrlAttribute on srcset returns false when every candidate URL is safe", () => {
    const srcset =
      "https://safe.example/img.png 1x, /local/path 2x, , data:image/png;base64,AAA 3x";
    expect(isUnsafeUrlAttribute("srcset", srcset)).toBe(false);
  });

  test("isUnsafeUrlAttribute on imagesrcset honors the srcset path", () => {
    expect(isUnsafeUrlAttribute("imagesrcset", "javascript:alert(1) 1x")).toBe(true);
    expect(isUnsafeUrlAttribute("imagesrcset", "https://safe.example/img.png 1x")).toBe(false);
  });
});
