import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  escapeHtmlAttribute,
  escapeHtmlQuotedAttribute,
  escapeHtmlText,
} from "../src/html-escape.js";

describe("HTML escaping helpers", () => {
  const escapeWith = (value: string, replacements: Readonly<Record<string, string>>): string =>
    Array.from(value, (character) => replacements[character] ?? character).join("");

  test("escapes text context characters", () => {
    expect(escapeHtmlText(`Tom & <Ada> "Grace"`)).toBe(`Tom &amp; &lt;Ada&gt; "Grace"`);
  });

  test("escapes attribute context characters", () => {
    expect(escapeHtmlAttribute(`Tom & <Ada> "Grace" 'Lovelace'`)).toBe(
      "Tom &amp; &lt;Ada&gt; &quot;Grace&quot; &#39;Lovelace&#39;",
    );
  });

  test("preserves the existing quoted-attribute route-id behavior", () => {
    expect(escapeHtmlQuotedAttribute(`<route & "id">`)).toBe("<route &amp; &quot;id&quot;>");
  });

  test("escapes values made entirely of context-sensitive characters", () => {
    expect(escapeHtmlText("&<>")).toBe("&amp;&lt;&gt;");
    expect(escapeHtmlAttribute(`"&'<>`)).toBe("&quot;&amp;&#39;&lt;&gt;");
    expect(escapeHtmlQuotedAttribute('"&')).toBe("&quot;&amp;");
  });

  test("returns no-escape values without replaceAll passes", () => {
    const originalReplaceAll = String.prototype.replaceAll;
    let replaceAllCalls = 0;

    try {
      String.prototype.replaceAll = function countedReplaceAll(
        this: string,
        searchValue: string | RegExp,
        replaceValue: string | ((substring: string, ...args: unknown[]) => string),
      ): string {
        replaceAllCalls += 1;
        return typeof replaceValue === "string"
          ? originalReplaceAll.call(this, searchValue, replaceValue)
          : originalReplaceAll.call(this, searchValue, replaceValue);
      };

      expect(escapeHtmlText("plain text")).toBe("plain text");
      expect(escapeHtmlAttribute("plain attribute")).toBe("plain attribute");
      expect(escapeHtmlQuotedAttribute("route-id")).toBe("route-id");
    } finally {
      String.prototype.replaceAll = originalReplaceAll;
    }

    expect(replaceAllCalls).toBe(0);
  });

  test("matches independent escaping rules for arbitrary Unicode strings", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(escapeHtmlText(value)).toBe(
          escapeWith(value, { "&": "&amp;", "<": "&lt;", ">": "&gt;" }),
        );
        expect(escapeHtmlAttribute(value)).toBe(
          escapeWith(value, {
            '"': "&quot;",
            "&": "&amp;",
            "'": "&#39;",
            "<": "&lt;",
            ">": "&gt;",
          }),
        );
        expect(escapeHtmlQuotedAttribute(value)).toBe(
          escapeWith(value, { '"': "&quot;", "&": "&amp;" }),
        );
      }),
      { numRuns: 500, seed: 20_260_833 },
    );
  });

  test("preserves concatenation for every escaping context", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        expect(escapeHtmlText(left + right)).toBe(escapeHtmlText(left) + escapeHtmlText(right));
        expect(escapeHtmlAttribute(left + right)).toBe(
          escapeHtmlAttribute(left) + escapeHtmlAttribute(right),
        );
        expect(escapeHtmlQuotedAttribute(left + right)).toBe(
          escapeHtmlQuotedAttribute(left) + escapeHtmlQuotedAttribute(right),
        );
      }),
      { numRuns: 500, seed: 20_260_834 },
    );
  });
});
