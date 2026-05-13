// Issue 085: emitted server-stream output for list children uses a
// local cons-string accumulator + single sink.append, not the older
// `.map().join("")` shape. These tests pin the new emit form so the
// performance change does not regress in future refactors.
//
// Behavior coverage of list semantics (escaping, index binding,
// destructuring body, conditional return) is already covered by
// server-stream-transform.test.ts via runtime-output assertions —
// here we only assert the *shape* of the emit for the pattern that
// drives the scale-curve improvement.
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("server stream list emit shape (issue 085)", () => {
  test("pure-string list uses local cons-string accumulator", () => {
    const output = transform({
      code: `export function App() {
        const items = [1, 2, 3];
        return <main>{items.map((i) => <span>{i}</span>)}</main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      serverOutput: "stream",
    });
    expect(output.diagnostics).toEqual([]);
    // Local accumulator + single sink.append("...listOut...") at the end.
    expect(output.code).toContain('let _listOut = "";');
    expect(output.code).toContain("for (let _i = 0, _len = _arr.length;");
    expect(output.code).toContain("_listOut +=");
    expect(output.code).toContain("$sink.append(_listOut);");
    // The deprecated `.map((..) => ...).join("")` shape must not
    // appear in the emitted code for this fixture.
    expect(output.code).not.toMatch(/\.map\(\(\w+\)\s*=>\s*"<span"[\s\S]*\)\.join\(""\)/);
  });

  test("adjacent static parts are coalesced before sink.append", () => {
    const output = transform({
      code: `export function App() {
        return <main><p>x</p></main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      serverOutput: "stream",
    });
    expect(output.diagnostics).toEqual([]);
    // `<main` + `>` are emitted as a single static — same for `<p` + `>`.
    expect(output.code).toContain('$sink.append("<main><p>x</p></main>");');
  });

  test("list with index binding uses _i as the index", () => {
    const output = transform({
      code: `export function App() {
        const items = ["a", "b"];
        return <ul>{items.map((item, index) => <li>{index}:{item}</li>)}</ul>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      serverOutput: "stream",
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const item = _arr[_i];");
    expect(output.code).toContain("const index = _i;");
  });
});
