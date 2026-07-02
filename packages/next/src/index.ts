import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { transform } from "@reckona/mreact-compiler";

/** Configures the root directory scanned for `.mreact.tsx` component files. */
export interface GenerateMreactComponentsOptions {
  rootDir: string;
}

/** Describes one source component and the wrapper and DOM modules generated for it. */
export interface GeneratedMreactComponent {
  source: string;
  output: string;
  domOutput: string;
}

/** Contains the generated wrapper module code and browser DOM module code for a component file. */
export interface CompiledMreactComponentModule {
  wrapperCode: string;
  domCode: string;
}

/** Generates wrapper and DOM modules for every `.mreact.tsx` component under a root directory. */
export async function generateMreactComponents(
  options: GenerateMreactComponentsOptions,
): Promise<GeneratedMreactComponent[]> {
  const sources = await findMreactSources(options.rootDir);
  const generated: GeneratedMreactComponent[] = [];

  for (const source of sources) {
    const code = await readFile(source, "utf8");
    const output = outputPathForSource(source);
    const domOutput = domOutputPathForSource(source);
    const generatedCode = compileMreactComponentModule(code, source, {
      domImportPath: importPathForGeneratedModule(output, domOutput),
    });

    await writeFile(output, generatedCode.wrapperCode);
    await writeFile(domOutput, generatedCode.domCode);
    generated.push({ source, output, domOutput });
  }

  return generated;
}

/** Configures the import path from the wrapper module to the generated DOM module. */
export interface CompileMreactComponentModuleOptions {
  domImportPath: string;
}

/** Compiles one `.mreact.tsx` component module into wrapper and DOM module source code. */
export function compileMreactComponentModule(
  code: string,
  filename: string,
  options: CompileMreactComponentModuleOptions,
): CompiledMreactComponentModule {
  const compiled = transform({
    code,
    filename,
    target: "client",
    dev: true,
  });

  if (compiled.metadata.components.length === 0) {
    throw new Error(`${filename} must export at least one mreact JSX component.`);
  }

  const components = compiled.metadata.components
    .filter((component) => hasSourceExport(code, component.name, component.exportName))
    .map((component) => ({
      name: component.name,
      exportName: component.exportName,
      moduleAccess:
        component.exportName === "default" ? "module.default" : `module.${component.name}`,
    }));

  if (components.length === 0) {
    throw new Error(`${filename} must export at least one mreact JSX component.`);
  }
  const wrappers = components
    .map(
      (component) => `const ${component.name}$mounted = new WeakMap<Element, Node>();
const ${component.name}$mounting = new WeakSet<Element>();
${emitExportFunction(component.exportName, component.name)}(props: Record<string, unknown>): never {
  return (
    <span
      data-mreact-component=${JSON.stringify(component.name)}
      ref={(node: Element | null) => {
      if (node === null || ${component.name}$mounted.has(node) || ${component.name}$mounting.has(node)) {
        return;
      }

      ${component.name}$mounting.add(node);
      void import(${JSON.stringify(options.domImportPath)}).then((module) => {
        const rendered = (${component.moduleAccess} as (props: Record<string, unknown>) => Node)(props);
        node.replaceChildren(rendered);
        ${component.name}$mounted.set(node, rendered);
      });
      }}
    />
  ) as never;
}`,
    )
    .join("\n\n");

  return {
    wrapperCode: `// @ts-nocheck
"use client";
${wrappers}
`,
    domCode: `// @ts-nocheck
${compiled.code}`,
  };
}

async function findMreactSources(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const sources: string[] = [];

  for (const entry of entries) {
    const path = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      sources.push(...(await findMreactSources(path)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".mreact.tsx")) {
      sources.push(path);
    }
  }

  return sources.sort();
}

function outputPathForSource(source: string): string {
  return join(dirname(source), `${basename(source, ".mreact.tsx")}.tsx`);
}

function domOutputPathForSource(source: string): string {
  return join(dirname(source), `${basename(source, ".mreact.tsx")}.mreact-dom.ts`);
}

function importPathForGeneratedModule(from: string, to: string): string {
  const extensionless = relative(dirname(from), to).replace(/\.ts$/, "");

  return extensionless.startsWith(".") ? extensionless : `./${extensionless}`;
}

function emitExportFunction(exportName: string, name: string): string {
  return exportName === "default" ? `export default function ${name}` : `export function ${name}`;
}

function hasSourceExport(code: string, name: string, exportName: string): boolean {
  if (exportName === "default") {
    return /\bexport\s+default\b/.test(code);
  }

  return (
    new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${escapeRegExp(name)}\\b`).test(code) ||
    new RegExp(`\\bexport\\s+(?:const|let|var)\\s+${escapeRegExp(name)}\\b`).test(code) ||
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${escapeRegExp(exportName)}\\b[^}]*\\}`).test(code)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Formats generated component paths as a human-readable CLI summary. */
export function formatGeneratedMreactComponents(
  generated: readonly GeneratedMreactComponent[],
  rootDir: string,
): string {
  if (generated.length === 0) {
    return "No .mreact.tsx components found.";
  }

  return generated
    .map(
      (item) =>
        `${relative(rootDir, item.source)} -> ${relative(rootDir, item.output)}, ${relative(rootDir, item.domOutput)}`,
    )
    .join("\n");
}
