import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { importAppRouterFileModule, importAppRouterSourceModule } from "../src/module-runner.js";

async function writeNativeEsmPackage(name: string): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), `mreact-module-runner-${name}-`));
  const packageDir = join(projectDir, "node_modules", name);
  const entryFile = join(packageDir, "index.js");
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ name, type: "module" }));
  await writeFile(
    entryFile,
    `export let value = 1;
export const trusted = Object.freeze({});
export function increment() {
  value += 1;
}
export function isTrusted(candidate) {
  return candidate === trusted;
}
export default "default-export";
`,
  );

  return entryFile;
}

describe("native ESM externals in the router module runner", () => {
  test("keeps native ESM package bindings after regex literals containing quotes", async () => {
    const entryFile = await writeNativeEsmPackage("regex-esm-package");
    const module = await importAppRouterSourceModule<{
      check: (candidate: unknown) => boolean;
      escapeHtml: (text: string) => string;
      readAfterIncrement: () => number;
      trustedValue: () => object;
    }>({
      code: `import { increment, isTrusted, trusted, value } from ${JSON.stringify(pathToFileURL(entryFile).href)};

export function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (character) => '&#' + character.charCodeAt(0) + ';');
}
export function check(candidate) {
  return isTrusted(candidate);
}
export function trustedValue() {
  return trusted;
}
export function readAfterIncrement() {
  increment();
  return value;
}`,
      label: "module-runner-regex-esm-package",
    });

    expect(module.escapeHtml('<a href="x">')).toBe("&#60;a href=&#34;x&#34;&#62;");
    expect(module.check(module.trustedValue())).toBe(true);
    expect(module.check({})).toBe(false);
    expect(module.readAfterIncrement()).toBe(2);
  });

  test("re-exports native ESM package bindings", async () => {
    const entryFile = await writeNativeEsmPackage("reexport-esm-package");
    const module = await importAppRouterSourceModule<{
      check: (candidate: unknown) => boolean;
      trusted: object;
    }>({
      code: `import { isTrusted, trusted } from ${JSON.stringify(entryFile)};

export { trusted };
export { isTrusted as check };`,
      label: "module-runner-reexport-esm-package",
    });

    expect(module.check(module.trusted)).toBe(true);
    expect(module.check({})).toBe(false);
  });

  test("leaves shadowed locals of native ESM package bindings untouched", async () => {
    const entryFile = await writeNativeEsmPackage("shadow-esm-package");
    const module = await importAppRouterSourceModule<{
      pick: (source: { value: string }) => string;
      readValue: () => number;
      shadow: (value: string) => string;
    }>({
      code: `import { value } from ${JSON.stringify(entryFile)};

export function shadow(value) {
  return value;
}
export function pick(source) {
  const { value } = source;
  return value;
}
export function readValue() {
  return value;
}`,
      label: "module-runner-shadow-esm-package",
    });

    expect(module.shadow("local")).toBe("local");
    expect(module.pick({ value: "picked" })).toBe("picked");
    expect(module.readValue()).toBe(1);
  });

  test("reads native ESM package bindings inside template literal expressions", async () => {
    const entryFile = await writeNativeEsmPackage("template-esm-package");
    const module = await importAppRouterSourceModule<{
      label: () => string;
    }>({
      code: `import { increment, value } from ${JSON.stringify(entryFile)};

export function label() {
  increment();
  return \`value=\${value}\`;
}`,
      label: "module-runner-template-esm-package",
    });

    expect(module.label()).toBe("value=2");
  });

  test("binds default, namespace, and side-effect imports of native ESM packages", async () => {
    const entryFile = await writeNativeEsmPackage("shapes-esm-package");
    const entryUrl = pathToFileURL(entryFile).href;
    const module = await importAppRouterSourceModule<{
      isTrusted: (candidate: unknown) => boolean;
      namespaceValue: () => number;
      readDefault: () => string;
      trusted: object;
      value: number;
    }>({
      code: `import ${JSON.stringify(entryUrl)};
import packageDefault from ${JSON.stringify(entryUrl)};
import * as shapes from ${JSON.stringify(entryUrl)};

export * from ${JSON.stringify(entryUrl)};
export function readDefault() {
  return packageDefault;
}
export function namespaceValue() {
  shapes.increment();
  return shapes.value;
}`,
      label: "module-runner-shapes-esm-package",
    });

    expect(module.readDefault()).toBe("default-export");
    expect(module.namespaceValue()).toBe(2);
    expect(module.value).toBe(2);
    expect(module.isTrusted(module.trusted)).toBe(true);
  });

  test("shares one native instance across runner modules and the host process", async () => {
    const entryFile = await writeNativeEsmPackage("shared-esm-package");
    const entryUrl = pathToFileURL(entryFile).href;
    const producer = await importAppRouterSourceModule<{ bump: () => number }>({
      code: `import { increment, value } from ${JSON.stringify(entryUrl)};

export function bump() {
  increment();
  return value;
}`,
      label: "module-runner-shared-esm-producer",
    });
    const consumer = await importAppRouterSourceModule<{
      loadDynamically: () => Promise<{ trusted: object }>;
      read: () => number;
      trustedValue: () => object;
    }>({
      code: `import { trusted, value } from ${JSON.stringify(entryFile)};

export function read() {
  return value;
}
export function trustedValue() {
  return trusted;
}
export function loadDynamically() {
  return import(${JSON.stringify(entryUrl)});
}`,
      label: "module-runner-shared-esm-consumer",
    });
    const host = (await import(entryUrl)) as { trusted: object; value: number };

    expect(producer.bump()).toBe(2);
    expect(consumer.read()).toBe(2);
    expect(host.value).toBe(2);
    expect(consumer.trustedValue()).toBe(host.trusted);
    expect((await consumer.loadDynamically()).trusted).toBe(host.trusted);
  });

  test("requires CommonJS packages through createRequire without identifier rewriting", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-native-cjs-"));
    const packageDir = join(projectDir, "node_modules", "dynamic-cjs-package");
    const entryFile = join(packageDir, "index.js");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "dynamic-cjs-package" }),
    );
    await writeFile(
      entryFile,
      `const exportNames = ["dynamicLabel"];
for (const name of exportNames) {
  module.exports[name] = "dynamic";
}
module.exports.quote = (text) => text.replace(/["]/g, "'");
`,
    );
    const module = await importAppRouterSourceModule<{
      describe: (dynamicLabel: string) => string;
      quoted: () => string;
    }>({
      code: `import cjsPackage, { dynamicLabel, quote as quoteText } from ${JSON.stringify(pathToFileURL(entryFile).href)};

export function describe(dynamicLabel) {
  return dynamicLabel + ":" + cjsPackage.dynamicLabel;
}
export function quoted() {
  return quoteText('"' + dynamicLabel + '"');
}`,
      label: "module-runner-dynamic-cjs-package",
    });

    expect(module.describe("local")).toBe("local:dynamic");
    expect(module.quoted()).toBe("'dynamic'");
  });

  test("reports missing named and default exports of native ESM packages", async () => {
    const entryFile = await writeNativeEsmPackage("missing-esm-package");
    const namedOnlyDir = join(dirname(dirname(entryFile)), "named-only-package");
    const namedOnlyFile = join(namedOnlyDir, "index.mjs");
    await mkdir(namedOnlyDir, { recursive: true });
    await writeFile(namedOnlyFile, "export const named = 1;\n");

    await expect(
      importAppRouterSourceModule({
        code: `import { missing } from ${JSON.stringify(pathToFileURL(entryFile).href)};

export const value = missing;`,
        label: "module-runner-missing-esm-package",
      }),
    ).rejects.toThrow(/does not provide an export named 'missing'/u);
    await expect(
      importAppRouterSourceModule({
        code: `import missingDefault from ${JSON.stringify(pathToFileURL(namedOnlyFile).href)};

export const value = missingDefault;`,
        label: "module-runner-missing-default-esm-package",
      }),
    ).rejects.toThrow(/does not provide an export named 'default'/u);
  });

  test("keeps TypeScript node_modules sources and their relative imports in the runner graph", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-ts-source-package-"));
    const packageDir = join(projectDir, "node_modules", "ts-source-package");
    const entryFile = join(packageDir, "index.ts");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "ts-source-package", type: "module" }),
    );
    await writeFile(join(packageDir, "helper.js"), "export const suffix = '!';\n");
    await writeFile(
      entryFile,
      `import { suffix } from "./helper.js";

export function shout(text: string): string {
  return text.toUpperCase() + suffix;
}
`,
    );
    const module = await importAppRouterSourceModule<{ shout: (text: string) => string }>({
      code: `export { shout } from ${JSON.stringify(pathToFileURL(entryFile).href)};`,
      label: "module-runner-ts-source-package",
    });

    expect(module.shout("hi")).toBe("HI!");
  });

  test("keeps cache-busted file imports under node_modules in the runner graph", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-linked-route-"));
    const routeDir = join(projectDir, "node_modules", "linked-app", "app");
    const routeFile = join(routeDir, "route.js");
    await mkdir(routeDir, { recursive: true });
    await writeFile(
      join(projectDir, "node_modules", "linked-app", "package.json"),
      JSON.stringify({ name: "linked-app", type: "module" }),
    );
    await writeFile(routeFile, "export const version = 1;\n");
    const first = await importAppRouterFileModule<{ version: number }>(routeFile);
    await writeFile(routeFile, "export const version = 2;\n");
    const second = await importAppRouterFileModule<{ version: number }>(routeFile);

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });

  test("natively imports CommonJS files that bypass the require rewrite", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-multiline-cjs-"));
    const packageDir = join(projectDir, "node_modules", "multiline-cjs-package");
    const entryFile = join(packageDir, "index.js");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "multiline-cjs-package" }),
    );
    await writeFile(entryFile, "exports.label = 'commonjs';\n");
    const module = await importAppRouterSourceModule<{ describe: () => string }>({
      code: `import cjsPackage, {
  label,
} from ${JSON.stringify(pathToFileURL(entryFile).href)};

export function describe() {
  return label + ":" + cjsPackage.label;
}`,
      label: "module-runner-multiline-cjs-package",
    });

    expect(module.describe()).toBe("commonjs:commonjs");
    await expect(
      importAppRouterSourceModule({
        code: `import {
  missing,
} from ${JSON.stringify(pathToFileURL(entryFile).href)};

export const value = missing;`,
        label: "module-runner-multiline-cjs-missing",
      }),
    ).rejects.toThrow(/is a CommonJS module/u);
  });

  test("keeps root-relative node_modules imports of Vite-transformed sources in the runner graph", async () => {
    // A real directory inside the Vite root (not the symlinked node_modules) so
    // Vite normalizes the helper import to a root-relative /coverage/... URL.
    await mkdir(join(process.cwd(), "coverage"), { recursive: true });
    const scratchDir = await mkdtemp(join(process.cwd(), "coverage", "native-externals-"));
    try {
      const packageDir = join(scratchDir, "node_modules", "root-relative-package");
      const entryFile = join(packageDir, "index.ts");
      await mkdir(packageDir, { recursive: true });
      await writeFile(
        join(packageDir, "package.json"),
        JSON.stringify({ name: "root-relative-package", type: "module" }),
      );
      await writeFile(join(packageDir, "helper.js"), "export const suffix = '?';\n");
      await writeFile(
        entryFile,
        `import { suffix } from "./helper.js";

export function ask(text: string): string {
  return text + suffix;
}
`,
      );
      const module = await importAppRouterSourceModule<{ ask: (text: string) => string }>({
        code: `export { ask } from ${JSON.stringify(pathToFileURL(entryFile).href)};`,
        label: "module-runner-root-relative-package",
      });
      const rootRelativeSpecifier = `/${relative(process.cwd(), join(packageDir, "helper.js"))}`;
      const rootRelative = await importAppRouterSourceModule<{ suffix: string }>({
        code: `export { suffix } from ${JSON.stringify(rootRelativeSpecifier)};`,
        label: "module-runner-root-relative-specifier",
      });

      expect(module.ask("why")).toBe("why?");
      expect(rootRelative.suffix).toBe("?");
    } finally {
      await rm(scratchDir, { force: true, recursive: true });
    }
  });

  test("mixes native ESM and CommonJS externals in one source module", async () => {
    const esmEntryFile = await writeNativeEsmPackage("mixed-esm-package");
    const cjsDir = join(dirname(dirname(esmEntryFile)), "mixed-cjs-package");
    const cjsEntryFile = join(cjsDir, "index.js");
    await mkdir(cjsDir, { recursive: true });
    await writeFile(
      join(cjsDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "mixed-cjs-package" }),
    );
    await writeFile(cjsEntryFile, "exports.prefix = 'cjs:';\n");
    const module = await importAppRouterSourceModule<{ describe: () => string }>({
      code: `import { prefix } from ${JSON.stringify(pathToFileURL(cjsEntryFile).href)};
import { increment, value } from ${JSON.stringify(pathToFileURL(esmEntryFile).href)};

export function describe() {
  increment();
  return prefix + value;
}`,
      label: "module-runner-mixed-externals",
    });

    expect(module.describe()).toBe("cjs:2");
  });
});
