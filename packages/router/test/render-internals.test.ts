import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __composedRouteMetadataCacheKeyForTesting,
  __inlineCspTagsForTesting,
  __resetProductionRenderWarningsForTesting,
  __transformServerModuleForTesting,
  __warnProductionRenderWithoutPrebuiltModulesForTesting,
} from "../src/render.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  __resetProductionRenderWarningsForTesting();
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

  test("warns once per module when production uses the dynamic server transform path", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const serverModules = new Map([
      ["/app/other/page.tsx", { string: { code: "export {};", metadata: undefined, sourceHash: "x" } }],
    ]) as never;

    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>Dynamic</main>; }",
      filename: "/app/warn-once/page.tsx",
      serverModules,
      serverOutput: "string",
    });
    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>Dynamic</main>; }",
      filename: "/app/warn-once/page.tsx",
      serverModules,
      serverOutput: "string",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("dynamic server transform path ran in production"),
    );
    // The warning must identify the module, output mode, and why the prebuilt
    // artifact was not used so deployments can fix the actual gap.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/app/warn-once/page.tsx"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("string"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no prebuilt server module"));
  });

  test("does not warn at transform level when no prebuild map exists", () => {
    // Dev servers never pass serverModules and transform at request time by
    // design; per-module prebuild warnings only apply when a prebuild map was
    // provided but misses the module.
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>Dev</main>; }",
      filename: "/app/dev-mode/page.tsx",
      serverOutput: "string",
    });

    expect(warn).not.toHaveBeenCalled();
  });

  test("warns once for production renders without prebuilt modules unless dev", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    __warnProductionRenderWithoutPrebuiltModulesForTesting({ dev: true });
    expect(warn).not.toHaveBeenCalled();

    __warnProductionRenderWithoutPrebuiltModulesForTesting({
      serverModules: new Map() as never,
    });
    expect(warn).not.toHaveBeenCalled();

    __warnProductionRenderWithoutPrebuiltModulesForTesting({});
    __warnProductionRenderWithoutPrebuiltModulesForTesting({});

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("production render without prebuilt serverModules"),
    );
  });

  test("warns separately for each module missing a prebuilt artifact", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const serverModules = new Map([
      ["/app/other/page.tsx", { string: { code: "export {};", metadata: undefined, sourceHash: "x" } }],
    ]) as never;

    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>A</main>; }",
      filename: "/app/warn-a/page.tsx",
      serverModules,
      serverOutput: "string",
    });
    __transformServerModuleForTesting({
      code: "export default function Page() { return <main>B</main>; }",
      filename: "/app/warn-b/page.tsx",
      serverModules,
      serverOutput: "string",
    });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/app/warn-b/page.tsx"),
    );
  });

  test("explains stale and option-mismatch prebuilt artifacts in the dynamic transform warning", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const code = "export default function Page() { return <main>C</main>; }";

    __transformServerModuleForTesting({
      code,
      filename: "/app/warn-stale/page.tsx",
      serverModules: new Map([
        [
          "/app/warn-stale/page.tsx",
          {
            string: {
              code: "export {};",
              metadata: undefined,
              sourceHash: "different-hash",
            },
          },
        ],
      ]) as never,
      serverOutput: "string",
    });

    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("stale prebuilt server module"));

    __transformServerModuleForTesting({
      code,
      filename: "/app/warn-options/page.tsx",
      serverAwaitHydration: true,
      serverModules: new Map([
        [
          "/app/warn-options/page.tsx",
          {
            stream: {
              code: "export {};",
              metadata: undefined,
              sourceHash: "ignored",
            },
          },
        ],
      ]) as never,
      serverOutput: "stream",
    });

    expect(warn).toHaveBeenLastCalledWith(
      expect.stringContaining("serverAwaitHydration mismatch"),
    );
  });
});
