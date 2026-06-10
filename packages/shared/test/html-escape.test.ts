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
    expect(escapeHtmlAttribute(`Tom & <Ada> "Grace" 'Lovelace'`)).toBe(
      "Tom &amp; &lt;Ada&gt; &quot;Grace&quot; &#39;Lovelace&#39;",
    );
  });

  test("preserves the existing quoted-attribute route-id behavior", () => {
    expect(escapeHtmlQuotedAttribute(`<route & "id">`)).toBe(
      "<route &amp; &quot;id&quot;>",
    );
  });

  test("returns no-escape values without replaceAll passes", () => {
    const originalReplaceAll = String.prototype.replaceAll;
    let replaceAllCalls = 0;

    try {
      String.prototype.replaceAll = function countedReplaceAll(
        this: string,
        searchValue: string | RegExp,
        replaceValue: string,
      ): string {
        replaceAllCalls += 1;
        return originalReplaceAll.call(this, searchValue, replaceValue);
      };

      expect(escapeHtmlText("plain text")).toBe("plain text");
      expect(escapeHtmlAttribute("plain attribute")).toBe("plain attribute");
      expect(escapeHtmlQuotedAttribute("route-id")).toBe("route-id");
    } finally {
      String.prototype.replaceAll = originalReplaceAll;
    }

    expect(replaceAllCalls).toBe(0);
  });
});
