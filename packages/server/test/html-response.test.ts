import { describe, expect, test } from "vitest";
import { createElement, Suspense } from "@modular-react/react-compat";
import { html } from "../src/index.js";

describe("Next-style HTML response", () => {
  test("renders JSX-like nodes to a Response stream", async () => {
    const response = html(
      createElement("main", null, createElement("h1", null, "mreact streaming route")),
    );

    await expect(response.text()).resolves.toBe(
      "<main><h1>mreact streaming route</h1></main>",
    );
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  test("streams async Suspense children with React-compatible reveal markers", async () => {
    function StreamedContent() {
      return Promise.resolve(createElement("p", { "data-state": "ready" }, "ready"));
    }

    const response = html(
      createElement(
        "main",
        null,
        createElement(
          Suspense,
          {
            fallback: createElement("p", { "data-state": "fallback" }, "loading"),
          },
          createElement(StreamedContent, null),
        ),
      ),
    );

    const body = await response.text();

    expect(body).toContain("<!--$?-->");
    expect(body).toContain('<p data-state="fallback">loading</p>');
    expect(body).toContain('<!--/$--></main><div hidden id="');
    expect(body).toContain('<p data-state="ready">ready</p>');
    expect(body).toContain("self.$RC=");
  });
});
