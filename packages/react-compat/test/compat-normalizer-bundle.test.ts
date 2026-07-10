import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

describe("react-compat production bundle", () => {
  test("retains compat normalizer installation for a root entrypoint import", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-normalizer-bundle-"));
    const entry = join(root, "entry.ts");
    await writeFile(entry, 'import { createElement } from "@reckona/mreact-compat"; void createElement("div", null);');

    try {
      const result = await viteBuild({
        build: { lib: { entry, formats: ["es"] }, minify: false, rollupOptions: { treeshake: true }, write: false },
        configFile: false,
        logLevel: "silent",
        resolve: { alias: [
          { find: "@reckona/mreact-compat", replacement: join(process.cwd(), "packages/react-compat/src/index.ts") },
          { find: "@reckona/mreact-reactive-dom/compat-normalize", replacement: join(process.cwd(), "packages/reactive-dom/src/compat-normalize.ts") },
          { find: "@reckona/mreact-reactive-core/internal", replacement: join(process.cwd(), "packages/reactive-core/src/internal.ts") },
          { find: "@reckona/mreact-shared/html-escape", replacement: join(process.cwd(), "packages/shared/src/html-escape.ts") },
          { find: "@reckona/mreact-shared/url-safety", replacement: join(process.cwd(), "packages/shared/src/url-safety.ts") },
          { find: "@reckona/mreact-reactive-dom", replacement: join(process.cwd(), "packages/reactive-dom/src/index.ts") },
          { find: "@reckona/mreact-reactive-core", replacement: join(process.cwd(), "packages/reactive-core/src/index.ts") },
          { find: "@reckona/mreact-shared", replacement: join(process.cwd(), "packages/shared/src/index.ts") },
        ] },
      });
      const code = (Array.isArray(result) ? result : [result])
        .flatMap((output) => output.output)
        .filter((output): output is Rollup.OutputChunk => output.type === "chunk")
        .map((chunk) => chunk.code)
        .join("\n");

      expect(code).toContain("installCompatRenderValueNormalizer();");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
