import * as ts from "typescript";
import type {
  AsyncBoundaryIr,
  AttributeIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import {
  unsupportedComponentReferenceDiagnostic,
  unsupportedServerDynamicAttributeDiagnostic,
  unsupportedServerEventHandlerDiagnostic,
  unsupportedSpreadAttributeDiagnostic,
} from "./diagnostics.js";
import { printNode } from "./parse.js";
import type { CompileTarget, Diagnostic } from "./types.js";

export function analyzeModule(sourceFile: ts.SourceFile, target: CompileTarget): {
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

    const returnStatementIndex = statement.body.statements.findIndex(
      ts.isReturnStatement,
    );
    const returnStatement: ts.ReturnStatement | undefined =
      returnStatementIndex === -1
        ? undefined
        : (statement.body.statements[returnStatementIndex] as ts.ReturnStatement);

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

    const bodyStatements = statement.body.statements
      .slice(0, returnStatementIndex)
      .map((bodyStatement) => printNode(sourceFile, bodyStatement));
    const bindingNames = collectComponentBindingNames(
      statement,
      statement.body.statements.slice(0, returnStatementIndex),
    );

    components.push({
      name: statement.name.text,
      exportName: statement.name.text,
      parameters: collectComponentParameters(sourceFile, statement),
      bodyStatements,
      bindingNames,
      root: analyzeJsxRoot(
        sourceFile,
        returnStatement.expression,
        diagnostics,
        target,
      ),
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

function collectComponentParameters(
  sourceFile: ts.SourceFile,
  statement: ts.FunctionDeclaration,
): string[] {
  return statement.parameters.map((parameter) =>
    parameter.name.getText(sourceFile),
  );
}

function analyzeJsxRoot(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
  diagnostics: Diagnostic[],
  target: CompileTarget,
): JsxNodeIr {
  if (ts.isJsxFragment(node)) {
    return {
      kind: "fragment",
      children: analyzeChildren(sourceFile, node.children, diagnostics, target),
    };
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);

    if (/^[A-Z]/.test(tagName)) {
      diagnostics.push(unsupportedComponentReferenceDiagnostic(tagName));
    }

    return {
      kind: "element",
      tagName,
      attributes: analyzeAttributes(
        sourceFile,
        node.attributes,
        diagnostics,
        target,
      ),
      children: [],
    };
  }

  const tagName = node.openingElement.tagName.getText(sourceFile);

  if (tagName === "await") {
    return analyzeAsyncBoundary(sourceFile, node, diagnostics, target);
  }

  if (/^[A-Z]/.test(tagName)) {
    diagnostics.push(unsupportedComponentReferenceDiagnostic(tagName));
  }

  return {
    kind: "element",
    tagName,
    attributes: analyzeAttributes(
      sourceFile,
      node.openingElement.attributes,
      diagnostics,
      target,
    ),
    children: analyzeChildren(sourceFile, node.children, diagnostics, target),
  };
}

function analyzeAsyncBoundary(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement,
  diagnostics: Diagnostic[],
  target: CompileTarget,
): AsyncBoundaryIr {
  const attributes = node.openingElement.attributes;
  const valueCode =
    findJsxExpressionAttribute(sourceFile, attributes, "value") ?? "undefined";
  const catchExpression = findJsxExpressionNodeAttribute(attributes, "catch");
  const renderer = findSingleArrowJsxChild(node.children);
  const catchRenderer =
    catchExpression !== undefined && ts.isArrowFunction(catchExpression)
      ? analyzeArrowJsxRenderer(sourceFile, catchExpression, diagnostics, target)
      : undefined;

  return {
    kind: "async-boundary",
    valueCode,
    valueName: renderer.valueName,
    children: renderer.children,
    ...(catchRenderer === undefined
      ? {}
      : {
          catchName: catchRenderer.valueName,
          catchChildren: catchRenderer.children,
        }),
  };
}

function findJsxExpressionAttribute(
  sourceFile: ts.SourceFile,
  attributes: ts.JsxAttributes,
  name: string,
): string | undefined {
  const expression = findJsxExpressionNodeAttribute(attributes, name);

  return expression === undefined ? undefined : printNode(sourceFile, expression);
}

function findJsxExpressionNodeAttribute(
  attributes: ts.JsxAttributes,
  name: string,
): ts.Expression | undefined {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText() !== name) {
      continue;
    }

    if (
      property.initializer !== undefined &&
      ts.isJsxExpression(property.initializer)
    ) {
      return property.initializer.expression;
    }
  }

  return undefined;
}

function findSingleArrowJsxChild(children: ts.NodeArray<ts.JsxChild>): {
  valueName: string;
  children: JsxNodeIr[];
} {
  for (const child of children) {
    if (
      ts.isJsxExpression(child) &&
      child.expression !== undefined &&
      ts.isArrowFunction(child.expression)
    ) {
      return analyzeArrowJsxRenderer(
        child.getSourceFile(),
        child.expression,
        [],
        "server",
      );
    }
  }

  return {
    valueName: "_value",
    children: [],
  };
}

function analyzeArrowJsxRenderer(
  sourceFile: ts.SourceFile,
  arrow: ts.ArrowFunction,
  diagnostics: Diagnostic[],
  target: CompileTarget,
): {
  valueName: string;
  children: JsxNodeIr[];
} {
  const firstParameter = arrow.parameters[0];
  const valueName = firstParameter?.name.getText(sourceFile) ?? "_value";
  const body = arrow.body;

  if (
    ts.isJsxElement(body) ||
    ts.isJsxSelfClosingElement(body) ||
    ts.isJsxFragment(body)
  ) {
    return {
      valueName,
      children: [analyzeJsxRoot(sourceFile, body, diagnostics, target)],
    };
  }

  return {
    valueName,
    children: [{ kind: "expr", code: printNode(sourceFile, body) }],
  };
}

function analyzeChildren(
  sourceFile: ts.SourceFile,
  children: ts.NodeArray<ts.JsxChild>,
  diagnostics: Diagnostic[],
  target: CompileTarget,
): JsxNodeIr[] {
  return children.flatMap((child, index): JsxNodeIr[] => {
    if (ts.isJsxText(child)) {
      const value = normalizeJsxText(sourceFile, child, children, index);
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
      return [analyzeJsxRoot(sourceFile, child, diagnostics, target)];
    }

    return [];
  });
}

function normalizeJsxText(
  sourceFile: ts.SourceFile,
  text: ts.JsxText,
  siblings: ts.NodeArray<ts.JsxChild>,
  index: number,
): string {
  const rawValue = text.getFullText(sourceFile);
  const value = rawValue.replace(/\s+/g, " ");

  if (value.trim() === "") {
    const isSameLineSeparator = !/[\r\n]/.test(rawValue);
    return isSameLineSeparator &&
      siblings[index - 1] !== undefined &&
      siblings[index + 1] !== undefined
      ? " "
      : "";
  }

  const previousSibling = siblings[index - 1];
  const nextSibling = siblings[index + 1];
  const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
  const preserveLeadingSpace =
    previousSibling !== undefined && !/[\r\n]/.test(leadingWhitespace);
  const preserveTrailingSpace =
    nextSibling !== undefined && !/[\r\n]/.test(trailingWhitespace);

  return value
    .replace(/^\s+/, preserveLeadingSpace ? " " : "")
    .replace(/\s+$/, preserveTrailingSpace ? " " : "");
}

function collectComponentBindingNames(
  statement: ts.FunctionDeclaration,
  bodyStatements: readonly ts.Statement[],
): string[] {
  const names = new Set<string>();

  for (const parameter of statement.parameters) {
    collectBindingName(parameter.name, names);
  }

  for (const bodyStatement of bodyStatements) {
    collectStatementBindingNames(bodyStatement, names);
  }

  return Array.from(names);
}

function collectStatementBindingNames(
  statement: ts.Statement,
  names: Set<string>,
): void {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingName(declaration.name, names);
    }
  }

  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    names.add(statement.name.text);
  }

  if (!isNestedScopeBoundary(statement)) {
    collectNestedVarBindingNames(statement, names);
  }
}

