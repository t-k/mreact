import {
  unsupportedAwaitInnerComponentDiagnostic,
  unsupportedNestedAwaitDiagnostic,
} from "./diagnostics.js";
import type { JsxNodeIr } from "./ir.js";
import type { Diagnostic } from "./types.js";

export function validateOxcAwaitCompatComponents(
  node: JsxNodeIr,
  diagnostics: Diagnostic[],
  options: { allowCompatComponents?: boolean } = {},
  insideAwait = false,
): void {
  if (node.kind === "component") {
    if (insideAwait && node.runtime === "compat" && options.allowCompatComponents !== true) {
      diagnostics.push(unsupportedAwaitInnerComponentDiagnostic(node.name, node.loc));
    }

    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          validateOxcAwaitCompatComponents(child, diagnostics, options, insideAwait);
        }
      }
    }
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, options, insideAwait);
    }
    return;
  }

  if (node.kind === "async-boundary") {
    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      validateOxcAwaitCompatComponents(child, diagnostics, options, true);
    }
    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      validateOxcAwaitCompatComponents(child, diagnostics, options, insideAwait);
    }
    return;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, options, insideAwait);
    }
    return;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, options, insideAwait);
    }
  }
}

export function validateOxcNestedAwait(
  node: JsxNodeIr,
  diagnostics: Diagnostic[],
  insideAwait = false,
): void {
  if (node.kind === "async-boundary") {
    if (insideAwait) {
      diagnostics.push(unsupportedNestedAwaitDiagnostic(node.loc));
    }

    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      validateOxcNestedAwait(child, diagnostics, true);
    }
    return;
  }

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          validateOxcNestedAwait(child, diagnostics, insideAwait);
        }
      }
    }
    for (const child of node.children) {
      validateOxcNestedAwait(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      validateOxcNestedAwait(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      validateOxcNestedAwait(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      validateOxcNestedAwait(child, diagnostics, insideAwait);
    }
  }
}
