import { parseFragment } from "parse5";
import { describe, expect, test } from "vitest";
import { hasNavigationRouteMarker } from "../src/navigation-marker.js";

interface ParsedHtmlNode {
  attrs?: readonly { name: string }[] | undefined;
  childNodes?: readonly ParsedHtmlNode[] | undefined;
}

function parsedFragmentHasNavigationRouteMarker(html: string): boolean {
  const fragment = parseFragment(html) as ParsedHtmlNode;
  const visit = (node: ParsedHtmlNode): boolean =>
    node.attrs?.some((attribute) => attribute.name === "data-mreact-route-id") === true ||
    node.childNodes?.some(visit) === true;

  return visit(fragment);
}

describe("navigation route marker validation", () => {
  test.each([
    '<div data-mreact-route-id="index"></div>',
    "<section data-mreact-route-id='nested'></section>",
    "<main data-mreact-route-id=docs></main>",
    '<main class="page"\n DATA-MREACT-ROUTE-ID="docs/getting-started"></main>',
    '<script></script><div data-mreact-route-id="after-script"></div>',
    '<script><!--<script></script>text</script><div data-mreact-route-id="after"></div>',
    "<script><!--<script>--></script><div data-mreact-route-id=x></script>",
    '<svg><![CDATA[<div data-mreact-route-id="cdata">]]></svg><div data-mreact-route-id="after"></div>',
    "<!--><div data-mreact-route-id=after-abrupt-comment></div>",
    "<!---><div data-mreact-route-id=after-abrupt-dash-comment></div>",
    "<![CDATA[bogus><div data-mreact-route-id=after-bogus-comment></div>",
    '<div"unterminated><div data-mreact-route-id=after-quoted-tag-name></div>',
    '<div attribute"unterminated><div data-mreact-route-id=after-quoted-attribute-name></div>',
    "<svg><title><div data-mreact-route-id=svg-title></div></title></svg>",
    "<svg><style><div data-mreact-route-id=svg-style></div></style></svg>",
  ])("accepts a value-bearing marker attribute on a start tag: %s", (html) => {
    expect(hasNavigationRouteMarker(html)).toBe(true);
  });

  test.each([
    '<!-- <div data-mreact-route-id="comment"> -->',
    '&lt;div data-mreact-route-id="text">',
    '<main data-note="data-mreact-route-id=other"></main>',
    '<script>const html = `<div data-mreact-route-id="script">`;</script>',
    '<style>data-mreact-route-id="style" { color: red; }</style>',
    '<main data-mreact-route-id-other="similar"></main>',
    "<main data-mreact-route-id></main>",
    '<main data-mreact-route-id=""></main>',
    "<main data-mreact-route-id=''></main>",
    '<main data-mreact-route-id="unterminated></main>',
    "<main data-mreact-route-id=>content</main>",
    "<1 data-mreact-route-id=x>",
    "<svg><![CDATA[> <div data-mreact-route-id=x>]]></svg>",
    "<script><!--<script></script><div data-mreact-route-id=x></script>",
    "<template><div data-mreact-route-id=nested-template></div></template>",
    "<template><template></template><div data-mreact-route-id=nested-template></div></template>",
    "<html data-mreact-route-id=html></html>",
    "<head data-mreact-route-id=head></head>",
    "<body data-mreact-route-id=body></body>",
    "<frameset data-mreact-route-id=frameset></frameset>",
  ])("rejects text that is not a valid value-bearing marker attribute: %s", (html) => {
    expect(hasNavigationRouteMarker(html)).toBe(false);
  });

  test.each([
    "<!--><div data-mreact-route-id=after-abrupt-comment></div>",
    "<!---><div data-mreact-route-id=after-abrupt-dash-comment></div>",
    "<![CDATA[bogus><div data-mreact-route-id=after-bogus-comment></div>",
    '<div"unterminated><div data-mreact-route-id=after-quoted-tag-name></div>',
    '<div attribute"unterminated><div data-mreact-route-id=after-quoted-attribute-name></div>',
    "<svg><title><div data-mreact-route-id=svg-title></div></title></svg>",
    "<svg><style><div data-mreact-route-id=svg-style></div></style></svg>",
    "<template><div data-mreact-route-id=nested-template></div></template>",
    "<template><template></template><div data-mreact-route-id=nested-template></div></template>",
    "<html data-mreact-route-id=html></html>",
    "<head data-mreact-route-id=head></head>",
    "<body data-mreact-route-id=body></body>",
    "<frameset data-mreact-route-id=frameset></frameset>",
  ])("agrees with an HTML fragment parser for a reported edge case: %s", (html) => {
    expect(hasNavigationRouteMarker(html)).toBe(parsedFragmentHasNavigationRouteMarker(html));
  });
});
