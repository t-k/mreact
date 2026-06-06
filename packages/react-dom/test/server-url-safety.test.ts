import { createElement } from "@reckona/mreact-compat";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "../src/server.js";

describe("react-dom/server URL safety", () => {
  test("drops unsafe javascript href values", () => {
    const html = renderToStaticMarkup(
      createElement("a", { href: "javascript:alert(1)" }, "profile"),
    );

    expect(html).toBe("<a>profile</a>");
    expect(html).not.toMatch(/javascript:/i);
  });

  test("drops unsafe formaction values", () => {
    const html = renderToStaticMarkup(
      createElement("button", { formAction: "java\tscript:alert(1)" }, "go"),
    );

    expect(html).toBe("<button>go</button>");
    expect(html).not.toMatch(/javascript:/i);
  });

  test("drops unsafe meta refresh content", () => {
    const html = renderToStaticMarkup(
      createElement("meta", {
        content: "0;url=javascript:alert(1)",
        httpEquiv: "refresh",
      }),
    );

    expect(html).toBe('<meta http-equiv="refresh"/>');
    expect(html).not.toMatch(/javascript:/i);
  });

  test("keeps safe URL attributes", () => {
    expect(
      renderToStaticMarkup(createElement("a", { href: "https://example.com/" }, "safe")),
    ).toBe('<a href="https://example.com/">safe</a>');
  });
});
