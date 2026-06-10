import { describe, expect, test } from "vitest";
import type { BuiltServerModuleArtifact } from "../src/build.js";
import {
  importPolicyCacheKey,
  memoizedHashText,
  prebuiltRequestModuleArtifact,
  prebuiltRouteLoaderModuleArtifact,
  prebuiltServerComponentModuleCode,
  prebuiltServerModuleOutputMatches,
} from "../src/route-module-loader.js";

describe("router route module loader contract", () => {
  test("hashes source text with a stable short digest", () => {
    expect(memoizedHashText("export default 1")).toBe(memoizedHashText("export default 1"));
    expect(memoizedHashText("export default 1")).toMatch(/^[a-f0-9]{16}$/);
    expect(memoizedHashText("export default 1")).not.toBe(memoizedHashText("export default 2"));
  });

  test("selects prebuilt request and metadata artifacts only when source hashes match", () => {
    const source = "export const metadata = { title: 'Docs' }";
    const request = { code: "request", sourceHash: memoizedHashText(source) };
    const routeMetadata = { code: "metadata", sourceHash: memoizedHashText(source) };
    const modules = new Map<string, BuiltServerModuleArtifact>([
      ["/app/docs/page.tsx", { request, routeMetadata }],
      ["/app/stale/page.tsx", { request: { code: "stale", sourceHash: "stale" } }],
    ]);

    expect(prebuiltRequestModuleArtifact(modules, "/app/docs/page.tsx", source)).toBe(request);
    expect(
      prebuiltRequestModuleArtifact(modules, "/app/docs/page.tsx", source, "routeMetadata"),
    ).toBe(routeMetadata);
    expect(prebuiltRequestModuleArtifact(modules, "/app/stale/page.tsx", source)).toBeUndefined();
  });

  test("prefers loader artifacts and falls back to request artifacts for route data", () => {
    const source = "export async function loader() {}";
    const request = { code: "request", sourceHash: memoizedHashText(source) };
    const loader = { code: "loader", sourceHash: memoizedHashText(source) };

    expect(
      prebuiltRouteLoaderModuleArtifact(
        new Map([["/app/page.tsx", { loader, request }]]),
        "/app/page.tsx",
        source,
      ),
    ).toBe(loader);
    expect(
      prebuiltRouteLoaderModuleArtifact(
        new Map([["/app/page.tsx", { request }]]),
        "/app/page.tsx",
        source,
      ),
    ).toBe(request);
  });

  test("matches prebuilt server component outputs by source hash or emitted code", () => {
    const source = "export default function Page() {}";
    const hash = memoizedHashText(source);

    expect(
      prebuiltServerModuleOutputMatches({ code: "compiled", sourceHash: hash }, source, hash),
    ).toBe(true);
    expect(
      prebuiltServerModuleOutputMatches({ code: source, sourceHash: "older" }, source, hash),
    ).toBe(true);
    expect(
      prebuiltServerComponentModuleCode(
        { bundleCode: "bundle", code: "compiled", sourceHash: hash },
        source,
        hash,
      ),
    ).toBe("bundle");
    expect(
      prebuiltServerComponentModuleCode(
        { bundleCode: "bundle", code: "compiled", sourceHash: "older" },
        source,
        hash,
      ),
    ).toBeUndefined();
    expect(
      prebuiltServerComponentModuleCode(
        {
          bundleCode: "bundle",
          code: "compiled",
          metadata: {
            compiler: { frontend: "oxc", typescriptFallback: false },
            components: [],
            filename: "page.tsx",
            imports: [],
            serverAwaitHydration: true,
            serverOutput: "stream",
            target: "server",
          },
          sourceHash: hash,
        },
        source,
        hash,
      ),
    ).toBeUndefined();
    expect(
      prebuiltServerComponentModuleCode(
        {
          bundleCode: "bundle",
          code: "compiled",
          metadata: {
            compiler: { frontend: "oxc", typescriptFallback: false },
            components: [],
            filename: "page.tsx",
            imports: [],
            serverOutput: "stream",
            target: "server",
          },
          sourceHash: hash,
        },
        source,
        hash,
        { serverAwaitHydration: true },
      ),
    ).toBeUndefined();
  });

  test("normalizes import policy cache keys regardless of set order", () => {
    expect(
      importPolicyCacheKey({
        allowedPackages: new Set(["zod", "jose"]),
        allowedSourceDirs: new Set(["/b", "/a"]),
        projectRoot: "/repo",
      }),
    ).toBe(
      importPolicyCacheKey({
        allowedPackages: new Set(["jose", "zod"]),
        allowedSourceDirs: new Set(["/a", "/b"]),
        projectRoot: "/repo",
      }),
    );
  });
});
