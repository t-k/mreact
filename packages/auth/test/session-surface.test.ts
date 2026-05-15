import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("auth session surface", () => {
  test("uses the router internal session subpath instead of the deprecated router main exports", async () => {
    const authSource = await readFile(
      join(process.cwd(), "packages", "auth", "src", "index.ts"),
      "utf8",
    );
    const routerManifest = JSON.parse(
      await readFile(
        join(process.cwd(), "packages", "router", "package.json"),
        "utf8",
      ),
    ) as { exports?: Record<string, unknown> };

    expect(authSource).toContain("@reckona/mreact-router/internal/session");
    const routerMainImport = authSource.match(
      /import\s+\{(?<specifiers>[^;]*?)\}\s+from\s+["']@reckona\/mreact-router["'];/,
    );

    expect(routerMainImport?.groups?.specifiers ?? "").not.toMatch(
      /createMemorySessionStore|createSession|destroySession|getSession|rotateSession/,
    );
    expect(routerManifest.exports).toHaveProperty("./internal/session");
  });
});
