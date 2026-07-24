import {
  bindDomRef,
  bindEvent,
  bindList,
  bindProp,
  bindSpreadProps,
  bindText,
  createList,
  createTemplate,
  insertDynamic,
} from "@reckona/mreact-reactive-dom";
import {
  createContext,
  createRoot,
  Children,
  cloneElement,
  Component,
  createElement,
  PureComponent,
  hydrateRoot,
  renderChildToString,
  renderContextConsumerToString,
  renderContextProviderToString,
  renderToString,
  Suspense,
  memo,
  useEffect,
  useContext,
  useReducer,
  useState,
} from "@reckona/mreact-compat";
import {
  Fragment,
  REACTIVE_STATE_BINDING_META,
  REACTIVE_TEXT_BINDING_META,
  createReactiveDomBlock,
  jsx,
  jsxs,
} from "@reckona/mreact-compat/jsx-runtime";
import { jsxDEV } from "@reckona/mreact-compat/jsx-dev-runtime";
import { cell, computed, effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import {
  createStringSink,
  renderAsyncBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseBoundary,
  renderReactSuspenseOutOfOrderBoundary,
} from "@reckona/mreact-server";
import { stripTypeScriptWithOxc } from "../src/oxc-transform.js";

function escapeHtmlBatch(values: readonly unknown[]): string[] {
  return values.map((value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;"),
  );
}

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
  const exports = extractFunctionExports(code);
  const runnableCode = stripTypeScriptWithOxc(
    stripFunctionExports(stripImports(code)),
  );
  const returnEntries = exports.map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`).join(", ");
  const runtimeEntries = [
    ...extractClientRuntimeEntries(code),
    ...extractReactiveCoreRuntimeEntries(code),
  ];

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(...runtimeEntries.map((entry) => entry.value)) as ComponentExports;
}

export function compileClientComponent(code: string, exportName = "App"): () => Node {
  return compileClientModule(code)[exportName];
}

export function runServerComponent(
  code: string,
  exportName = "App",
  props?: Record<string, unknown>,
): string {
  const exports = extractFunctionExports(code);
  const runnableCode = stripFunctionExports(stripImports(code));
  const returnEntries = exports.map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`).join(", ");
  const module = new Function(`${runnableCode}\nreturn { ${returnEntries} };`)() as Record<
    string,
    (props?: Record<string, unknown>) => string
  >;
  const component = module[exportName];

  if (component === undefined) {
    throw new Error(`Server export '${exportName}' was not found.`);
  }

  return component(props);
}

