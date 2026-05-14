import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("Cloudflare Workers example entrypoint", () => {
  test("uses the provider adapter without Node imports", async () => {
    const source = await readFile(
      join(process.cwd(), "examples/app-router/scripts/cloudflare-worker.ts"),
      "utf8",
    );

    expect(source).toContain("@reckona/mreact-router/adapters/cloudflare");
    expect(source).toContain("createCloudflareBuiltRequestHandler");
    expect(source).toContain("createCloudflareStaticAssetLoader");
    expect(source).toContain("createCloudflarePrerenderStore");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("fs/promises");
  });
});
