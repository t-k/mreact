// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import {
  runClientComponent,
  runCompatComponent,
  runServerComponent,
  runServerStreamComponent,
} from "./helpers.js";

const source = `export function App() {
  const href = "#icon";
  const lang = "en";
  return <svg><use xlink:href={href} xml:lang={lang} /></svg>;
}`;
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

describe("namespaced JSX names", () => {
  test("preserves qualified attribute names on server string and stream output", async () => {
    const stringOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const streamOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "server",
      serverOutput: "stream",
      dev: false,
    });

    expect(stringOutput.diagnostics).toEqual([]);
    expect(streamOutput.diagnostics).toEqual([]);
    expect(runServerComponent(stringOutput.code)).toBe(
      '<svg><use xlink:href="#icon" xml:lang="en"></use></svg>',
    );
    await expect(runServerStreamComponent(streamOutput.code)).resolves.toBe(
      '<svg><use xlink:href="#icon" xml:lang="en"></use></svg>',
    );
  });

  test("preserves qualified attribute names on reactive and compat client output", async () => {
    const reactiveOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });
    const compatOutput = transform({
      code: source,
      filename: "App.tsx",
      target: "client",
      mode: "compat",
      dev: false,
    });

    expect(reactiveOutput.diagnostics).toEqual([]);
    expect(compatOutput.diagnostics).toEqual([]);
    expect(reactiveOutput.code).not.toContain("[object Object]");
    expect(compatOutput.code).not.toContain("[object Object]");

    const reactiveSvg = (await runClientComponent(reactiveOutput.code)) as SVGSVGElement;
    const compatContainer = await runCompatComponent(compatOutput.code);
    const reactiveUse = reactiveSvg.querySelector("use");
    const compatUse = compatContainer.querySelector("use");
    expect(reactiveUse?.getAttribute("xlink:href")).toBe("#icon");
    expect(reactiveUse?.getAttributeNS(XLINK_NAMESPACE, "href")).toBe("#icon");
    expect(reactiveUse?.getAttributeNS(XML_NAMESPACE, "lang")).toBe("en");
    expect(compatUse?.getAttribute("xlink:href")).toBe("#icon");
    expect(compatUse?.getAttributeNS(XLINK_NAMESPACE, "href")).toBe("#icon");
    expect(compatUse?.getAttribute("xml:lang")).toBe("en");
    expect(compatUse?.getAttributeNS(XML_NAMESPACE, "lang")).toBe("en");
  });

  test("preserves qualified attribute names in compat server mode", () => {
    const output = transform({
      code: `export function App() {
        return <svg><use xlink:href="#icon" xml:lang="en" /></svg>;
      }`,
      filename: "App.tsx",
      target: "server",
      mode: "compat",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("[object Object]");
    expect(runServerComponent(output.code)).toBe(
      '<svg><use xlink:href="#icon" xml:lang="en"></use></svg>',
    );
  });

  test("drops unsafe xlink:href values on server and reactive client output", async () => {
    const unsafeSource = `export function App() {
      const href = "javascript:alert(1)";
      return <svg><use xlink:href={href} /></svg>;
    }`;
    const serverOutput = transform({
      code: unsafeSource,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    const clientOutput = transform({
      code: unsafeSource,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(runServerComponent(serverOutput.code)).toBe("<svg><use></use></svg>");
    const svg = (await runClientComponent(clientOutput.code)) as SVGSVGElement;
    expect(svg.querySelector("use")?.hasAttribute("xlink:href")).toBe(false);
    expect(svg.querySelector("use")?.hasAttributeNS(XLINK_NAMESPACE, "href")).toBe(false);
  });

  test.each([
    { sourceHref: "javascript:alert(1)", unsafeHref: "javascript:alert(1)" },
    { sourceHref: "java\nscript:alert(1)", unsafeHref: "java\nscript:alert(1)" },
  ])(
    "drops static unsafe xlink:href $sourceHref from reactive client templates",
    async ({ sourceHref, unsafeHref }) => {
      const output = transform({
        code: `export function App() { return <svg><a xlink:href="${sourceHref}">x</a></svg>; }`,
        filename: "App.tsx",
        target: "client",
        dev: false,
      });

      expect(output.code).not.toContain(unsafeHref);
      const svg = (await runClientComponent(output.code)) as SVGSVGElement;
      expect(svg.querySelector("a")?.hasAttributeNS(XLINK_NAMESPACE, "href")).toBe(false);
    },
  );

  test("reports unsupported namespaced tag names without emitting a bare tag", () => {
    const output = transform({
      code: `export function App() { return <svg:circle r="1" />; }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "MR_UNSUPPORTED_JSX_NAMESPACE_TAG",
      }),
    );
    expect(output.code).not.toContain('return "<>"');
    expect(output.code).not.toContain('return "<></>"');
  });
});