export async function runAsyncServerComponent(code: string): Promise<string> {
  const runnableCode = stripImports(code)
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const App = new Function(`${runnableCode}\nreturn App;`)() as () => string | Promise<string>;
  return await App();
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

  return renderToString(component as (props?: Record<string, unknown>) => string, props);
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

export async function runCompatHydration(
  serverCode: string,
  clientCode: string,
  exportName = "App",
  ...args: unknown[]
): Promise<HTMLElement> {
  const html = runCompatServerComponent(
    serverCode,
    exportName,
    args[0] as Record<string, unknown> | undefined,
  );
  const module = compileCompatModule(clientCode);
  const component = module[exportName];

  if (component === undefined) {
    throw new Error(`Compat component export '${exportName}' was not found.`);
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  hydrateRoot(container, component(...args));
  await flushEffects();
  return container;
}

export function compileCompatModule(code: string): CompatComponentExports {
  const exports = extractFunctionExports(code);
  const runnableCode = stripFunctionExports(stripImports(code));
  const runtimeEntries = [
    ...extractCompatRuntimeEntries(code),
    ...extractClientRuntimeEntries(code),
    ...extractReactCompatRuntimeEntries(code),
  ];
  const returnEntries = exports.map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`).join(", ");

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(...runtimeEntries.map((entry) => entry.value)) as CompatComponentExports;
}

function compileCompatServerModule(code: string): CompatComponentExports {
  const exports = extractFunctionExports(code);
  const runnableCode = stripFunctionExports(stripImports(code));
  const runtimeEntries = extractReactCompatRuntimeEntries(code);
  const returnEntries = exports.map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`).join(", ");

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(...runtimeEntries.map((entry) => entry.value)) as CompatComponentExports;
}

function compileServerStreamModule(code: string): StreamComponentExports {
  const exports = extractFunctionExports(code);
  const runnableCode = stripImports(code)
    .replace(/export default async function ([A-Za-z_$][\w$]*)\s*\(/g, "async function $1(")
    .replace(/export default function ([A-Za-z_$][\w$]*)\s*\(/g, "function $1(")
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const runtimeEntries = [
    ...extractServerRuntimeEntries(code),
    ...extractReactCompatRuntimeEntries(code),
    ...extractNativeEscapeRuntimeEntries(code),
  ];
  const returnEntries = exports.map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`).join(", ");

  return new Function(
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(...runtimeEntries.map((entry) => entry.value)) as StreamComponentExports;
}

function extractNativeEscapeRuntimeEntries(
  code: string,
): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@reckona\/mreact-router\/(?:internal\/)?native-escape";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>escapeHtmlBatch)(?: as (?<localName>[A-Za-z_$][\w$]*))?$/,
    );

    if (match?.groups === undefined) {
      throw new Error(`Unsupported native-escape runtime import: ${specifier}`);
    }

    return {
      localName: match.groups.localName ?? match.groups.importedName,
      value: escapeHtmlBatch,
    };
  });
}

function stripImports(code: string): string {
  return code.replace(/^\s*(?:import[^\n]*\n\s*)+/, "");
}

function stripFunctionExports(code: string): string {
  return code
    .replace(/export default class ([A-Za-z_$][\w$]*)\s*/g, "class $1 ")
    .replace(/export class /g, "class ")
    .replace(/export default function ([A-Za-z_$][\w$]*)\s*\(/g, "function $1(")
    .replace(/export function /g, "function ");
}

function extractFunctionExports(code: string): { exportName: string; localName: string }[] {
  const functionExports = Array.from(
    code.matchAll(/^export (?:(default) )?(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm),
  ).map((match) => ({
    exportName: match[1] === "default" ? "default" : String(match[2]),
    localName: String(match[2]),
  }));
  const classExports = Array.from(
    code.matchAll(/^export (?:(default) )?class ([A-Za-z_$][\w$]*)\s*/gm),
  ).map((match) => ({
    exportName: match[1] === "default" ? "default" : String(match[2]),
    localName: String(match[2]),
  }));

  return [...functionExports, ...classExports];
}

function extractCompatRuntimeEntries(code: string): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@reckona\/mreact-compat\/jsx(?:-dev)?-runtime";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>Fragment|REACTIVE_STATE_BINDING_META|REACTIVE_TEXT_BINDING_META|createReactiveDomBlock|jsx|jsxDEV|jsxs) as (?<localName>[A-Za-z_$][\w$]*)$/,
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

function extractClientRuntimeEntries(code: string): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@reckona\/mreact-reactive-dom";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>bindDomRef|bindEvent|bindList|bindProp|bindSpreadProps|bindText|createList|createTemplate|effect|insertDynamic)(?: as (?<localName>[A-Za-z_$][\w$]*))?$/,
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

function extractReactiveCoreRuntimeEntries(code: string): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@reckona\/mreact-reactive-core";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>cell|computed|effect)(?: as (?<localName>[A-Za-z_$][\w$]*))?$/,
    );

    if (match?.groups === undefined) {
      throw new Error(`Unsupported reactive core runtime import: ${specifier}`);
    }

    return {
      localName: match.groups.localName ?? match.groups.importedName,
      value: getReactiveCoreRuntimeValue(match.groups.importedName),
    };
  });
}

function getReactiveCoreRuntimeValue(importedName: string): unknown {
  if (importedName === "cell") {
    return cell;
  }

  if (importedName === "computed") {
    return computed;
  }

  if (importedName === "effect") {
    return effect;
  }

  throw new Error(`Unsupported reactive core runtime import: ${importedName}`);
}

function getClientRuntimeValue(importedName: string): unknown {
  if (importedName === "bindDomRef") {
    return bindDomRef;
  }

  if (importedName === "createTemplate") {
    return createTemplate;
  }

  if (importedName === "createList") {
    return createList;
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

  if (importedName === "effect") {
    return effect;
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

  if (importedName === "jsxDEV") {
    return jsxDEV;
  }

  if (importedName === "Fragment") {
    return Fragment;
  }

  if (importedName === "REACTIVE_TEXT_BINDING_META") {
    return REACTIVE_TEXT_BINDING_META;
  }

  if (importedName === "REACTIVE_STATE_BINDING_META") {
    return REACTIVE_STATE_BINDING_META;
  }

  if (importedName === "createReactiveDomBlock") {
    return createReactiveDomBlock;
  }

  throw new Error(`Unsupported compat runtime import: ${importedName}`);
}

function extractReactCompatRuntimeEntries(code: string): { localName: string; value: unknown }[] {
  const importMatches = Array.from(
    code.matchAll(/^import \{ (?<specifiers>[^}]+) \} from "@reckona\/mreact-compat";/gm),
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

  if (importedName === "renderChildToString") {
    return renderChildToString;
  }

  if (importedName === "renderContextProviderToString") {
    return renderContextProviderToString;
  }

  if (importedName === "renderContextConsumerToString") {
    return renderContextConsumerToString;
  }

  if (importedName === "createContext") {
    return createContext;
  }

  if (importedName === "createElement") {
    return createElement;
  }

  if (importedName === "cloneElement") {
    return cloneElement;
  }

  if (importedName === "Component") {
    return Component;
  }

  if (importedName === "PureComponent") {
    return PureComponent;
  }

  if (importedName === "Children") {
    return Children;
  }

  if (importedName === "Suspense") {
    return Suspense;
  }

  if (importedName === "memo") {
    return memo;
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

  if (importedName === "useReducer") {
    return useReducer;
  }

  throw new Error(`Unsupported react-compat runtime import: ${importedName}`);
}

function extractServerRuntimeEntries(code: string): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@reckona\/mreact-server";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(", ").map((specifier) => {
    const match = specifier.match(
      /^(?<importedName>renderAsyncBoundary|renderOutOfOrderBoundary|renderOutOfOrderReorderScript|renderReactSuspenseBoundary|renderReactSuspenseOutOfOrderBoundary) as (?<localName>[A-Za-z_$][\w$]*)$/,
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

  if (importedName === "renderReactSuspenseBoundary") {
    return renderReactSuspenseBoundary;
  }

  if (importedName === "renderReactSuspenseOutOfOrderBoundary") {
    return renderReactSuspenseOutOfOrderBoundary;
  }

  throw new Error(`Unsupported server runtime import: ${importedName}`);
}
