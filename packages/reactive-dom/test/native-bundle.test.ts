import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

describe("reactive-dom native bundle layering", () => {
  test("does not include the compat prop application URL safety chain", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-reactive-dom-native-bundle-"));
    const entry = join(rootDir, "entry.ts");

    await writeFile(
      entry,
      `
        import { cell } from "@reckona/mreact-reactive-core";
        import { bindList, bindText, createRoot } from "@reckona/mreact-reactive-dom";

        const rows = cell([{ id: 1, text: "alpha" }]);
        const total = cell(1);
        const root = document.createElement("main");

        createRoot(root, () => {
          const text = document.createTextNode("");
          bindText(text, () => String(total.get()));

          const list = document.createElement("ul");
          const marker = document.createTextNode("");
          list.append(marker);
          bindList(
            list,
            marker,
            () => rows.get(),
            (row) => {
              const item = document.createElement("li");
              item.textContent = row.text;
              return item;
            },
            { key: (row) => row.id },
          );

          return [text, list];
        });
      `,
    );

    try {
      const result = await viteBuild({
        build: {
          lib: {
            entry,
            fileName: "entry",
            formats: ["es"],
          },
          minify: false,
          rollupOptions: {
            treeshake: true,
          },
          write: false,
        },
        configFile: false,
        logLevel: "silent",
        resolve: {
          alias: [
            {
              find: "@reckona/mreact-reactive-core/internal",
              replacement: join(process.cwd(), "packages/reactive-core/src/internal.ts"),
            },
            {
              find: "@reckona/mreact-reactive-core",
              replacement: join(process.cwd(), "packages/reactive-core/src/index.ts"),
            },
            {
              find: "@reckona/mreact-reactive-dom",
              replacement: join(process.cwd(), "packages/reactive-dom/src/index.ts"),
            },
          ],
        },
      });
      const chunks = Array.isArray(result) ? result : [result];
      const code = chunks
        .flatMap((output) => output.output)
        .filter((output): output is Rollup.OutputChunk => output.type === "chunk")
        .map((chunk) => chunk.code)
        .join("\n");

      expect(code).not.toContain("isUnsafeUrlAttribute");
      expect(code).not.toContain("isDangerousHtmlAttribute");
      expect(code).not.toContain("applyDomProp");
      expect(code).not.toContain("srcDoc");
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
