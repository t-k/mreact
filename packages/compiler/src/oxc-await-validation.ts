import {
  unsupportedAwaitInnerComponentDiagnostic,
  unsupportedNestedAwaitDiagnostic,
} from "./diagnostics.js";
import type { JsxNodeIr } from "./ir.js";
import type { Diagnostic } from "./types.js";

export function validateOxcAwaitCompatComponents(
  node: JsxNodeIr,
  diagnostics: Pick<Diagnostic, "code" | "message">[],
  options: { allowCompatComponents?: boolean } = {},
  insideAwait = false,
): void {
  if (node.kind === "component") {
    if (insideAwait && !(options.allowCompatComponents === true && node.runtime === "compat")) {
      diagnostics.push(unsupportedAwaitInnerComponentDiagnostic(node.name));
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
  diagnostics: Pick<Diagnostic, "code" | "message">[],
  insideAwait = false,
): void {
  if (node.kind === "async-boundary") {
    if (insideAwait) {
      diagnostics.push(unsupportedNestedAwaitDiagnostic());
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
