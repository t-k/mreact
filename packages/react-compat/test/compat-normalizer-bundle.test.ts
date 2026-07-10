// @vitest-environment happy-dom

import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

describe("react-compat production bundle", () => {
  test.each([
    ["root", 'import { createElement } from "@reckona/mreact-compat"; void createElement("div", null);'],
    ["jsx runtime", 'import { jsx } from "@reckona/mreact-compat/jsx-runtime"; void jsx("div", {});'],
    ["jsx dev runtime", 'import { jsxDEV } from "@reckona/mreact-compat/jsx-dev-runtime"; void jsxDEV("div", {}, undefined, false, undefined, undefined);'],
  ])("retains compat normalizer installation for a %s entrypoint import", async (_name, source) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-normalizer-bundle-"));
    const entry = join(root, "entry.ts");
    await writeFile(entry, source);

    try {
      const result = await viteBuild({
        build: { lib: { entry, formats: ["es"] }, minify: false, rollupOptions: { treeshake: true }, write: false },
        configFile: false,
        logLevel: "silent",
        resolve: { alias: [
          { find: "@reckona/mreact-compat/jsx-runtime", replacement: join(process.cwd(), "packages/react-compat/src/jsx-runtime.ts") },
          { find: "@reckona/mreact-compat/jsx-dev-runtime", replacement: join(process.cwd(), "packages/react-compat/src/jsx-dev-runtime.ts") },
          { find: "@reckona/mreact-reactive-dom/compat-normalize", replacement: join(process.cwd(), "packages/reactive-dom/src/compat-normalize.ts") },
          { find: "@reckona/mreact-reactive-core/internal", replacement: join(process.cwd(), "packages/reactive-core/src/internal.ts") },
          { find: "@reckona/mreact-shared/html-escape", replacement: join(process.cwd(), "packages/shared/src/html-escape.ts") },
          { find: "@reckona/mreact-shared/url-safety", replacement: join(process.cwd(), "packages/shared/src/url-safety.ts") },
          { find: "@reckona/mreact-compat", replacement: join(process.cwd(), "packages/react-compat/src/index.ts") },
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

  test("keeps compat normalizer code out of a native reactive-dom bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-native-normalizer-bundle-"));
    const entry = join(root, "entry.ts");
    await writeFile(entry, 'import { insertDynamic } from "@reckona/mreact-reactive-dom"; void insertDynamic;');

    try {
      const result = await viteBuild({
        build: { lib: { entry, formats: ["es"] }, minify: false, rollupOptions: { treeshake: true }, write: false },
        configFile: false,
        logLevel: "silent",
        resolve: { alias: [
          { find: "@reckona/mreact-reactive-core/internal", replacement: join(process.cwd(), "packages/reactive-core/src/internal.ts") },
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

      expect(code).not.toContain("installCompatRenderValueNormalizer");
      expect(code).not.toContain("react.transitional.element");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("marks every published compat entrypoint as side-effectful", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages/react-compat/package.json"), "utf8"),
    ) as { sideEffects?: unknown };

    expect(manifest.sideEffects).toEqual(expect.arrayContaining([
      "./dist/index.js",
      "./dist/jsx-runtime.js",
      "./dist/jsx-dev-runtime.js",
    ]));
  });

  test("executes a bundled compat entrypoint with normalized DOM output", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-normalizer-execution-"));
    const entry = join(root, "entry.ts");
    const outDir = join(root, "out");
    await writeFile(
      entry,
      `import { createElement, render } from "@reckona/mreact-compat";
export function mount(container: Element) {
  render(createElement("main", null, "bundled compat"), container);
}`,
    );

    try {
      const result = await viteBuild({
        build: { lib: { entry, formats: ["es"] }, minify: false, outDir, rollupOptions: { treeshake: true }, write: false },
        configFile: false,
        logLevel: "silent",
        resolve: { alias: [
          { find: "@reckona/mreact-compat/jsx-runtime", replacement: join(process.cwd(), "packages/react-compat/src/jsx-runtime.ts") },
          { find: "@reckona/mreact-compat/jsx-dev-runtime", replacement: join(process.cwd(), "packages/react-compat/src/jsx-dev-runtime.ts") },
          { find: "@reckona/mreact-reactive-dom/compat-normalize", replacement: join(process.cwd(), "packages/reactive-dom/src/compat-normalize.ts") },
          { find: "@reckona/mreact-reactive-core/internal", replacement: join(process.cwd(), "packages/reactive-core/src/internal.ts") },
          { find: "@reckona/mreact-shared/html-escape", replacement: join(process.cwd(), "packages/shared/src/html-escape.ts") },
          { find: "@reckona/mreact-shared/url-safety", replacement: join(process.cwd(), "packages/shared/src/url-safety.ts") },
          { find: "@reckona/mreact-compat", replacement: join(process.cwd(), "packages/react-compat/src/index.ts") },
          { find: "@reckona/mreact-reactive-dom", replacement: join(process.cwd(), "packages/reactive-dom/src/index.ts") },
          { find: "@reckona/mreact-reactive-core", replacement: join(process.cwd(), "packages/reactive-core/src/index.ts") },
          { find: "@reckona/mreact-shared", replacement: join(process.cwd(), "packages/shared/src/index.ts") },
        ] },
      });
      const chunk = (Array.isArray(result) ? result : [result])
        .flatMap((output) => output.output)
        .find((output): output is Rollup.OutputChunk => output.type === "chunk");
      if (chunk === undefined) {
        throw new Error("expected Vite to emit a compat bundle chunk");
      }
      const bundled = await import(
        `data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`,
      );
      const container = document.createElement("div");

      (bundled as { mount(container: Element): void }).mount(container);

      expect(container.innerHTML).toBe("<main>bundled compat</main>");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
