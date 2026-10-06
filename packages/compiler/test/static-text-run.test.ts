import { describe, expect, test } from "vitest";
import { staticTextSeparatedHtml } from "../src/emit-server-shared.js";

describe("fixed hydration text runs", () => {
  test("escapes fixed text and retains only nonempty text boundaries", () => {
    expect(
      staticTextSeparatedHtml([
        { kind: "text", value: "" },
        { kind: "text", value: "A&" },
        { kind: "expr", code: '""' },
        { kind: "expr", code: '"<\\\"B>"' },
      ]),
    ).toBe("A&amp;<!-- -->&lt;&quot;B&gt;");
    expect(staticTextSeparatedHtml([{ kind: "expr", code: '""' }])).toBe("");
  });

  test.each(["null", "false", "0", "[]", "{}", "read()", "'single quoted'", '"\\x41"'])(
    "leaves %s for runtime rendering without evaluating it",
    (code) => {
      expect(staticTextSeparatedHtml([{ kind: "expr", code }])).toBeUndefined();
    },
  );

  test.each(["html", "react-node", "compat-child", "server-render-value"] as const)(
    "retains %s rendering ownership",
    (renderMode) => {
      expect(
        staticTextSeparatedHtml([{ kind: "expr", code: '"<b>node</b>"', renderMode }]),
      ).toBeUndefined();
    },
  );

  test("leaves element children for their renderer", () => {
    expect(
      staticTextSeparatedHtml([{ kind: "element", tagName: "b", attributes: [], children: [] }]),
    ).toBeUndefined();
  });
});
