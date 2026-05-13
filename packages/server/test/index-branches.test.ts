import { createElement } from "@modular-react/react-compat";
import { describe, expect, test } from "vitest";
import {
  createStringSink,
  html,
  renderAsyncBoundary,
  renderToReadableStream,
  renderToString,
  Suspense,
} from "../src/index.js";

describe("@modular-react/server: edge branches in index.ts", () => {
  test("html() preserves boolean true attributes without value", async () => {
    const response = html(
      createElement("input", { type: "checkbox", disabled: true }),
    );
    const body = await response.text();
    expect(body).toContain("<input");
    expect(body).toContain("disabled");
    expect(body).not.toContain('disabled="true"');
  });

  test("html() drops attributes that fail the attribute-name allow-list", async () => {
    const response = html(
      createElement("div", { "1bad-name": "x", hidden: false, className: "ok" }),
    );
    const body = await response.text();
    expect(body).toContain('class="ok"');
    expect(body).not.toContain("hidden");
    expect(body).not.toContain("1bad-name");
  });

  test("html() drops srcdoc unless the value uses the __html opt-in", async () => {
    const dropped = await html(
      createElement("iframe", { srcdoc: "<script>1</script>" }),
    ).text();
    expect(dropped).toContain("<iframe");
    expect(dropped).not.toContain("srcdoc=");

    const kept = await html(
      createElement("iframe", { srcdoc: { __html: "<p>hi</p>" } }),
    ).text();
    expect(kept).toContain('srcdoc="&lt;p&gt;hi&lt;/p&gt;"');
  });

  test("html() strips unsafe meta-refresh content (issue 078 / 062 path)", async () => {
    const body = await html(
      createElement("meta", {
        "http-equiv": "refresh",
        content: "0;url=javascript:alert(1)",
      }),
    ).text();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).not.toContain("javascript:alert(1)");
    expect(body).not.toContain("content=");
  });

  test("html() drops attributes whose value is a function or null", async () => {
    const body = await html(
      createElement("button", {
        onClick: () => {},
        nullish: null,
      }),
    ).text();
    expect(body).toContain("<button");
    expect(body).not.toContain("onClick");
    expect(body).not.toContain("nullish");
  });

  test("html() normalizes className -> class and htmlFor -> for", async () => {
    const body = await html(
      createElement("label", { htmlFor: "name", className: "tag" }),
    ).text();
    expect(body).toContain('class="tag"');
    expect(body).toContain('for="name"');
    expect(body).not.toContain("htmlFor");
    expect(body).not.toContain("className");
  });

  test("renderToReadableStream surfaces synchronous render throws via controller.error", async () => {
    const stream = renderToReadableStream(() => {
      throw new Error("boom from render");
    });
    const reader = stream.getReader();
    await expect(reader.read()).rejects.toThrow("boom from render");
  });

  test("renderAsyncBoundary without a catch handler propagates the rejection to the awaiter", async () => {
    const sink = createStringSink();
    await expect(
      renderAsyncBoundary(
        sink,
        Promise.reject(new Error("load failed")),
        () => {},
      ),
    ).rejects.toThrow("load failed");
  });

  test("renderToString awaits asynchronous appends inside the render callback", async () => {
    const body = await renderToString(async (sink) => {
      await Promise.resolve();
      sink.append("<p>hi</p>");
    });
    expect(body).toBe("<p>hi</p>");
  });

  test("Suspense with synchronous children emits an in-place React-style boundary", async () => {
    const body = await html(
      createElement(
        "main",
        null,
        createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement("p", null, "ready"),
        ),
      ),
    ).text();

    // Synchronous children produce the in-place reveal markers (no out-of-order
    // template fragment is emitted because nothing was deferred).
    expect(body).toContain("<!--$-->");
    expect(body).toContain("<p>ready</p>");
    expect(body).toContain("<!--/$-->");
    expect(body).not.toContain('data-state="fallback"');
  });

});
