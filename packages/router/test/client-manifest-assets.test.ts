import { describe, expect, test } from "vitest";
import { clientManifestAssetPaths } from "../src/client-manifest-assets.js";

describe("client manifest asset paths", () => {
  test("collects safe route, manifest, and extra assets with an optional prefix", () => {
    const paths = clientManifestAssetPaths(
      {
        assets: ["runtime.js", "../escape.js", "/absolute.js", "nested/style.css"],
        routes: [
          {
            script: "routes/index.js",
            sourceMap: "routes/index.js.map",
            navigationScript: "routes/index.nav.js",
            css: ["routes/index.css"],
            imports: ["chunks/shared.js", "bad//chunk.js"],
          },
        ],
      },
      {
        extraPaths: ["extra/runtime.js", "bad/../extra.js"],
        prefix: "/_mreact/client",
      },
    );

    expect([...paths].sort()).toEqual([
      "/_mreact/client/chunks/shared.js",
      "/_mreact/client/extra/runtime.js",
      "/_mreact/client/manifest.json",
      "/_mreact/client/nested/style.css",
      "/_mreact/client/routes/index.css",
      "/_mreact/client/routes/index.js",
      "/_mreact/client/routes/index.js.map",
      "/_mreact/client/routes/index.nav.js",
      "/_mreact/client/runtime.js",
    ]);
  });
});
