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
      loadComputed: (specifier: string) => Promise<{ trusted: object }>;
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
}
export function loadComputed(specifier) {
  return import(/* @vite-ignore */ specifier);
}`,
      label: "module-runner-shared-esm-consumer",
    });
    const host = (await import(entryUrl)) as { trusted: object; value: number };

    expect(producer.bump()).toBe(2);
    expect(consumer.read()).toBe(2);
    expect(host.value).toBe(2);
    expect(consumer.trustedValue()).toBe(host.trusted);
    expect((await consumer.loadDynamically()).trusted).toBe(host.trusted);
    expect((await consumer.loadComputed(entryFile)).trusted).toBe(host.trusted);
    expect((await consumer.loadComputed(entryUrl)).trusted).toBe(host.trusted);
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

  test("fails clearly for node_modules files that do not exist", async () => {
    const entryFile = await writeNativeEsmPackage("present-esm-package");
    const missingFile = join(dirname(dirname(entryFile)), "absent-package", "index.js");

    await expect(
      importAppRouterSourceModule({
        code: `export * from ${JSON.stringify(pathToFileURL(missingFile).href)};`,
        label: "module-runner-absent-file-url",
      }),
    ).rejects.toThrow(/absent-package/u);
    await expect(
      importAppRouterSourceModule({
        code: `export * from ${JSON.stringify(missingFile)};`,
        label: "module-runner-absent-absolute-path",
      }),
    ).rejects.toThrow(/absent-package/u);
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
      const fsPrefixed = await importAppRouterSourceModule<{ suffix: string }>({
        code: `export { suffix } from ${JSON.stringify(`/@fs${join(packageDir, "helper.js")}`)};`,
        label: "module-runner-fs-prefixed-specifier",
      });

      expect(module.ask("why")).toBe("why?");
      expect(rootRelative.suffix).toBe("?");
      expect(fsPrefixed.suffix).toBe("?");
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
    const module = await importAppRouterSourceModule<{
      describe: () => string;
      isMissing: (value: unknown) => boolean;
    }>({
      code: `import { prefix } from ${JSON.stringify(pathToFileURL(cjsEntryFile).href)};
import { increment, value } from ${JSON.stringify(pathToFileURL(esmEntryFile).href)};

export function describe() {
  increment();
  return prefix + value;
}
export function isMissing(candidate) {
  return candidate === undefined;
}`,
      label: "module-runner-mixed-externals",
    });

    expect(module.describe()).toBe("cjs:2");
    expect(module.isMissing(undefined)).toBe(true);
    expect(module.isMissing(prefixObject())).toBe(false);

    function prefixObject(): object {
      return { prefix: "cjs:" };
    }
  });

  test.each([
    ["commonjs", "esm"],
    ["esm", "commonjs"],
  ])("evaluates %s externals before %s externals in source order", async (first, second) => {
    const esmEntryFile = await writeNativeEsmPackage(`order-${first}-${second}-esm`);
    const nodeModulesDir = dirname(dirname(esmEntryFile));
    const cjsDir = join(nodeModulesDir, "order-cjs-package");
    const cjsEntryFile = join(cjsDir, "index.js");
    await mkdir(cjsDir, { recursive: true });
    await writeFile(
      join(cjsDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "order-cjs-package" }),
    );
    await writeFile(
      cjsEntryFile,
      `globalThis.__mreactExternalOrder.push("commonjs");
exports.kind = "commonjs";
`,
    );
    await writeFile(
      join(dirname(esmEntryFile), "order.js"),
      `globalThis.__mreactExternalOrder.push("esm");
export const kind = "esm";
`,
    );
    const specifiers = {
      commonjs: pathToFileURL(cjsEntryFile).href,
      esm: pathToFileURL(join(dirname(esmEntryFile), "order.js")).href,
    };
    const order = (globalThis as { __mreactExternalOrder?: string[] }).__mreactExternalOrder ?? [];
    (globalThis as { __mreactExternalOrder?: string[] }).__mreactExternalOrder = order;
    order.length = 0;
    const module = await importAppRouterSourceModule<{ kinds: string }>({
      code: `import { kind as firstKind } from ${JSON.stringify(specifiers[first])};
import { kind as secondKind } from ${JSON.stringify(specifiers[second])};

export const kinds = firstKind + "," + secondKind;`,
      label: `module-runner-order-${first}-${second}`,
    });

    expect(module.kinds).toBe(`${first},${second}`);
    expect(order).toEqual([first, second]);
  });

  test("binds namespace, default, aliased, and side-effect CommonJS imports through shims", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-cjs-shapes-"));
    const packageDir = join(projectDir, "node_modules", "shapes-cjs-package");
    const entryFile = join(packageDir, "index.js");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "shapes-cjs-package" }),
    );
    await writeFile(
      entryFile,
      `globalThis.__mreactCjsShapeLoads = (globalThis.__mreactCjsShapeLoads ?? 0) + 1;
