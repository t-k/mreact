import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { build, type Rollup } from "vite";

describe("modularReact server build fixture", () => {
  test("builds a static SSR fixture", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mreact-vite-ssr-build-"));

    try {
      const result = await build({
        root: new URL("./fixtures/basic-server", import.meta.url).pathname,
        logLevel: "silent",
        build: {
          outDir,
          emptyOutDir: true,
          ssr: "src/entry-server.ts",
          write: false,
        },
      });

      const outputs: Rollup.RollupOutput[] = Array.isArray(result)
        ? result
        : "output" in result
          ? [result]
          : (() => {
              throw new Error("Vite unexpectedly returned a build watcher");
            })();
      const chunks = outputs.flatMap((output) => output.output);

      expect(chunks.some((chunk) => chunk.type === "chunk")).toBe(true);
      expect(
        chunks.some((chunk) => chunk.type === "chunk" && chunk.code.includes("Hello SSR")),
      ).toBe(true);
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });
});
