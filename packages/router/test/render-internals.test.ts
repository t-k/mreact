import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __composedRouteMetadataCacheKeyForTesting,
  __inlineCspTagsForTesting,
  __transformServerModuleForTesting,
} from "../src/render.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  vi.restoreAllMocks();
});

describe("router render internals", () => {
  test("extracts inline CSP tags with a linear scanner for unclosed tags", () => {
    const html = [
      "<main>",
      `<script>${"x".repeat(100_000)}`,
      '<style nonce="style-1">body{color:red}</style>',
      '<script type="application/json">{"ok":true}</script>',
      "</main>",
    ].join("");
    const startedAt = performance.now();

    const tags = __inlineCspTagsForTesting(html);

    expect(performance.now() - startedAt).toBeLessThan(50);
    expect(tags).toEqual([
      {
        attributes: new Map([["nonce", "style-1"]]),
        content: "body{color:red}",
        name: "style",
      },
      {
        attributes: new Map([["type", "application/json"]]),
        content: '{"ok":true}',
        name: "script",
      },
    ]);
  });

  test("keys composed route metadata cache by import policy", () => {
    const base = {
      appDir: "/app",
      code: "export const metadata = { title: 'A' };",
      define: undefined,
      filename: "/app/page.tsx",
      serverModuleCacheVersion: "v1",
      vitePlugins: undefined,
    };

    expect(
      __composedRouteMetadataCacheKeyForTesting({
        ...base,
        importPolicy: { allowedPackages: ["left"] },
      }),
    ).not.toBe(
      __composedRouteMetadataCacheKeyForTesting({
        ...base,
        importPolicy: { allowedPackages: ["right"] },
      }),
    );
  });

  test("warns once when production uses the dynamic server transform path", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>Dynamic</main>; }",
      filename: "/app/page.tsx",
      serverOutput: "string",
    });
    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>Dynamic</main>; }",
      filename: "/app/page.tsx",
      serverOutput: "string",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("dynamic server transform path ran in production"),
    );
  });
});