module.exports = { new: "reserved", value: 1 };
module.exports[["dyn", "amic"].join("")] = "dynamic";
`,
    );
    const entryUrl = pathToFileURL(entryFile).href;
    const module = await importAppRouterSourceModule<{
      dynamicViaNamespace: () => string;
      reserved: string;
      sameObject: boolean;
      viaDefault: object;
    }>({
      code: `import ${JSON.stringify(entryUrl)};
import defaultExport, * as namespace from ${JSON.stringify(entryUrl)};
import { default as aliasedDefault, new as reserved } from ${JSON.stringify(entryUrl)};

export { reserved };
export const viaDefault = defaultExport;
export const sameObject = defaultExport === namespace && namespace === aliasedDefault;
export function dynamicViaNamespace() {
  return namespace.dynamic;
}`,
      label: "module-runner-cjs-shapes",
    });
    const other = await importAppRouterSourceModule<{ exportsObject: object }>({
      code: `import * as namespace from ${JSON.stringify(entryFile)};

export const exportsObject = namespace;`,
      label: "module-runner-cjs-shapes-other",
    });
    const effectDir = join(projectDir, "node_modules", "effect-cjs-package");
    await mkdir(effectDir, { recursive: true });
    await writeFile(
      join(effectDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "effect-cjs-package" }),
    );
    await writeFile(
      join(effectDir, "index.js"),
      "globalThis.__mreactCjsEffectLoads = (globalThis.__mreactCjsEffectLoads ?? 0) + 1;\n",
    );
    const defaultOnly = await importAppRouterSourceModule<{
      exportsObject: object;
      isMissing: (value: unknown) => boolean;
    }>({
      code: `import ${JSON.stringify(pathToFileURL(join(effectDir, "index.js")).href)};
import onlyDefault from ${JSON.stringify(entryUrl)};

export const exportsObject = onlyDefault;
export function isMissing(value) {
  return value === undefined;
}`,
      label: "module-runner-cjs-shapes-default-only",
    });

    expect(module.reserved).toBe("reserved");
    expect(module.sameObject).toBe(true);
    expect(module.dynamicViaNamespace()).toBe("dynamic");
    expect(other.exportsObject).toBe(module.viaDefault);
    expect(defaultOnly.exportsObject).toBe(module.viaDefault);
    expect(defaultOnly.isMissing(undefined)).toBe(true);
    expect(defaultOnly.isMissing(module.viaDefault)).toBe(false);
    expect((globalThis as { __mreactCjsShapeLoads?: number }).__mreactCjsShapeLoads).toBe(1);
    expect((globalThis as { __mreactCjsEffectLoads?: number }).__mreactCjsEffectLoads).toBe(1);
  });

  test("requires .node addons for side-effect imports instead of native import()", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-addon-"));
    const packageDir = join(projectDir, "node_modules", "addon-package");
    const addonFile = join(packageDir, "addon.node");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "addon-package" }));
    await writeFile(addonFile, "not a real addon\n");
    let failure: unknown;

    try {
      await importAppRouterSourceModule({
        code: `import ${JSON.stringify(pathToFileURL(addonFile).href)};

export const loaded = true;`,
        label: "module-runner-addon-side-effect",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toMatch(/Unknown file extension/u);
  });

  test("retries CommonJS externals that threw while loading", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-flaky-cjs-"));
    const packageDir = join(projectDir, "node_modules", "flaky-cjs-package");
    const entryFile = join(packageDir, "index.js");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "flaky-cjs-package" }),
    );
    await writeFile(
      entryFile,
      `if (!globalThis.__mreactFlakyReady) {
  throw new Error("boom-first-load");
}
globalThis.__mreactFlakyLoads = (globalThis.__mreactFlakyLoads ?? 0) + 1;
exports.value = 1;
`,
    );
    const state = globalThis as { __mreactFlakyLoads?: number; __mreactFlakyReady?: boolean };
    state.__mreactFlakyReady = false;
    const entryUrl = pathToFileURL(entryFile).href;
    const named = (label: string) =>
      importAppRouterSourceModule<{ value: number }>({
        code: `import { value } from ${JSON.stringify(entryUrl)};

export { value };`,
        label,
      });
    const sideEffect = (label: string) =>
      importAppRouterSourceModule<{ loaded: boolean }>({
        code: `import ${JSON.stringify(entryUrl)};

export const loaded = true;`,
        label,
      });

    await expect(named("module-runner-flaky-named-first")).rejects.toThrow(/boom-first-load/u);
    await expect(sideEffect("module-runner-flaky-effect-first")).rejects.toThrow(
      /boom-first-load/u,
    );
    state.__mreactFlakyReady = true;

    expect((await named("module-runner-flaky-named-second")).value).toBe(1);
    expect((await sideEffect("module-runner-flaky-effect-second")).loaded).toBe(true);
    expect(state.__mreactFlakyLoads).toBe(1);
  });
});
