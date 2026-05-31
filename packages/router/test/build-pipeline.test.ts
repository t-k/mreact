import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { bundleRouterModule, type RouterBundleOutput } from "../src/bundle-pipeline.js";

describe("router build pipeline", () => {
  test("memoizes bundleRouterModule output when an explicit build-scoped cache key is provided", async () => {
    const cache = new Map<string, Promise<RouterBundleOutput>>();
    let loads = 0;

    const first = await bundleRouterModule({
      cache,
      cacheKey: "virtual-cache-entry",
      code: `import { value } from "virtual:cached"; export const result = value;`,
      filename: join(process.cwd(), "cache-entry-a.js"),
      platform: "node",
      preserveExports: true,
      plugins: [
        {
          name: "mreact-test-virtual-cache",
          setup(buildApi) {
            buildApi.onResolve({ filter: /^virtual:cached$/ }, (args) => ({
              namespace: "virtual-cache",
              path: args.path,
            }));
            buildApi.onLoad({ filter: /.*/, namespace: "virtual-cache" }, () => {
              loads += 1;
              return {
                contents: `export const value = ${JSON.stringify(`load-${loads}`)};`,
                loader: "js",
              };
            });
          },
        },
      ],
    });
    const second = await bundleRouterModule({
      cache,
      cacheKey: "virtual-cache-entry",
      code: `import { value } from "virtual:cached"; export const result = value;`,
      filename: join(process.cwd(), "cache-entry-b.js"),
      platform: "node",
      preserveExports: true,
      plugins: [
        {
          name: "mreact-test-virtual-cache",
          setup(buildApi) {
            buildApi.onResolve({ filter: /^virtual:cached$/ }, (args) => ({
              namespace: "virtual-cache",
              path: args.path,
            }));
            buildApi.onLoad({ filter: /.*/, namespace: "virtual-cache" }, () => {
              loads += 1;
              return {
                contents: `export const value = ${JSON.stringify(`load-${loads}`)};`,
                loader: "js",
              };
            });
          },
        },
      ],
    });

    expect(loads).toBe(1);
    expect(first.code).toBe(second.code);
  });

  test("does not reuse bundleRouterModule output across distinct cache keys", async () => {
    const cache = new Map<string, Promise<RouterBundleOutput>>();
    let loads = 0;
    const bundle = async (cacheKey: string) =>
      await bundleRouterModule({
        cache,
        cacheKey,
        code: `import { value } from "virtual:cached"; export const result = value;`,
        filename: join(process.cwd(), `${cacheKey}.js`),
        platform: "node",
        preserveExports: true,
        plugins: [
          {
            name: "mreact-test-virtual-cache",
            setup(buildApi) {
              buildApi.onResolve({ filter: /^virtual:cached$/ }, (args) => ({
                namespace: "virtual-cache",
                path: args.path,
              }));
              buildApi.onLoad({ filter: /.*/, namespace: "virtual-cache" }, () => {
                loads += 1;
                return {
                  contents: `export const value = ${JSON.stringify(`load-${loads}`)};`,
                  loader: "js",
                };
              });
            },
          },
        ],
      });

    const first = await bundle("cache-entry-a");
    const second = await bundle("cache-entry-b");

    expect(loads).toBe(2);
    expect(first.code).not.toBe(second.code);
  });

  test("does not import esbuild directly from router source files", async () => {
    const sourceDir = join(process.cwd(), "packages", "router", "src");
    const offenders: string[] = [];

    for (const file of await collectSourceFiles(sourceDir)) {
      const source = await readFile(file, "utf8");

      if (/\bfrom\s+["']esbuild["']/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && /\.(?:mreact\.)?[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}
