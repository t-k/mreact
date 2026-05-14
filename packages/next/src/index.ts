import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { transform } from "@reckona/mreact-compiler";

export interface GenerateMreactComponentsOptions {
  rootDir: string;
}

export interface GeneratedMreactComponent {
  source: string;
  output: string;
  domOutput: string;
}

export interface CompiledMreactComponentModule {
  wrapperCode: string;
  domCode: string;
}

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

export interface CompileMreactComponentModuleOptions {
  domImportPath: string;
}

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
    .filter((component) => hasCompiledExport(compiled.code, component.name, component.exportName))
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

function hasCompiledExport(code: string, name: string, exportName: string): boolean {
  return code.includes(`${emitExportFunction(exportName, name)}(`);
}

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
