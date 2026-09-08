import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

function compileServer(code: string, serverOutput: "string" | "stream"): string {
  const output = transform({ code, filename: "App.tsx", target: "server", serverOutput, dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

const LOCAL_LINK_WITH_CHILDREN = `function Link(props) {
  return <a href={props.href}>{props.children}</a>;
}
export function App(props) {
  return <nav><Link href={props.href}>{props.label}</Link></nav>;
}`;

const LOCAL_LINK_IN_LIST = `function Link(props) {
  return <a href={props.href}>go</a>;
}
export function App(props) {
  return <ul>{props.rows.map((row) => <li><Link href={row.href} /></li>)}</ul>;
}`;

describe("compiler router Link binding identity", () => {
  test("renders a module-local Link that has children", async () => {
    const props = { href: "/next", label: "Next" };
    const expected = '<nav><a href="/next">Next</a></nav>';

    // `trustedHtml` exists only on the router's own export, so wrapping the
    // children of a plain local function in it throws at render time.
    expect(runServerComponent(compileServer(LOCAL_LINK_WITH_CHILDREN, "string"), "App", props)).toBe(
      expected,
    );
    await expect(
      runServerStreamComponent(compileServer(LOCAL_LINK_WITH_CHILDREN, "stream"), "App", props),
    ).resolves.toBe(expected);
  });

  test("calls a module-local Link in a string position through the sink", () => {
    const code = compileServer(LOCAL_LINK_IN_LIST, "stream");

    // Only the router Link returns its markup from a one-argument call. A local
    // component is compiled as `Link($sink, props)`, so inlining it with the
    // string convention hands the props object over as the sink.
    expect(code).toContain("await Link($sink,");
    expect(code).not.toContain("_listOut += ((_value)");
  });

  test("renders a module-local Link in a list", async () => {
    const props = { rows: [{ href: "/a" }, { href: "/b" }] };
    const expected = '<ul><li><a href="/a">go</a></li><li><a href="/b">go</a></li></ul>';

    expect(runServerComponent(compileServer(LOCAL_LINK_IN_LIST, "string"), "App", props)).toBe(
      expected,
    );
    await expect(
      runServerStreamComponent(compileServer(LOCAL_LINK_IN_LIST, "stream"), "App", props),
    ).resolves.toBe(expected);
  });

  test("keeps the router Link fast paths for every binding that reaches its export", () => {
    const bound: [string, string, string][] = [
      [
        "named import",
        `import { Link } from "@reckona/mreact-router";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
        "Link.trustedHtml(",
      ],
      [
        "named import from the link entry",
        `import { Link } from "@reckona/mreact-router/link";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
        "Link.trustedHtml(",
      ],
      [
        "renamed import",
        `import { Link as RouterLink } from "@reckona/mreact-router";
export function App(props) { return <nav><RouterLink href={props.href}>{props.label}</RouterLink></nav>; }`,
        "RouterLink.trustedHtml(",
      ],
      [
        "namespace import",
        `import * as Router from "@reckona/mreact-router";
export function App(props) { return <nav><Router.Link href={props.href}>{props.label}</Router.Link></nav>; }`,
        "Router.Link.trustedHtml(",
      ],
    ];

    for (const [scenario, source, marker] of bound) {
      expect(compileServer(source, "string"), scenario).toContain(marker);
      expect(compileServer(source, "stream"), scenario).toContain(marker);
    }
  });

  test("keeps every binding that does not reach the router Link export off its paths", () => {
    const unbound: [string, string][] = [
      [
        "Link imported from another module",
        `import { Link } from "./link.js";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
      ],
      [
        "another router export aliased to Link",
        `import { linkProps as Link } from "@reckona/mreact-router";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
      ],
      [
        "default import from the router entry",
        `import Link from "@reckona/mreact-router";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
      ],
      [
        "type-only import declaration",
        `import type { Link } from "@reckona/mreact-router";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
      ],
      [
        "inline type-only specifier",
        `import { type Link } from "@reckona/mreact-router";
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
      ],
      [
        "named import shadowed by a local binding",
        `import { Link } from "@reckona/mreact-router";
export function App(props) {
  const Link = (inner) => <b>{inner.children}</b>;
  return <nav><Link href={props.href}>{props.label}</Link></nav>;
}`,
      ],
      [
        "namespace import shadowed by a local binding",
        `import * as Router from "@reckona/mreact-router";
export function App(props) {
  const Router = { Link: (inner) => <b>{inner.children}</b> };
  return <nav><Router.Link href={props.href}>{props.label}</Router.Link></nav>;
}`,
      ],
    ];

    // A type-only import contributes no runtime binding, and the last two shapes
    // resolve to the local binding inside the component rather than the import.
    for (const [scenario, source] of unbound) {
      expect(compileServer(source, "string"), scenario).not.toContain("trustedHtml(");
      expect(compileServer(source, "stream"), scenario).not.toContain("trustedHtml(");
    }
  });

  test("keeps a local component off the router Link paths whatever it is called", () => {
    const shadowing: [string, string][] = [
      [
        "local declaration named Link",
        LOCAL_LINK_WITH_CHILDREN,
      ],
      [
        "local component aliased to Link",
        `function Anchor(props) { return <a href={props.href}>{props.children}</a>; }
const Link = Anchor;
export function App(props) { return <nav><Link href={props.href}>{props.label}</Link></nav>; }`,
      ],
      [
        "local binding shadowing a router import",
        `import { Link as RouterLink } from "@reckona/mreact-router";
function Link(props) { return <a href={props.href}>{props.children}</a>; }
export function App(props) {
  return <nav><Link href={props.href}>{props.label}</Link><RouterLink href="/r">r</RouterLink></nav>;
}`,
      ],
    ];

    // The boundary matters: a module may hold both a local `Link` and a renamed
    // router import, and only the latter may reach `trustedHtml`.
    const localLinkTrustedHtml = /(?<![\w$.])Link\.trustedHtml\(/u;

    for (const [scenario, source] of shadowing) {
      expect(compileServer(source, "string"), scenario).not.toMatch(localLinkTrustedHtml);
      expect(compileServer(source, "stream"), scenario).not.toMatch(localLinkTrustedHtml);
    }
  });
});
