// @vitest-environment happy-dom

import { readFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

const packedCompatConsumerSizeBudgets = {
  root: { gzipBytes: 11_200, rawBytes: 41_000 },
  "jsx-runtime": { gzipBytes: 11_200, rawBytes: 41_100 },
  "jsx-dev-runtime": { gzipBytes: 11_200, rawBytes: 41_200 },
  native: { gzipBytes: 9_000, rawBytes: 34_000 },
} as const;

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

  test("preserves side-effect metadata in the packed compat tarball", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "mreact-compat-tarball-"));

    try {
      const packageDir = join(process.cwd(), "packages/react-compat");
      const output = execFileSync(
        "corepack",
        ["pnpm", "--dir", packageDir, "pack", "--pack-destination", packDir],
        { encoding: "utf8" },
      );
      const tarball = output.trim().split(/\r?\n/).at(-1);
      if (tarball === undefined) {
        throw new Error("expected pnpm pack to emit a tarball path");
      }
      const manifest = JSON.parse(
        execFileSync(
          "tar",
          ["-xOf", isAbsolute(tarball) ? tarball : join(packDir, tarball), "package/package.json"],
          {
          encoding: "utf8",
          },
        ),
      ) as { sideEffects?: unknown };

      expect(manifest.sideEffects).toEqual(expect.arrayContaining([
        "./dist/index.js",
        "./dist/jsx-runtime.js",
        "./dist/jsx-dev-runtime.js",
      ]));
    } finally {
      await rm(packDir, { force: true, recursive: true });
    }
  });

  test("executes every minified compat entrypoint with reactive DOM from packed tarballs", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-packed-bundle-"));
    const packDir = join(root, "tarballs");

    try {
      await writePackedConsumerPackage(root, packDir);
      execFileSync(
        "corepack",
        ["pnpm", "--dir", root, "install", "--ignore-scripts=false"],
        { encoding: "utf8" },
      );
      const scenarios = [
        {
          name: "root",
          factory: 'import { createElement as createCompatElement } from "@reckona/mreact-compat";\nconst createValue = () => createCompatElement("main", null, "packed root");',
          text: "packed root",
        },
        {
          name: "jsx-runtime",
          factory: 'import { jsx } from "@reckona/mreact-compat/jsx-runtime";\nconst createValue = () => jsx("main", { children: "packed jsx" });',
          text: "packed jsx",
        },
        {
          name: "jsx-dev-runtime",
          factory: 'import { jsxDEV } from "@reckona/mreact-compat/jsx-dev-runtime";\nconst createValue = () => jsxDEV("main", { children: "packed jsx dev" }, undefined, false, undefined, undefined);',
          text: "packed jsx dev",
        },
      ] as const;
      const sizes: Array<{
        gzipBytes: number;
        name: Exclude<keyof typeof packedCompatConsumerSizeBudgets, "native">;
        rawBytes: number;
      }> = [];

      for (const scenario of scenarios) {
        const chunk = await bundlePackedScenario(root, scenario.name, `${scenario.factory}
import { insertDynamic } from "@reckona/mreact-reactive-dom";
export function mount(container) {
  const marker = document.createComment("");
  container.append(marker);
  insertDynamic(container, marker, createValue);
}`);
        const result = executePackedBundle(root, scenario.name, chunk.code);

        expect(result.tagName).toBe("MAIN");
        expect(result.text).toBe(scenario.text);
        expect(result.html).not.toContain("[object Object]");
        expect(Object.keys(chunk.modules)).toEqual(
          expect.arrayContaining([
            expect.stringContaining("@reckona/mreact-compat"),
            expect.stringContaining("@reckona/mreact-reactive-dom"),
          ]),
        );
        sizes.push({
          gzipBytes: gzipSync(chunk.code).length,
          name: scenario.name,
          rawBytes: Buffer.byteLength(chunk.code),
        });
      }

      const native = await bundlePackedScenario(
        root,
        "native",
        `import { insertDynamic } from "@reckona/mreact-reactive-dom";
export function mount(container) {
  const marker = document.createComment("");
  container.append(marker);
  insertDynamic(container, marker, () => "native only");
}`,
      );
      expect(Object.keys(native.modules)).not.toEqual(
        expect.arrayContaining([expect.stringContaining("@reckona/mreact-compat")]),
      );
      expect(sizes).toHaveLength(3);
      expect(sizes.every((size) => size.rawBytes > size.gzipBytes)).toBe(true);
      for (const size of sizes) {
        const budget = packedCompatConsumerSizeBudgets[size.name];
        expect(size.rawBytes, `${size.name} packed consumer raw bytes`).toBeLessThanOrEqual(
          budget.rawBytes,
        );
        expect(size.gzipBytes, `${size.name} packed consumer gzip bytes`).toBeLessThanOrEqual(
          budget.gzipBytes,
        );
      }
      expect(Buffer.byteLength(native.code), "native packed consumer raw bytes").toBeLessThanOrEqual(
        packedCompatConsumerSizeBudgets.native.rawBytes,
      );
      expect(gzipSync(native.code).length, "native packed consumer gzip bytes").toBeLessThanOrEqual(
        packedCompatConsumerSizeBudgets.native.gzipBytes,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 60_000);

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

async function writePackedConsumerPackage(root: string, packDir: string): Promise<void> {
  await rm(packDir, { force: true, recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "mreact-compat-packed-bundle-probe",
        private: true,
        type: "module",
        dependencies: {
          "@reckona/mreact-compat": "file:./tarballs/reckona-mreact-compat.tgz",
          "@reckona/mreact-reactive-core": "file:./tarballs/reckona-mreact-reactive-core.tgz",
          "@reckona/mreact-reactive-dom": "file:./tarballs/reckona-mreact-reactive-dom.tgz",
          "@reckona/mreact-shared": "file:./tarballs/reckona-mreact-shared.tgz",
          "happy-dom": "20.10.2",
          vite: "8.0.16",
        },
        pnpm: {
          overrides: {
            "@reckona/mreact-compat": "file:./tarballs/reckona-mreact-compat.tgz",
            "@reckona/mreact-reactive-core": "file:./tarballs/reckona-mreact-reactive-core.tgz",
            "@reckona/mreact-reactive-dom": "file:./tarballs/reckona-mreact-reactive-dom.tgz",
            "@reckona/mreact-shared": "file:./tarballs/reckona-mreact-shared.tgz",
          },
        },
      },
      null,
      2,
    ),
  );

  for (const packageName of ["reactive-core", "reactive-dom", "shared", "react-compat"]) {
    const packageDir = join(process.cwd(), "packages", packageName);
    execFileSync(
      "corepack",
      ["pnpm", "--dir", packageDir, "pack", "--pack-destination", packDir],
      { encoding: "utf8" },
    );
  }

  const tarballs = await readdir(packDir);
  for (const [packageName, tarballPrefix] of [
    ["react-compat", "mreact-compat"],
    ["reactive-core", "mreact-reactive-core"],
    ["reactive-dom", "mreact-reactive-dom"],
    ["shared", "mreact-shared"],
  ] as const) {
    const tarball = tarballs.find((entry) => entry.includes(tarballPrefix));
    if (tarball === undefined) {
      throw new Error(`expected packed tarball for ${packageName}`);
    }
    await writeFile(join(packDir, `reckona-${tarballPrefix}.tgz`), await readFile(join(packDir, tarball)));
  }
}

async function bundlePackedScenario(
  root: string,
  name: string,
  source: string,
): Promise<Rollup.OutputChunk> {
  const entry = join(root, `entry-${name}.ts`);
  await writeFile(entry, source);
  const result = await viteBuild({
    build: {
      lib: { entry, formats: ["es"] },
      minify: "esbuild",
      rollupOptions: { treeshake: true },
      write: false,
    },
    configFile: false,
    logLevel: "silent",
    root,
  });
  const chunk = (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output)
    .find((output): output is Rollup.OutputChunk => output.type === "chunk");

  if (chunk === undefined) {
    throw new Error(`expected Vite to emit the ${name} packed bundle chunk`);
  }

  return chunk;
}

function executePackedBundle(
  root: string,
  name: string,
  code: string,
): { html: string; tagName: string | undefined; text: string | null | undefined } {
  const bundle = join(root, `bundle-${name}.mjs`);
  const runner = join(root, `runner-${name}.mjs`);
  writeFileSync(bundle, code);
  writeFileSync(
    runner,
    `import { Window } from "happy-dom";
const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
for (const name of ["Node", "Element", "HTMLElement", "DocumentFragment", "Text", "Comment", "Event"]) {
  globalThis[name] = window[name];
}
const { mount } = await import(${JSON.stringify(`./bundle-${name}.mjs`)});
const container = document.createElement("div");
mount(container);
console.log(JSON.stringify({
  html: container.innerHTML,
  tagName: container.firstElementChild?.tagName,
  text: container.firstElementChild?.textContent,
}));
`,
  );

  return JSON.parse(
    execFileSync(process.execPath, [runner], { cwd: root, encoding: "utf8" }),
  ) as { html: string; tagName: string | undefined; text: string | null | undefined };
}
