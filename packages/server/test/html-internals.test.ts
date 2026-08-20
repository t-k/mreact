import { describe, expect, test } from "vitest";
import { escapeAttribute, serializeScriptJson } from "../src/html-internals.js";

describe("server HTML internals", () => {
  test("escapes attribute and script JSON payloads byte-identically", () => {
    expect(escapeAttribute(`Tom & <Ada> "Grace"`)).toBe("Tom &amp; &lt;Ada&gt; &quot;Grace&quot;");
    expect(serializeScriptJson({ script: "</script>", line: "\u2028\u2029" })).toBe(
      `{"script":"\\u003c/script>","line":"\\u2028\\u2029"}`,
    );
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

      expect(escapeAttribute("plain attribute")).toBe("plain attribute");
      expect(serializeScriptJson({ ok: "plain" })).toBe(`{"ok":"plain"}`);
    } finally {
      String.prototype.replaceAll = originalReplaceAll;
    }

    expect(replaceAllCalls).toBe(0);
  });
});
