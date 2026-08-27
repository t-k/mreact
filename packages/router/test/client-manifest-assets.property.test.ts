import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { clientManifestAssetPaths } from "../src/client-manifest-assets.js";

const safeSegment = fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/);
const safePath = fc
  .array(safeSegment, { minLength: 1, maxLength: 5 })
  .map((segments) => segments.join("/"));
const unsafePath = fc
  .tuple(safePath, fc.constantFrom("..", ".", "%2e%2e", "%2E", "%2f", "%5c", "%ZZ", ""), safePath)
  .map(([left, segment, right]) => `${left}/${segment}/${right}`);
const propertyParameters = { numRuns: 500, seed: 20_260_832 } as const;

describe("client manifest asset path properties", () => {
  test("retains generated relative paths under the normalized prefix", () => {
    fc.assert(
      fc.property(fc.uniqueArray(safePath), safeSegment, (assets, prefix) => {
        const result = clientManifestAssetPaths({ routes: [], assets }, { prefix });

        expect(result).toEqual(
          new Set([`/${prefix}/manifest.json`, ...assets.map((asset) => `/${prefix}/${asset}`)]),
        );
      }),
      propertyParameters,
    );
  });

  test("rejects generated traversal, separator, absolute, and malformed-percent paths", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          unsafePath,
          safePath.map((path) => `/${path}`),
          safePath.map((path) => `${path}\\escape.js`),
        ),
        (asset) => {
          expect(clientManifestAssetPaths({ routes: [], assets: [asset] })).toEqual(
            new Set(["manifest.json"]),
          );
        },
      ),
      propertyParameters,
    );
  });

  test("is invariant to generated asset input permutations", () => {
    fc.assert(
      fc.property(fc.uniqueArray(safePath, { maxLength: 30 }), (assets) => {
        const forward = clientManifestAssetPaths({ routes: [], assets });
        const reverse = clientManifestAssetPaths({
          routes: [],
          assets: [...assets].reverse(),
        });

        expect(reverse).toEqual(forward);
      }),
      propertyParameters,
    );
  });
});
