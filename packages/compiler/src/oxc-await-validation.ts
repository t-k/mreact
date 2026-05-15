import { unsupportedAwaitInnerComponentDiagnostic } from "./diagnostics.js";
import type { JsxNodeIr } from "./ir.js";
import type { Diagnostic } from "./types.js";

export function validateOxcAwaitCompatComponents(
  node: JsxNodeIr,
  diagnostics: Pick<Diagnostic, "code" | "message">[],
  insideAwait = false,
): void {
  if (node.kind === "component") {
    if (insideAwait && node.clientReference !== undefined) {
      diagnostics.push(unsupportedAwaitInnerComponentDiagnostic(node.name));
    }

    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
        }
      }
    }
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "async-boundary") {
    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      validateOxcAwaitCompatComponents(child, diagnostics, true);
    }
    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
  }
}
