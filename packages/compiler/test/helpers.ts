import {
  bindEvent,
  bindList,
  bindProp,
  bindSpreadProps,
  bindText,
  createTemplate,
  insertDynamic,
} from "@modular-react/reactive-dom";
import {
  createContext,
  createRoot,
  renderContextProviderToString,
  renderToString,
  useEffect,
  useContext,
  useState,
} from "@modular-react/react-compat";
import {
  Fragment,
  jsx,
  jsxs,
} from "@modular-react/react-compat/jsx-runtime";
import { flushEffects } from "@modular-react/reactive-core/testing";
import {
  createStringSink,
  renderAsyncBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
} from "@modular-react/server";

type ComponentExports = Record<string, () => Node>;
type CompatComponentExports = Record<string, (...args: unknown[]) => unknown>;
type StreamComponentExports = Record<
  string,
  (sink: ReturnType<typeof createStringSink>, ...args: unknown[]) => unknown
>;

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
  const runtimeEntries = extractClientRuntimeEntries(code);

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(
    ...runtimeEntries.map((entry) => entry.value),
  ) as ComponentExports;
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

export function runCompatServerComponent(
  code: string,
  exportName = "App",
  props?: Record<string, unknown>,
): string {
  const module = compileCompatServerModule(code);
  const component = module[exportName];

  if (component === undefined) {
    throw new Error(`Compat server export '${exportName}' was not found.`);
  }

  return renderToString(
    component as (props?: Record<string, unknown>) => string,
    props,
  );
}

export async function runServerStreamComponent(
  code: string,
  exportName = "App",
  ...args: unknown[]
): Promise<string> {
  const module = compileServerStreamModule(code);
  const component = module[exportName];

  if (component === undefined) {
    throw new Error(`Server stream export '${exportName}' was not found.`);
  }

  const sink = createStringSink();
  await component(sink, ...args);
  await sink.drain();
  return sink.toString();
}

export async function runCompatComponent(
  code: string,
  exportName = "App",
  ...args: unknown[]
): Promise<HTMLElement> {
  const module = compileCompatModule(code);
  const component = module[exportName];

  if (component === undefined) {
    throw new Error(`Compat component export '${exportName}' was not found.`);
  }

  const container = document.createElement("div");
  createRoot(container).render(component(...args));
  await flushEffects();
  return container;
}

export function compileCompatModule(code: string): CompatComponentExports {
  const exportNames = extractFunctionExportNames(code);
  const runnableCode = stripImports(code).replace(
    /export function /g,
    "function ",
  );
  const runtimeEntries = extractCompatRuntimeEntries(code);
  const returnEntries = exportNames
    .map((name) => `${JSON.stringify(name)}: ${name}`)
    .join(", ");

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(
    ...runtimeEntries.map((entry) => entry.value),
  ) as CompatComponentExports;
}

function compileCompatServerModule(code: string): CompatComponentExports {
  const exportNames = extractFunctionExportNames(code);
  const runnableCode = stripImports(code).replace(
    /export function /g,
    "function ",
  );
  const runtimeEntries = extractReactCompatRuntimeEntries(code);
  const returnEntries = exportNames
    .map((name) => `${JSON.stringify(name)}: ${name}`)
    .join(", ");

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(
    ...runtimeEntries.map((entry) => entry.value),
  ) as CompatComponentExports;
}

function compileServerStreamModule(code: string): StreamComponentExports {
  const exportNames = extractFunctionExportNames(code);
  const runnableCode = stripImports(code)
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const runtimeEntries = extractServerRuntimeEntries(code);
  const returnEntries = exportNames
    .map((name) => `${JSON.stringify(name)}: ${name}`)
    .join(", ");

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(
    ...runtimeEntries.map((entry) => entry.value),
  ) as StreamComponentExports;
}

function stripImports(code: string): string {
  return code.replace(/^\s*(?:import[^\n]*\n\s*)+/, "");
}

function extractFunctionExportNames(code: string): string[] {
  return Array.from(
    code.matchAll(/^export (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm),
  )
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

function extractCompatRuntimeEntries(
  code: string,
): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@modular-react\/react-compat\/jsx-runtime";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>Fragment|jsx|jsxs) as (?<localName>[A-Za-z_$][\w$]*)$/,
    );

    if (match?.groups === undefined) {
      throw new Error(`Unsupported compat runtime import: ${specifier}`);
    }

    return {
      localName: match.groups.localName,
      value: getCompatRuntimeValue(match.groups.importedName),
    };
  });
}

