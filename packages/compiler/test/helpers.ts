import {
  bindEvent,
  bindProp,
  bindText,
  createTemplate,
} from "@modular-react/reactive-dom";
import { flushEffects } from "@modular-react/reactive-core/testing";

type ComponentExports = Record<string, () => Node>;

export async function runClientComponent(code: string): Promise<Node> {
  const App = compileClientComponent(code);
  const node = App();
  await flushEffects();
  return node;
}

export function compileClientModule(code: string): ComponentExports {
  const exportNames = extractFunctionExportNames(code);
  const runnableCode = stripImports(code).replace(
    /export function /g,
    "function ",
  );
  const returnEntries = exportNames
    .map((name) => `${JSON.stringify(name)}: ${name}`)
    .join(", ");

  return new Function(
    "createTemplate",
    "bindText",
    "bindProp",
    "bindEvent",
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(createTemplate, bindText, bindProp, bindEvent) as ComponentExports;
}

export function compileClientComponent(
  code: string,
  exportName = "App",
): () => Node {
  return compileClientModule(code)[exportName];
}

export function runServerComponent(code: string): string {
  const runnableCode = code.replace(/export function /g, "function ");
  const App = new Function(`${runnableCode}\nreturn App;`)() as () => string;
  return App();
}

function stripImports(code: string): string {
  return code.replace(/^\s*(?:import[^\n]*\n\s*)+/, "");
}

function extractFunctionExportNames(code: string): string[] {
  return Array.from(code.matchAll(/^export function ([A-Za-z_$][\w$]*)\s*\(/gm))
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}
