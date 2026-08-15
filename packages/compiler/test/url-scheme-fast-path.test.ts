import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

function compileServer(code: string): string {
  const output = transform({
    code,
    filename: "page.tsx",
    target: "server",
  });
  return output.code;
}

function compileServerStream(code: string): string {
  const output = transform({
    code,
    filename: "page.tsx",
    target: "server",
    serverOutput: "stream",
  });
  return output.code;
}

async function evaluateCompiled(code: string): Promise<Record<string, unknown>> {
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return (await import(dataUrl)) as Record<string, unknown>;
}

describe("compiler-emitted SSR URL scheme safety (Issue 073)", () => {
  test("dynamic href={...} drops javascript: scheme", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a href={url}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "javascript:alert(1)" });
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("alert(1)");
  });

  test("dynamic URL object href drops javascript: scheme", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a href={url}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: URL }) => string;
    const out = Page({ url: new URL("javascript:alert(1)") });
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("alert(1)");
  });

  test("spread href drops javascript: scheme", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a {...{ href: url, title: "safe" }}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "javascript:alert(1)" });
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain('title="safe"');
  });

  test("spread URL object href drops javascript: scheme", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a {...{ href: url }}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: URL }) => string;
    const out = Page({ url: new URL("javascript:alert(1)") });
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("alert(1)");
  });

  test("spread srcdoc only emits explicit __html values", async () => {
    const code = compileServer(
      `export default function Page({ html }) { return <iframe {...{ srcDoc: html }} />; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { html: unknown }) => string;
    expect(Page({ html: "<script>alert(1)</script>" })).toBe("<iframe></iframe>");
    expect(Page({ html: { __html: "<p>safe</p>" } })).toBe(
      '<iframe srcdoc="&lt;p&gt;safe&lt;/p&gt;"></iframe>',
    );
    expect(Page({ html: { __html: "<p>extra</p>", revision: 2 } })).toBe(
      '<iframe srcdoc="&lt;p&gt;extra&lt;/p&gt;"></iframe>',
    );
    expect(
      Page({
        html: Object.defineProperty({}, "__html", { get: () => "<p>getter</p>" }),
      }),
    ).toBe("<iframe></iframe>");
  });

  test("dynamic href={...} preserves https URLs", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a href={url}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "https://example.com/path" });
    expect(out).toContain('href="https://example.com/path"');
  });

  test("dynamic src={...} drops data:text/html on iframe", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <iframe src={url} />; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "data:text/html,<script>alert(1)</script>" });
    expect(out).not.toContain("data:text/html");
  });

  test("dynamic src={...} keeps data:image on img", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <img src={url} alt="x" />; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "data:image/png;base64,iVBORw0KGgo=" });
    expect(out).toContain("data:image/png");
  });

  test("dynamic src={...} drops data:image/svg+xml on img", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <img src={url} alt="x" />; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    for (const url of [
      "data:image/svg+xml,<svg><script>alert(1)</script></svg>",
      "data:image/SVG+XML ,<svg><script>alert(1)</script></svg>",
      "data:image/svg+xml ;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+",
    ]) {
      expect(Page({ url }), url).not.toContain("data:image");
    }
  });

  test("dynamic formaction={...} drops javascript:", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <button formaction={url}>go</button>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "javascript:alert(1)" });
    expect(out).not.toContain("javascript:");
  });

  test("dynamic srcset and object URL attributes drop unsafe schemes", async () => {
    const code = compileServer(
      `export default function Page({ url, srcset }) {
        return <main><img srcSet={srcset} imageSrcSet={srcset} /><object data={url} codebase={url}></object></main>;
      }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { srcset: string; url: string }) => string;
    const out = Page({
      srcset: "/safe.png 1x, javascript:alert(1) 2x",
      url: "javascript:alert(2)",
    });

    expect(out).not.toMatch(/javascript:|alert\(/i);
    expect(
      Page({ srcset: "/safe.png 1x, https://example.test/a.png 2x", url: "/plugin.swf" }),
    ).toContain('data="/plugin.swf"');
  });

  test("dynamic URL object srcset and object URL attributes drop unsafe schemes", async () => {
    const code = compileServer(
      `export default function Page({ url, srcset }) {
        return <main><img srcSet={srcset} /><object data={url}></object></main>;
      }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { srcset: URL; url: URL }) => string;
    const out = Page({
      srcset: new URL("javascript:alert(1)"),
      url: new URL("javascript:alert(2)"),
    });

    expect(out).not.toMatch(/javascript:|alert\(/i);
  });

  test("spread srcset and object URL attributes drop unsafe schemes", async () => {
    const code = compileServer(
      `export default function Page({ url, srcset }) {
        return <main><img {...{ srcSet: srcset, imageSrcSet: srcset }} /><object {...{ data: url, codebase: url }}></object></main>;
      }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { srcset: string; url: string }) => string;
    const out = Page({
      srcset: "/safe.png 1x, javascript:alert(1) 2x",
      url: "data:text/html,<script>alert(2)</script>",
    });

    expect(out).not.toMatch(/javascript:|data:text\/html|alert\(/i);
  });

  test("dynamic vbscript: scheme is dropped", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a href={url}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "vbscript:MsgBox(1)" });
    expect(out).not.toContain("vbscript:");
  });

  test("dynamic href with leading whitespace before javascript: is dropped", async () => {
    const code = compileServer(
      `export default function Page({ url }) { return <a href={url}>x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;
    const out = Page({ url: "  \tjavascript:alert(1)" });
    expect(out).not.toMatch(/javascript:/i);
  });

  test('static href="javascript:..." is dropped at compile time', async () => {
    const code = compileServer(
      `export default function Page() { return <a href="javascript:alert(1)">x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as () => string;
    const out = Page();
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("alert(1)");
  });

  test("static srcset and object URL attributes drop unsafe schemes at compile time", async () => {
    const code = compileServer(
      `export default function Page() {
        return <main><img srcSet="/safe.png 1x, javascript:alert(1) 2x" imageSrcSet="javascript:alert(2) 1x" /><object data="javascript:alert(3)" codebase="data:text/html,<script>alert(4)</script>"></object></main>;
      }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as () => string;
    const out = Page();

    expect(out).not.toMatch(
      /srcset|imagesrcset|data=|codebase=|javascript:|data:text\/html|alert\(/i,
    );
  });

  test("non-URL attributes are unaffected", async () => {
    const code = compileServer(
      `export default function Page({ title }) { return <div title={title}>x</div>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { title: string }) => string;
    const out = Page({ title: "javascript:alert(1)" });
    // The title attribute should keep the value (escaped). Only the
    // navigation/script-sink attributes are filtered.
    expect(out).toContain('title="javascript:alert(1)"');
  });

  test("body-statement JSX variables drop unsafe URL attributes", async () => {
    const code = compileServer(
      `export default function Page({ url }) { const link = <a href={url}>x</a>; return <div>{link}</div>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { url: string }) => string;

    expect(Page({ url: "javascript:alert(1)" })).not.toMatch(/javascript:|alert\(1\)/i);
    expect(Page({ url: "https://example.com/ok" })).toContain('href="https://example.com/ok"');
  });

  test("body-statement JSX variables drop dynamic srcdoc without explicit opt-in", async () => {
    const code = compileServer(
      `export default function Page({ html }) { const frame = <iframe srcdoc={html}></iframe>; return <div>{frame}</div>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as (props: { html: unknown }) => string;

    expect(Page({ html: "<img src=x onerror=alert(1)>" })).toBe("<div><iframe></iframe></div>");
    expect(Page({ html: { __html: "<p>safe</p>" } })).toContain('srcdoc="&lt;p&gt;safe&lt;/p&gt;"');
  });

  test("server stream body-statement JSX variables drop unsafe URL attributes", async () => {
    const code = compileServerStream(
      `export function App(sink, url) { const link = <a href={url}>x</a>; return <div>{link}</div>; }`,
    );

    expect(code).toContain("_urlAttrSafe");
    expect(code).not.toContain("href={url}");
  });

  test("server stream emit guards srcset and object URL attributes", async () => {
    const code = compileServerStream(
      `export function App(sink, url, srcset) {
        return <main><img srcSet={srcset} imageSrcSet="javascript:alert(1) 1x" /><object data={url} codebase="data:text/html,<script>alert(2)</script>"></object></main>;
      }`,
    );

    expect(code).toContain("_urlAttrSafe");
    expect(code).toContain("srcset");
    expect(code).not.toContain("javascript:alert(1)");
    expect(code).not.toContain("data:text/html");
  });
});