function extractClientRuntimeEntries(
  code: string,
): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@modular-react\/reactive-dom";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>bindEvent|bindList|bindProp|bindSpreadProps|bindText|createTemplate|insertDynamic)(?: as (?<localName>[A-Za-z_$][\w$]*))?$/,
    );

    if (match?.groups === undefined) {
      throw new Error(`Unsupported client runtime import: ${specifier}`);
    }

    return {
      localName: match.groups.localName ?? match.groups.importedName,
      value: getClientRuntimeValue(match.groups.importedName),
    };
  });
}

function getClientRuntimeValue(importedName: string): unknown {
  if (importedName === "createTemplate") {
    return createTemplate;
  }

  if (importedName === "bindText") {
    return bindText;
  }

  if (importedName === "bindProp") {
    return bindProp;
  }

  if (importedName === "bindList") {
    return bindList;
  }

  if (importedName === "bindSpreadProps") {
    return bindSpreadProps;
  }

  if (importedName === "bindEvent") {
    return bindEvent;
  }

  if (importedName === "insertDynamic") {
    return insertDynamic;
  }

  throw new Error(`Unsupported client runtime import: ${importedName}`);
}

function getCompatRuntimeValue(importedName: string): unknown {
  if (importedName === "jsx") {
    return jsx;
  }

  if (importedName === "jsxs") {
    return jsxs;
  }

  if (importedName === "Fragment") {
    return Fragment;
  }

  throw new Error(`Unsupported compat runtime import: ${importedName}`);
}

function extractReactCompatRuntimeEntries(
  code: string,
): { localName: string; value: unknown }[] {
  const importMatches = Array.from(
    code.matchAll(
      /^import \{ (?<specifiers>[^}]+) \} from "@modular-react\/react-compat";/gm,
    ),
  );

  return importMatches.flatMap((importMatch) => {
    const specifiers = importMatch.groups?.specifiers;

    if (specifiers === undefined) {
      return [];
    }

    return specifiers.split(", ").map((specifier) => {
      const match = specifier.match(
        /^(?<importedName>[A-Za-z_$][\w$]*)(?: as (?<localName>[A-Za-z_$][\w$]*))?$/,
      );

      if (match?.groups === undefined) {
        throw new Error(`Unsupported react-compat runtime import: ${specifier}`);
      }

      return {
        localName: match.groups.localName ?? match.groups.importedName,
        value: getReactCompatRuntimeValue(match.groups.importedName),
      };
    });
  });
}

function getReactCompatRuntimeValue(importedName: string): unknown {
  if (importedName === "renderToString") {
    return renderToString;
  }

  if (importedName === "renderContextProviderToString") {
    return renderContextProviderToString;
  }

  if (importedName === "createContext") {
    return createContext;
  }

  if (importedName === "useEffect") {
    return useEffect;
  }

  if (importedName === "useContext") {
    return useContext;
  }

  if (importedName === "useState") {
    return useState;
  }

  throw new Error(`Unsupported react-compat runtime import: ${importedName}`);
}

function extractServerRuntimeEntries(
  code: string,
): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@modular-react\/server";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>renderAsyncBoundary|renderOutOfOrderBoundary|renderOutOfOrderReorderScript) as (?<localName>[A-Za-z_$][\w$]*)$/,
    );

    if (match?.groups === undefined) {
      throw new Error(`Unsupported server runtime import: ${specifier}`);
    }

    return {
      localName: match.groups.localName,
      value: getServerRuntimeValue(match.groups.importedName),
    };
  });
}

function getServerRuntimeValue(importedName: string): unknown {
  if (importedName === "renderAsyncBoundary") {
    return renderAsyncBoundary;
  }

  if (importedName === "renderOutOfOrderBoundary") {
    return renderOutOfOrderBoundary;
  }

  if (importedName === "renderOutOfOrderReorderScript") {
    return renderOutOfOrderReorderScript;
  }

  throw new Error(`Unsupported server runtime import: ${importedName}`);
}
