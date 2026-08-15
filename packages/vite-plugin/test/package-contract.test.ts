import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("@reckona/mreact-vite package contract", () => {
  test("declares Vite 8 as the supported peer range", async () => {
    const packageJson = JSON.parse(
      await readFile(
        new URL("../package.json", import.meta.url),
        "utf8",
      ),
    ) as { peerDependencies?: Record<string, string> };

    expect(packageJson.peerDependencies?.vite).toBe(">=8.1.4 <9");
  });

  test("keeps the README include example aligned with the plugin API", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("include: [/\\.mreact\\.tsx$/]");
    expect(readme).not.toContain('target: "client"');
    expect(readme).toContain("Vite's `ssr` transform flag");
  });
});
