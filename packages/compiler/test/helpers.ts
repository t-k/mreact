import {
  bindEvent,
  bindProp,
  bindText,
  createTemplate,
} from "@modular-react/reactive-dom";
import { createRoot } from "../../react-compat/src/index.js";
import {
  Fragment,
  jsx,
  jsxs,
} from "../../react-compat/src/jsx-runtime.js";
import { flushEffects } from "@modular-react/reactive-core/testing";

type ComponentExports = Record<string, () => Node>;
type CompatComponentExports = Record<string, () => unknown>;

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

export async function runCompatComponent(
  code: string,
  exportName = "App",
): Promise<HTMLElement> {
  const module = compileCompatModule(code);
  const component = module[exportName];

  if (component === undefined) {
    throw new Error(`Compat component export '${exportName}' was not found.`);
  }

  const container = document.createElement("div");
  createRoot(container).render(component());
  await flushEffects();
  return container;
}

export function compileCompatModule(code: string): CompatComponentExports {
  const exportNames = extractFunctionExportNames(code);
  const runnableCode = stripImports(code).replace(
    /export function /g,
    "function ",
  );
  const returnEntries = exportNames
    .map((name) => `${JSON.stringify(name)}: ${name}`)
    .join(", ");

  return new Function(
    "_jsx",
    "_jsxs",
    "_Fragment",
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(jsx, jsxs, Fragment) as CompatComponentExports;
}

function stripImports(code: string): string {
  return code.replace(/^\s*(?:import[^\n]*\n\s*)+/, "");
}

function extractFunctionExportNames(code: string): string[] {
  return Array.from(code.matchAll(/^export function ([A-Za-z_$][\w$]*)\s*\(/gm))
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}
