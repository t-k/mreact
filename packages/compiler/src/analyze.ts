import * as ts from "typescript";
import type {
  AttributeIr,
  ComponentIr,
  JsxElementIr,
  JsxFragmentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import { printNode } from "./parse.js";
import type { Diagnostic } from "./types.js";

export function analyzeModule(sourceFile: ts.SourceFile): {
  ir: ModuleIr;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const components: ComponentIr[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) {
      continue;
    }

    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );

    if (!isExported || statement.body === undefined) {
      continue;
    }

    const returnStatement = statement.body.statements.find(
      ts.isReturnStatement,
    );

    if (
      returnStatement?.expression === undefined ||
      !isSupportedJsxRoot(returnStatement.expression)
    ) {
      diagnostics.push({
        level: "error",
        code: "MR_UNSUPPORTED_COMPONENT_RETURN",
        message: `Component '${statement.name.text}' must return a JSX element or fragment in Phase 3.`,
      });
      continue;
    }

    components.push({
      name: statement.name.text,
      exportName: statement.name.text,
      root: analyzeJsxRoot(sourceFile, returnStatement.expression),
    });
  }

  return {
    ir: { components },
    diagnostics,
  };
}

function isSupportedJsxRoot(
  node: ts.Expression,
): node is ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  );
}

function analyzeJsxRoot(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
): JsxElementIr | JsxFragmentIr {
  if (ts.isJsxFragment(node)) {
    return {
      kind: "fragment",
      children: analyzeChildren(sourceFile, node.children),
    };
  }

  if (ts.isJsxSelfClosingElement(node)) {
    return {
      kind: "element",
      tagName: node.tagName.getText(sourceFile),
      attributes: analyzeAttributes(sourceFile, node.attributes),
      children: [],
    };
  }

  return {
    kind: "element",
    tagName: node.openingElement.tagName.getText(sourceFile),
    attributes: analyzeAttributes(sourceFile, node.openingElement.attributes),
    children: analyzeChildren(sourceFile, node.children),
  };
}

function analyzeChildren(
  sourceFile: ts.SourceFile,
  children: ts.NodeArray<ts.JsxChild>,
): JsxNodeIr[] {
  return children.flatMap((child): JsxNodeIr[] => {
    if (ts.isJsxText(child)) {
      const value = child.getText(sourceFile).replace(/\s+/g, " ").trim();
      return value === "" ? [] : [{ kind: "text", value }];
    }

    if (ts.isJsxExpression(child)) {
      return child.expression === undefined
        ? []
        : [{ kind: "expr", code: printNode(sourceFile, child.expression) }];
    }

    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      return [analyzeJsxRoot(sourceFile, child)];
    }

    return [];
  });
}

function analyzeAttributes(
  sourceFile: ts.SourceFile,
  attributes: ts.JsxAttributes,
): AttributeIr[] {
  return attributes.properties.flatMap((property): AttributeIr[] => {
    if (!ts.isJsxAttribute(property)) {
      return [];
    }

    const name = property.name.getText(sourceFile);
    const initializer = property.initializer;

    if (initializer === undefined) {
      return [{ kind: "static-attr", name, value: "" }];
    }

    if (ts.isStringLiteral(initializer)) {
      return [{ kind: "static-attr", name, value: initializer.text }];
    }

    if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
      const code = printNode(sourceFile, initializer.expression);

      if (/^on[A-Z]/.test(name)) {
        return [
          {
            kind: "event",
            name,
            eventName: name.slice(2).toLowerCase(),
            code,
          },
        ];
      }

      return [{ kind: "dynamic-attr", name, code }];
    }

    return [];
  });
}
