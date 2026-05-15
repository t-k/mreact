import { describe, expect, test } from "vitest";
import {
  escapeHtmlAttribute,
  escapeHtmlQuotedAttribute,
  escapeHtmlText,
} from "../src/html-escape.js";

describe("HTML escaping helpers", () => {
  test("escapes text context characters", () => {
    expect(escapeHtmlText(`Tom & <Ada> "Grace"`)).toBe(`Tom &amp; &lt;Ada&gt; "Grace"`);
  });

  test("escapes attribute context characters", () => {
    expect(escapeHtmlAttribute(`Tom & <Ada> "Grace"`)).toBe(
      "Tom &amp; &lt;Ada&gt; &quot;Grace&quot;",
    );
  });

  test("preserves the existing quoted-attribute route-id behavior", () => {
    expect(escapeHtmlQuotedAttribute(`<route & "id">`)).toBe(
      "<route &amp; &quot;id&quot;>",
    );
  });
});
