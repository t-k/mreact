// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

async function renderServerPair(source: string, props?: Record<string, unknown>): Promise<string> {
  const base = {
    code: source,
    dev: true,
    filename: "App.tsx",
    target: "server" as const,
  };
  const stringOutput = transform(base);
  const streamOutput = transform({ ...base, serverOutput: "stream" });

  expect(stringOutput.diagnostics).toEqual([]);
  expect(streamOutput.diagnostics).toEqual([]);

  const stringHtml = runServerComponent(stringOutput.code, "App", props);
  const streamHtml = await runServerStreamComponent(streamOutput.code, "App", props);

  expect(streamHtml).toBe(stringHtml);
  return stringHtml;
}

function expectBrowserParserRoundTrip(html: string): void {
  const host = document.createElement("div");

  host.innerHTML = html;

  expect(host.innerHTML).toBe(html);
}

describe("server HTML parser round-trip invariants", () => {
  test("pre and textarea leading newlines survive browser parsing", async () => {
    const html = await renderServerPair(
      `export function App() {
  const value = "\\nfirst line";
  return <main><pre>{value}</pre><textarea value={value} /></main>;
}`,
    );

    expect(html).toBe("<main><pre>\nfirst line</pre><textarea>\nfirst line</textarea></main>");
    expectBrowserParserRoundTrip(html);
  });

  test("table sectioning and select value output are parser-stable", async () => {
    const html = await renderServerPair(
      `export function App(props) {
  return (
    <main>
      <table><tbody><tr><td>{props.cell}</td></tr></tbody></table>
      <select value={props.theme}>
        <option value="system">system</option>
        <option value="dark">dark</option>
      </select>
    </main>
  );
}`,
      { cell: "A&B", theme: "dark" },
    );

    expect(html).toBe(
      '<main><table><tbody><tr><td>A&amp;B</td></tr></tbody></table><select><option value="system">system</option><option value="dark" selected="">dark</option></select></main>',
    );
    expectBrowserParserRoundTrip(html);
  });

  test("root text, comment-like text, and sibling elements stay structurally stable", async () => {
    const html = await renderServerPair(
      `export function App() {
  const text = "<!--not a marker-->";
  return <>start{text}<span>after</span></>;
}`,
    );

    expect(html).toBe("start&lt;!--not a marker--&gt;<span>after</span>");
    expectBrowserParserRoundTrip(html);
  });

  test("script-closing and comment-opening text stays escaped and parser-stable", async () => {
    const html = await renderServerPair(
      `export function App() {
  const text = "</script><!--marker-->";
  return <main>{text}<span>after</span></main>;
}`,
    );

    expect(html).toBe("<main>&lt;/script&gt;&lt;!--marker--&gt;<span>after</span></main>");
    expectBrowserParserRoundTrip(html);
  });
});
