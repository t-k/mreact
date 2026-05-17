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
    const out = Page({ url: "data:image/svg+xml,<svg><script>alert(1)</script></svg>" });
    expect(out).not.toContain("data:image/svg+xml");
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

  test("static href=\"javascript:...\" is dropped at compile time", async () => {
    const code = compileServer(
      `export default function Page() { return <a href="javascript:alert(1)">x</a>; }`,
    );
    const mod = await evaluateCompiled(code);
    const Page = mod.default as () => string;
    const out = Page();
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("alert(1)");
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
});
