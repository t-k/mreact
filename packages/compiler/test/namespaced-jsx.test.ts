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
  return <svg><use xlink:href={href} xml:lang="en" /></svg>;
}`;

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
    expect(reactiveSvg.querySelector("use")?.getAttribute("xlink:href")).toBe("#icon");
    expect(reactiveSvg.querySelector("use")?.getAttribute("xml:lang")).toBe("en");
    expect(compatContainer.querySelector("use")?.getAttribute("xlink:href")).toBe("#icon");
    expect(compatContainer.querySelector("use")?.getAttribute("xml:lang")).toBe("en");
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
  });

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