function collectNestedVarBindingNames(node: ts.Node, names: Set<string>): void {
  node.forEachChild((child) => {
    if (isNestedScopeBoundary(child)) {
      return;
    }

    if (
      ts.isVariableDeclarationList(child) &&
      (child.flags & ts.NodeFlags.BlockScoped) === 0
    ) {
      for (const declaration of child.declarations) {
        collectBindingName(declaration.name, names);
      }
    }

    collectNestedVarBindingNames(child, names);
  });
}

function isNestedScopeBoundary(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  );
}

function collectBindingName(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingName(element.name, names);
    }
  }
}

function analyzeAttributes(
  sourceFile: ts.SourceFile,
  attributes: ts.JsxAttributes,
  diagnostics: Diagnostic[],
  target: CompileTarget,
): AttributeIr[] {
  return attributes.properties.flatMap((property): AttributeIr[] => {
    if (ts.isJsxSpreadAttribute(property)) {
      diagnostics.push(unsupportedSpreadAttributeDiagnostic());
      return [];
    }

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
        if (target === "server") {
          diagnostics.push(unsupportedServerEventHandlerDiagnostic(name));
        }

        return [
          {
            kind: "event",
            name,
            eventName: name.slice(2).toLowerCase(),
            code,
          },
        ];
      }

      if (target === "server") {
        diagnostics.push(unsupportedServerDynamicAttributeDiagnostic(name));
      }

      return [{ kind: "dynamic-attr", name, code }];
    }

    return [];
  });
}
