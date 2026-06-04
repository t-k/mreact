import { createElement } from "@reckona/mreact-compat";
import { describe, expect, test } from "vitest";
import { createStringSink } from "../src/index.js";
import {
  createEventHydrationManifest,
  html,
  renderEventHydrationManifest,
  renderScriptAsset,
  renderSsrState,
  renderToString,
  serializeSsrState,
} from "../src/html-helpers.js";

describe("server HTML helpers module", () => {
  test("renderScriptAsset preserves SRI defaults and escapes attributes", () => {
    const sink = createStringSink();

    renderScriptAsset(sink, {
      src: `/entry.js?name="app"`,
      integrity: `sha256-"digest"`,
      nonce: `nonce"1`,
    });

    expect(sink.toString()).toBe(
      `<script src="/entry.js?name=&quot;app&quot;" nonce="nonce&quot;1" integrity="sha256-&quot;digest&quot;" crossorigin="anonymous"></script>`,
    );
  });

  test("SSR state and event manifests use script-safe JSON", () => {
    const stateSink = createStringSink();
    const manifestSink = createStringSink();
    const manifest = createEventHydrationManifest([
      { id: "button", event: "click", handler: "onClick" },
    ]);

    renderSsrState(stateSink, { text: "</script>", line: "\u2028" }, { nonce: "n1" });
    renderEventHydrationManifest(manifestSink, manifest);

    expect(serializeSsrState({ text: "</script>" })).toBe(
      `{"text":"\\u003c/script>"}`,
    );
    expect(stateSink.toString()).toBe(
      `<script type="application/json" data-mreact-ssr-state nonce="n1">{"text":"\\u003c/script>","line":"\\u2028"}</script>`,
    );
    expect(manifestSink.toString()).toBe(
      `<script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"button","event":"click","handler":"onClick"}]}</script>`,
    );
  });

  test("SSR state serialization defuses hostile JSON payloads and remains parseable", () => {
    const payload = {
      comment: "<!--open comment",
      script: "</script><script>alert(1)</script>",
      lines: "\u2028\u2029",
      lone: "\uD800",
    };
    const serialized = serializeSsrState(payload);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<!--");
    expect(serialized).toContain("\\u003c!--open comment");
    expect(serialized).toContain("\\u2028\\u2029");
    expect(JSON.parse(serialized)).toEqual(payload);
  });

  test("renderToString and html render compat nodes through the helper module", async () => {
    const rendered = await renderToString((sink) => {
      sink.append("<p>stream</p>");
    });
    const response = html(createElement("main", { className: "page" }, "Hello"));

    expect(rendered).toBe("<p>stream</p>");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(response.text()).resolves.toBe(`<main class="page">Hello</main>`);
  });

  test("html serializes HTML void elements without closing tags", async () => {
    const response = html(
      createElement(
        "p",
        null,
        createElement("strong", null, "Company"),
        createElement("br"),
        "Address",
        createElement("br"),
        "Email",
      ),
    );

    await expect(response.text()).resolves.toBe(
      "<p><strong>Company</strong><br>Address<br>Email</p>",
    );
  });

  test("html omits dangerouslySetInnerHTML bodies on void elements", async () => {
    const response = html(
      createElement("img", {
        alt: "avatar",
        dangerouslySetInnerHTML: { __html: "<span>bad</span>" },
      }),
    );

    await expect(response.text()).resolves.toBe('<img alt="avatar">');
  });

  test("html preserves raw text inside script and style elements", async () => {
    const script = html(createElement("script", null, "if (a < b && c > d) {}"));
    const style = html(createElement("style", null, "a > b { color: red; }"));
    const escaped = html(createElement("div", null, "<img>"));

    await expect(script.text()).resolves.toBe("<script>if (a < b && c > d) {}</script>");
    await expect(style.text()).resolves.toBe("<style>a > b { color: red; }</style>");
    await expect(escaped.text()).resolves.toBe("<div>&lt;img&gt;</div>");
  });
});
