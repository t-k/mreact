import * as ts from "typescript";
import type {
  AsyncBoundaryIr,
  AttributeIr,
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import {
  unsupportedBodyStatementJsxDiagnostic,
  unsupportedComponentReferenceDiagnostic,
  unsupportedServerDynamicAttributeDiagnostic,
  unsupportedServerEventHandlerDiagnostic,
  unsupportedSpreadAttributeDiagnostic,
  unsupportedTopLevelJsxInitializerDiagnostic,
} from "./diagnostics.js";
import { printJavaScriptNode, printNode } from "./parse.js";
import type { CompileTarget, Diagnostic } from "./types.js";

interface AnalyzeModuleOptions {
  topLevelJsx?: "diagnostic" | "compat-object";
}

export function analyzeModule(
  sourceFile: ts.SourceFile,
  target: CompileTarget,
  options: AnalyzeModuleOptions = {},
): {
  ir: ModuleIr;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const userImports: string[] = [];
  const moduleStatements: string[] = [];
  const moduleBindingNames = new Set<string>();
  const components: ComponentIr[] = [];
  const componentNames = collectComponentNames(sourceFile);

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      userImports.push(printNode(sourceFile, statement));
      collectImportBindingNames(statement, moduleBindingNames);
      continue;
    }

    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) {
      if (hasTopLevelJsxInitializer(statement)) {
        const loweredStatement =
          options.topLevelJsx === "compat-object" && ts.isVariableStatement(statement)
            ? lowerTopLevelJsxVariableStatement(
                sourceFile,
                statement,
                diagnostics,
                target,
                componentNames,
              )
            : undefined;

        if (loweredStatement !== undefined) {
          moduleStatements.push(loweredStatement);
          collectStatementBindingNames(statement, moduleBindingNames);
          continue;
        }

        diagnostics.push(
          unsupportedTopLevelJsxInitializerDiagnostic(
            getLocation(sourceFile, statement),
          ),
        );
      }

      if (shouldPreserveModuleStatement(statement)) {
        moduleStatements.push(printJavaScriptNode(sourceFile, statement));
        collectStatementBindingNames(statement, moduleBindingNames);
      }

      continue;
    }

    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );

    if (statement.body === undefined) {
      if (shouldPreserveModuleStatement(statement)) {
        moduleStatements.push(printJavaScriptNode(sourceFile, statement));
        collectStatementBindingNames(statement, moduleBindingNames);
      }

      continue;
    }

    const returnStatementIndex = statement.body.statements.findIndex(
      ts.isReturnStatement,
    );
    const returnStatement: ts.ReturnStatement | undefined =
      returnStatementIndex === -1
        ? undefined
        : (statement.body.statements[returnStatementIndex] as ts.ReturnStatement);
    const returnExpression =
      returnStatement?.expression === undefined
        ? undefined
        : unwrapParentheses(returnStatement.expression);

    if (returnExpression === undefined || !isSupportedJsxRoot(returnExpression)) {
      if (isExported) {
        diagnostics.push({
          level: "error",
          code: "MR_UNSUPPORTED_COMPONENT_RETURN",
          message: `Component '${statement.name.text}' must return a JSX element or fragment.`,
        });
      } else if (shouldPreserveModuleStatement(statement)) {
        moduleStatements.push(printJavaScriptNode(sourceFile, statement));
        collectStatementBindingNames(statement, moduleBindingNames);
      }
      continue;
    }

    const bodyStatements = statement.body.statements
      .slice(0, returnStatementIndex)
      .flatMap((bodyStatement) => {
        if (containsJsxSyntax(bodyStatement)) {
          const loweredStatement = lowerBodyStatementJsx(sourceFile, bodyStatement);

          if (loweredStatement !== undefined) {
            return [loweredStatement];
          }

          diagnostics.push(
            unsupportedBodyStatementJsxDiagnostic(
              getLocation(sourceFile, bodyStatement),
            ),
          );
          return [];
        }

        return [printJavaScriptNode(sourceFile, bodyStatement)];
      });
    const renderValueBindings = collectBodyJsxBindingNames(
      sourceFile,
      statement.body.statements.slice(0, returnStatementIndex),
    );
    const bindingNames = collectComponentBindingNames(
      statement,
      statement.body.statements.slice(0, returnStatementIndex),
    );

    components.push({
      name: statement.name.text,
      exportName: statement.name.text,
      ...(isExported ? {} : { exported: false }),
      parameters: collectComponentParameters(sourceFile, statement),
      bodyStatements,
      bindingNames,
      root: analyzeJsxRoot(
        sourceFile,
        returnExpression,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      ),
    });
  }

  return {
    ir: {
      userImports,
      moduleStatements,
      moduleBindingNames: Array.from(moduleBindingNames),
      components,
    },
    diagnostics,
  };
}

function lowerTopLevelJsxVariableStatement(
  sourceFile: ts.SourceFile,
  statement: ts.VariableStatement,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
): string | undefined {
  const declarations = statement.declarationList.declarations.map((declaration) => {
    if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
      return undefined;
    }

    const initializer = unwrapParentheses(declaration.initializer);
    const code = containsJsxSyntax(initializer)
      ? lowerCompatJsxExpression(
          sourceFile,
          initializer,
          diagnostics,
          target,
          componentNames,
        )
      : printNode(sourceFile, initializer);

    return code === undefined ? undefined : `${declaration.name.text} = ${code}`;
  });

  if (declarations.some((declaration) => declaration === undefined)) {
    return undefined;
  }

  const declarationKind =
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
      ? "const"
      : (statement.declarationList.flags & ts.NodeFlags.Let) !== 0
        ? "let"
        : "var";
  const exportPrefix =
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
      ? "export "
      : "";

  return `${exportPrefix}${declarationKind} ${declarations.join(", ")};`;
}

function lowerCompatJsxExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
): string | undefined {
  const nodes = analyzeJsxExpressionAsChildren(
    sourceFile,
    expression,
    diagnostics,
    target,
    componentNames,
  );

  if (nodes.length === 0) {
    return "null";
  }

  if (nodes.length === 1) {
    return emitCompatObjectNode(nodes[0] as JsxNodeIr);
  }

  return `[${nodes.map(emitCompatObjectNode).join(", ")}]`;
}

function emitCompatObjectNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `(${node.conditionCode}) ? ${emitCompatObjectChildren(node.whenTrue)} : ${emitCompatObjectChildren(node.whenFalse)}`;
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return `(${node.itemsCode}).map((${parameters}) => ${emitCompatObjectChildren(node.children)})`;
  }

  if (node.kind === "fragment") {
    return emitCompatObjectElement(
      'Symbol.for("modular.react.fragment")',
      [],
      node.children,
    );
  }

  if (node.kind === "component") {
    return emitCompatObjectElement(
      node.name,
      node.props.map(emitCompatObjectComponentProp),
      node.children,
      node.keyCode,
    );
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  return emitCompatObjectElement(
    JSON.stringify(node.tagName),
    node.attributes.map(emitCompatObjectAttribute),
    node.children,
    node.keyCode,
  );
}

function emitCompatObjectChildren(children: readonly JsxNodeIr[]): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitCompatObjectNode(children[0] as JsxNodeIr);
  }

  return `[${children.map(emitCompatObjectNode).join(", ")}]`;
}

function emitCompatObjectElement(
  typeCode: string,
  propEntries: readonly string[],
  children: readonly JsxNodeIr[],
  explicitKeyCode?: string,
): string {
  const entries = [...propEntries];

  if (children.length > 0) {
    entries.push(`children: ${emitCompatObjectChildren(children)}`);
  }

  const keyExpression =
    explicitKeyCode === undefined
      ? '_props.key === undefined ? null : String(_props.key)'
      : `String(${explicitKeyCode})`;

  return [
    "(() => {",
    `  const _props = { ${entries.join(", ")} };`,
    `  const _key = ${keyExpression};`,
    "  const _ref = _props.ref ?? null;",
    "  delete _props.key;",
    "  delete _props.ref;",
    '  return { $$typeof: Symbol.for("modular.react.element"),',
    `    type: ${typeCode},`,
    "    key: _key,",
    "    ref: _ref,",
    "    props: _props };",
    "})()",
  ].join("\n");
}

function emitCompatObjectAttribute(attr: AttributeIr): string {
  if (attr.kind === "spread-attr") {
    return `...(${attr.code})`;
  }

  if (attr.kind === "static-attr") {
    return `${emitCompatObjectPropName(attr.name)}: ${JSON.stringify(attr.value)}`;
  }

  if (attr.kind === "dynamic-attr") {
    return `${emitCompatObjectPropName(attr.name)}: (${attr.code})`;
  }

  return `${emitCompatObjectPropName(attr.name)}: ${attr.code}`;
}

function emitCompatObjectComponentProp(prop: ComponentPropIr): string {
  if (prop.kind === "spread-prop") {
    return `...(${prop.code})`;
  }

  if (prop.kind === "render-prop") {
    return `${emitCompatObjectPropName(prop.name)}: ${emitCompatObjectChildren(prop.children)}`;
  }

  return `${emitCompatObjectPropName(prop.name)}: (${prop.code})`;
}

function emitCompatObjectPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function lowerBodyStatementJsx(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
): string | undefined {
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return undefined;
  }

  const declaration = statement.declarationList.declarations[0];

  if (declaration === undefined || declaration.initializer === undefined) {
    return undefined;
  }

  const name = declaration.name.getText(sourceFile);
  const initializer = unwrapParentheses(declaration.initializer);
  const lowered = lowerBodyJsxExpression(sourceFile, initializer);

  if (lowered === undefined) {
    return undefined;
  }

  const declarationKind =
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
      ? "const"
      : (statement.declarationList.flags & ts.NodeFlags.Let) !== 0
        ? "let"
        : "var";

  return `${declarationKind} ${name} = ${lowered};`;
}

function collectBodyJsxBindingNames(
  sourceFile: ts.SourceFile,
  statements: readonly ts.Statement[],
): Set<string> {
  const names = new Set<string>();

  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer !== undefined &&
        lowerBodyJsxExpression(sourceFile, unwrapParentheses(declaration.initializer)) !==
          undefined
      ) {
        names.add(declaration.name.getText(sourceFile));
      }
    }
  }

  return names;
}

function lowerBodyJsxExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
): string | undefined {
  if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) {
    return lowerBodyJsxElement(sourceFile, expression);
  }

  if (ts.isParenthesizedExpression(expression)) {
    return lowerBodyJsxExpression(sourceFile, expression.expression);
  }

  if (ts.isConditionalExpression(expression)) {
    const whenTrue = lowerBodyJsxExpression(sourceFile, unwrapParentheses(expression.whenTrue));
    const whenFalse = lowerBodyJsxExpression(sourceFile, unwrapParentheses(expression.whenFalse));

    if (whenTrue === undefined || whenFalse === undefined) {
      return undefined;
    }

    return `((${printNode(sourceFile, expression.condition)}) ? ${whenTrue} : ${whenFalse})`;
  }

  return undefined;
}

function lowerBodyJsxElement(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): string | undefined {
  const tagName = ts.isJsxElement(node)
    ? node.openingElement.tagName.getText(sourceFile)
    : node.tagName.getText(sourceFile);

  if (!/^[a-z]/.test(tagName)) {
    return undefined;
  }

  const attributes = ts.isJsxElement(node)
    ? node.openingElement.attributes
    : node.attributes;
  const children = ts.isJsxElement(node) ? node.children : [];
  const lines = [
    "(() => {",
    `  const _node = document.createElement(${JSON.stringify(tagName)});`,
    ...lowerBodyJsxAttributes(sourceFile, attributes),
    ...lowerBodyJsxChildren(sourceFile, children),
    "  return _node;",
    "})()",
  ];

  return lines.join("\n");
}

function lowerBodyJsxAttributes(
  sourceFile: ts.SourceFile,
  attributes: ts.JsxAttributes,
): string[] {
  return attributes.properties.flatMap((property): string[] => {
    if (!ts.isJsxAttribute(property)) {
      return [];
    }

    const name = property.name.getText(sourceFile);
    const domName = name === "className" ? "class" : name;
    const initializer = property.initializer;

    if (initializer === undefined) {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, "");`];
    }

    if (ts.isStringLiteral(initializer)) {
      return [
        `  _node.setAttribute(${JSON.stringify(domName)}, ${JSON.stringify(initializer.text)});`,
      ];
    }

    if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
      return [
        `  _node.setAttribute(${JSON.stringify(domName)}, String(${printNode(sourceFile, initializer.expression)}));`,
      ];
    }

    return [];
  });
}

function lowerBodyJsxChildren(
  sourceFile: ts.SourceFile,
  children: readonly ts.JsxChild[],
): string[] {
  return children.flatMap((child): string[] => {
    if (ts.isJsxText(child)) {
      const value = child.getFullText(sourceFile).replace(/\s+/g, " ").trim();
      return value === "" ? [] : [`  _node.append(${JSON.stringify(value)});`];
    }

    if (ts.isJsxExpression(child) && child.expression !== undefined) {
      return [`  _node.append(String(${printNode(sourceFile, child.expression)}));`];
    }

    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const lowered = lowerBodyJsxElement(sourceFile, child);
      return lowered === undefined ? [] : [`  _node.append(${lowered});`];
    }

    return [];
  });
}

function collectComponentNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImportComponentNames(statement, names);
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      statement.body !== undefined &&
      hasSupportedJsxReturn(statement)
    ) {
      names.add(statement.name.text);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(sourceFile);

        if (isUppercaseTagName(name)) {
          names.add(name);
        }
      }
    }
  }

  return names;
}

function hasTopLevelJsxInitializer(statement: ts.Statement): boolean {
  if (!ts.isVariableStatement(statement)) {
    return false;
  }

  return statement.declarationList.declarations.some(
    (declaration) =>
      declaration.initializer !== undefined &&
      containsJsxSyntax(declaration.initializer),
  );
}

function collectImportComponentNames(
  statement: ts.ImportDeclaration,
  names: Set<string>,
): void {
  const importClause = statement.importClause;

  if (importClause === undefined || importClause.isTypeOnly) {
    return;
  }

  if (
    importClause.name !== undefined &&
    isUppercaseTagName(importClause.name.text)
  ) {
    names.add(importClause.name.text);
  }

  if (importClause.namedBindings === undefined) {
    return;
  }

  if (ts.isNamespaceImport(importClause.namedBindings)) {
    return;
  }

  for (const element of importClause.namedBindings.elements) {
    if (!element.isTypeOnly && isUppercaseTagName(element.name.text)) {
      names.add(element.name.text);
    }
  }
}

function hasSupportedJsxReturn(statement: ts.FunctionDeclaration): boolean {
  const body = statement.body;

  if (body === undefined) {
    return false;
  }

  const returnStatement = body.statements.find(ts.isReturnStatement);
  const expression =
    returnStatement?.expression === undefined
      ? undefined
      : unwrapParentheses(returnStatement.expression);

  return expression !== undefined && isSupportedJsxRoot(expression);
}

function collectImportBindingNames(
  statement: ts.ImportDeclaration,
  names: Set<string>,
): void {
  const importClause = statement.importClause;

  if (importClause === undefined) {
    return;
  }

  if (importClause.name !== undefined) {
    names.add(importClause.name.text);
  }

  if (importClause.namedBindings === undefined) {
    return;
  }

  if (ts.isNamespaceImport(importClause.namedBindings)) {
    names.add(importClause.namedBindings.name.text);
    return;
  }

  for (const element of importClause.namedBindings.elements) {
    names.add(element.name.text);
  }
}

function shouldPreserveModuleStatement(statement: ts.Statement): boolean {
  return !containsJsxSyntax(statement) && !isTypeOnlyDeclaration(statement);
}

function containsJsxSyntax(node: ts.Node): boolean {
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    return true;
  }

  return node.getChildren().some(containsJsxSyntax);
}

function isTypeOnlyDeclaration(statement: ts.Statement): boolean {
  return (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  );
}

function unwrapParentheses(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node)
    ? unwrapParentheses(node.expression)
    : node;
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
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): JsxNodeIr {
  if (ts.isJsxFragment(node)) {
    return {
      kind: "fragment",
      children: analyzeChildren(
        sourceFile,
        node.children,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      ),
    };
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);

    if (isMemberAccessTagName(tagName)) {
      const props = analyzeComponentProps(
        sourceFile,
        node.attributes,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      );
      const keyCode = findJsxAttributeCode(sourceFile, node.attributes, "key");
      return {
        kind: "component",
        name: tagName,
        ...(keyCode === undefined ? {} : { keyCode }),
        props: filterComponentKeyProps(props),
        children: [],
      };
    }

    if (isUppercaseTagName(tagName)) {
      if (componentNames.has(tagName)) {
        const props = analyzeComponentProps(
          sourceFile,
          node.attributes,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        );
        const keyCode = findJsxAttributeCode(sourceFile, node.attributes, "key");
        return {
          kind: "component",
          name: tagName,
          ...(keyCode === undefined ? {} : { keyCode }),
          props: filterComponentKeyProps(props),
          children: [],
        };
      }

      diagnostics.push(
        unsupportedComponentReferenceDiagnostic(
          tagName,
          getLocation(sourceFile, node.tagName),
        ),
      );
    }

    const keyCode = findJsxAttributeCode(sourceFile, node.attributes, "key");

    return {
      kind: "element",
      tagName,
      ...(keyCode === undefined ? {} : { keyCode }),
      attributes: analyzeAttributes(
        sourceFile,
        node.attributes,
        diagnostics,
        target,
      ).filter(
        (attribute) =>
          attribute.kind === "spread-attr" || attribute.name !== "key",
      ),
      children: [],
    };
  }

  const tagName = node.openingElement.tagName.getText(sourceFile);

  if (tagName === "await") {
    return analyzeAsyncBoundary(
      sourceFile,
      node,
      diagnostics,
      target,
      componentNames,
      renderValueBindings,
    );
  }

  if (isMemberAccessTagName(tagName)) {
    const props = analyzeComponentProps(
      sourceFile,
      node.openingElement.attributes,
      diagnostics,
      target,
      componentNames,
      renderValueBindings,
    );
    const keyCode = findJsxAttributeCode(
      sourceFile,
      node.openingElement.attributes,
      "key",
    );
    return {
      kind: "component",
      name: tagName,
      ...(keyCode === undefined ? {} : { keyCode }),
      props: filterComponentKeyProps(props),
      children: analyzeChildren(
        sourceFile,
        node.children,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      ),
    };
  }

  if (isUppercaseTagName(tagName)) {
    if (componentNames.has(tagName)) {
      const props = analyzeComponentProps(
        sourceFile,
        node.openingElement.attributes,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      );
      const keyCode = findJsxAttributeCode(
        sourceFile,
        node.openingElement.attributes,
        "key",
      );
      return {
        kind: "component",
        name: tagName,
        ...(keyCode === undefined ? {} : { keyCode }),
        props: filterComponentKeyProps(props),
        children: analyzeChildren(
          sourceFile,
          node.children,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
      };
    }

    diagnostics.push(
      unsupportedComponentReferenceDiagnostic(
        tagName,
        getLocation(sourceFile, node.openingElement.tagName),
      ),
    );
  }

  const keyCode = findJsxAttributeCode(
    sourceFile,
    node.openingElement.attributes,
    "key",
  );

  return {
    kind: "element",
    tagName,
    ...(keyCode === undefined ? {} : { keyCode }),
    attributes: analyzeAttributes(
      sourceFile,
      node.openingElement.attributes,
      diagnostics,
      target,
    ).filter(
      (attribute) =>
        attribute.kind === "spread-attr" || attribute.name !== "key",
    ),
    children: analyzeChildren(
      sourceFile,
      node.children,
      diagnostics,
      target,
      componentNames,
      renderValueBindings,
    ),
  };
}

function isUppercaseTagName(tagName: string): boolean {
  return /^[A-Z]/.test(tagName);
}

function isMemberAccessTagName(tagName: string): boolean {
  return /^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName);
}

function analyzeAsyncBoundary(
  sourceFile: ts.SourceFile,
  node: ts.JsxElement,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): AsyncBoundaryIr {
  const attributes = node.openingElement.attributes;
  const valueCode =
    findJsxExpressionAttribute(sourceFile, attributes, "value") ?? "undefined";
  const catchExpression = findJsxExpressionNodeAttribute(attributes, "catch");
  const placeholderExpression = findJsxExpressionNodeAttribute(
    attributes,
    "placeholder",
  );
  const renderer = findSingleArrowJsxChild(node.children, componentNames);
  const catchRenderer =
    catchExpression !== undefined && ts.isArrowFunction(catchExpression)
      ? analyzeArrowJsxRenderer(
          sourceFile,
          catchExpression,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        )
      : undefined;
  const placeholderChildren =
    placeholderExpression === undefined
      ? undefined
      : analyzeJsxExpressionAsChildren(
          sourceFile,
          placeholderExpression,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        );

  return {
    kind: "async-boundary",
    valueCode,
    valueName: renderer.valueName,
    children: renderer.children,
    ...(placeholderChildren === undefined ? {} : { placeholderChildren }),
    ...(catchRenderer === undefined
      ? {}
      : {
          catchName: catchRenderer.valueName,
          catchChildren: catchRenderer.children,
        }),
  };
}

function analyzeJsxExpressionAsChildren(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): JsxNodeIr[] {
  const unwrappedExpression = unwrapParentheses(expression);

  if (ts.isConditionalExpression(unwrappedExpression)) {
    return [
      {
        kind: "conditional",
        conditionCode: printNode(sourceFile, unwrappedExpression.condition),
        whenTrue: analyzeDynamicBranch(
          sourceFile,
          unwrappedExpression.whenTrue,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
        whenFalse: analyzeDynamicBranch(
          sourceFile,
          unwrappedExpression.whenFalse,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
      },
    ];
  }

  if (
    ts.isBinaryExpression(unwrappedExpression) &&
    isLogicalJsxBranch(unwrappedExpression.right)
  ) {
    const rightBranch = analyzeDynamicBranch(
      sourceFile,
      unwrappedExpression.right,
      diagnostics,
      target,
      componentNames,
      renderValueBindings,
    );

    if (unwrappedExpression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return [
        {
          kind: "conditional",
          conditionCode: printNode(sourceFile, unwrappedExpression.left),
          whenTrue: rightBranch,
          whenFalse: [],
        },
      ];
    }

    if (unwrappedExpression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return [
        {
          kind: "conditional",
          conditionCode: printNode(sourceFile, unwrappedExpression.left),
          whenTrue: [{ kind: "expr", code: printNode(sourceFile, unwrappedExpression.left) }],
          whenFalse: rightBranch,
        },
      ];
    }
  }

  const list = analyzeListExpression(
    sourceFile,
    unwrappedExpression,
    diagnostics,
    target,
    componentNames,
  );

  if (list !== undefined) {
    return [list];
  }

  if (
    ts.isJsxElement(unwrappedExpression) ||
    ts.isJsxSelfClosingElement(unwrappedExpression) ||
    ts.isJsxFragment(unwrappedExpression)
  ) {
    return [
      analyzeJsxRoot(
        sourceFile,
        unwrappedExpression,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      ),
    ];
  }

  return [
    {
      kind: "expr",
      code: printNode(sourceFile, expression),
      ...(isPotentialRenderValueExpression(expression, renderValueBindings)
        ? { renderMode: "dynamic" as const }
        : {}),
    },
  ];
}

function analyzeDynamicBranch(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): JsxNodeIr[] {
  const unwrappedExpression = unwrapParentheses(expression);

  if (
    unwrappedExpression.kind === ts.SyntaxKind.NullKeyword ||
    unwrappedExpression.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return [];
  }

  return analyzeJsxExpressionAsChildren(
    sourceFile,
    unwrappedExpression,
    diagnostics,
    target,
    componentNames,
    renderValueBindings,
  );
}

function analyzeListExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): JsxNodeIr | undefined {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== "map"
  ) {
    return undefined;
  }

  const renderer = expression.arguments[0];

  if (renderer === undefined || !ts.isArrowFunction(renderer)) {
    return undefined;
  }

  const itemName = renderer.parameters[0]?.name.getText(sourceFile) ?? "_item";
  const indexParameter = renderer.parameters[1];
  const indexName =
    indexParameter === undefined
      ? undefined
      : indexParameter.name.getText(sourceFile);
  const rendererBody = analyzeListRenderer(
    sourceFile,
    renderer,
    diagnostics,
    target,
    componentNames,
    renderValueBindings,
  );

  if (rendererBody === undefined) {
    return undefined;
  }

  const { children, bodyStatements } = rendererBody;
  const keyCode = findKeyCodeInChildren(children);

  return {
    kind: "list",
    itemsCode: printNode(sourceFile, expression.expression.expression),
    itemName,
    ...(indexName === undefined ? {} : { indexName }),
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(bodyStatements.length === 0 ? {} : { bodyStatements }),
    children,
  };
}

function analyzeListRenderer(
  sourceFile: ts.SourceFile,
  renderer: ts.ArrowFunction,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string>,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  if (ts.isExpression(renderer.body)) {
    return analyzeListReturnExpression(
      sourceFile,
      unwrapParentheses(renderer.body),
      [],
      diagnostics,
      target,
      componentNames,
      renderValueBindings,
    );
  }

  const ifStatementIndex = renderer.body.statements.findIndex(ts.isIfStatement);

  if (ifStatementIndex >= 0) {
    return analyzeListIfRenderer(
      sourceFile,
      renderer.body,
      ifStatementIndex,
      diagnostics,
      target,
      componentNames,
      renderValueBindings,
    );
  }

  const returnStatementIndex = renderer.body.statements.findIndex(
    ts.isReturnStatement,
  );
  const returnStatement =
    returnStatementIndex === -1
      ? undefined
      : (renderer.body.statements[returnStatementIndex] as ts.ReturnStatement);
  const returnExpression =
    returnStatement?.expression === undefined
      ? undefined
      : unwrapParentheses(returnStatement.expression);

  if (returnExpression === undefined) {
    return undefined;
  }

  return analyzeListReturnExpression(
    sourceFile,
    returnExpression,
    renderer.body.statements
      .slice(0, returnStatementIndex)
      .map((statement) => printJavaScriptNode(sourceFile, statement)),
    diagnostics,
    target,
    componentNames,
    renderValueBindings,
  );
}

function analyzeListReturnExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  bodyStatements: string[],
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string>,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  if (
    !ts.isJsxElement(expression) &&
    !ts.isJsxSelfClosingElement(expression) &&
    !ts.isJsxFragment(expression)
  ) {
    return undefined;
  }

  return {
    children: [
      analyzeJsxRoot(
        sourceFile,
        expression,
        diagnostics,
        target,
        componentNames,
        renderValueBindings,
      ),
    ],
    bodyStatements,
  };
}

function analyzeListIfRenderer(
  sourceFile: ts.SourceFile,
  body: ts.Block,
  ifStatementIndex: number,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string>,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  const ifStatement = body.statements[ifStatementIndex] as ts.IfStatement;
  const whenTrueExpression = readReturnExpressionFromStatement(
    sourceFile,
    ifStatement.thenStatement,
  );
  const whenFalseExpression =
    ifStatement.elseStatement === undefined
      ? readReturnExpressionFromStatement(
          sourceFile,
          body.statements[ifStatementIndex + 1],
        )
      : readReturnExpressionFromStatement(sourceFile, ifStatement.elseStatement);

  if (whenTrueExpression === undefined || whenFalseExpression === undefined) {
    return undefined;
  }

  return {
    bodyStatements: body.statements
      .slice(0, ifStatementIndex)
      .map((statement) => printJavaScriptNode(sourceFile, statement)),
    children: [
      {
        kind: "conditional",
        conditionCode: printNode(sourceFile, ifStatement.expression),
        whenTrue: analyzeDynamicBranch(
          sourceFile,
          whenTrueExpression,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
        whenFalse: analyzeDynamicBranch(
          sourceFile,
          whenFalseExpression,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
      },
    ],
  };
}

function readReturnExpressionFromStatement(
  sourceFile: ts.SourceFile,
  statement: ts.Statement | undefined,
): ts.Expression | undefined {
  if (statement === undefined) {
    return undefined;
  }

  if (ts.isReturnStatement(statement) && statement.expression !== undefined) {
    return unwrapParentheses(statement.expression);
  }

  if (ts.isBlock(statement)) {
    const returnStatement = statement.statements.find(ts.isReturnStatement);
    return returnStatement?.expression === undefined
      ? undefined
      : unwrapParentheses(returnStatement.expression);
  }

  return undefined;
}

function findKeyCodeInChildren(
  children: readonly JsxNodeIr[],
): string | undefined {
  if (children.length !== 1) {
    return undefined;
  }

  const child = children[0];

  if (child?.kind === "element" || child?.kind === "component") {
    return child.keyCode;
  }

  return undefined;
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

function findJsxAttributeCode(
  sourceFile: ts.SourceFile,
  attributes: ts.JsxAttributes,
  name: string,
): string | undefined {
  for (const property of attributes.properties) {
    if (
      !ts.isJsxAttribute(property) ||
      property.name.getText(sourceFile) !== name
    ) {
      continue;
    }

    const initializer = property.initializer;

    if (initializer === undefined) {
      return "true";
    }

    if (ts.isStringLiteral(initializer)) {
      return JSON.stringify(initializer.text);
    }

    if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
      return printNode(sourceFile, initializer.expression);
    }
  }

  return undefined;
}

function findSingleArrowJsxChild(
  children: ts.NodeArray<ts.JsxChild>,
  componentNames: Set<string>,
): {
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
        componentNames,
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
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): {
  valueName: string;
  children: JsxNodeIr[];
} {
  const firstParameter = arrow.parameters[0];
  const valueName = firstParameter?.name.getText(sourceFile) ?? "_value";
  const body = ts.isExpression(arrow.body)
    ? unwrapParentheses(arrow.body)
    : arrow.body;

  if (
    ts.isJsxElement(body) ||
    ts.isJsxSelfClosingElement(body) ||
    ts.isJsxFragment(body)
  ) {
    return {
      valueName,
      children: [
        analyzeJsxRoot(
          sourceFile,
          body,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
      ],
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
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): JsxNodeIr[] {
  return children.flatMap((child, index): JsxNodeIr[] => {
    if (ts.isJsxText(child)) {
      const value = normalizeJsxText(sourceFile, child, children, index);
      return value === "" ? [] : [{ kind: "text", value }];
    }

    if (ts.isJsxExpression(child)) {
      const expression =
        child.expression === undefined
          ? undefined
          : unwrapParentheses(child.expression);

      return expression === undefined
        ? []
        : analyzeJsxExpressionAsChildren(
            sourceFile,
            expression,
            diagnostics,
            target,
            componentNames,
            renderValueBindings,
          );
    }

    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      return [
        analyzeJsxRoot(
          sourceFile,
          child,
          diagnostics,
          target,
          componentNames,
          renderValueBindings,
        ),
      ];
    }

    return [];
  });
}

function analyzeComponentProps(
  sourceFile: ts.SourceFile,
  attributes: ts.JsxAttributes,
  diagnostics: Diagnostic[],
  target: CompileTarget,
  componentNames: Set<string>,
  renderValueBindings: Set<string> = new Set(),
): ComponentPropIr[] {
  return attributes.properties.flatMap((property): ComponentPropIr[] => {
    if (ts.isJsxSpreadAttribute(property)) {
      return [{ kind: "spread-prop", code: printNode(sourceFile, property.expression) }];
    }

    if (!ts.isJsxAttribute(property)) {
      return [];
    }

    const name = property.name.getText(sourceFile);
    const initializer = property.initializer;

    if (initializer === undefined) {
      return [{ kind: "prop", name, code: "true" }];
    }

    if (ts.isStringLiteral(initializer)) {
      return [{ kind: "prop", name, code: JSON.stringify(initializer.text) }];
    }

    if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
      if (isJsxPropValueExpression(initializer.expression)) {
        return [
          {
            kind: "render-prop",
            name,
            children: analyzeJsxExpressionAsChildren(
              sourceFile,
              initializer.expression,
              diagnostics,
              target,
              componentNames,
              renderValueBindings,
            ),
          },
        ];
      }

      return [
        { kind: "prop", name, code: printNode(sourceFile, initializer.expression) },
      ];
    }

    return [];
  });
}

function filterComponentKeyProps(props: readonly ComponentPropIr[]): ComponentPropIr[] {
  return props.filter((prop) => prop.kind === "spread-prop" || prop.name !== "key");
}

function isJsxPropValueExpression(expression: ts.Expression): boolean {
  const unwrappedExpression = unwrapParentheses(expression);

  if (
    ts.isJsxElement(unwrappedExpression) ||
    ts.isJsxSelfClosingElement(unwrappedExpression) ||
    ts.isJsxFragment(unwrappedExpression)
  ) {
    return true;
  }

  if (ts.isConditionalExpression(unwrappedExpression)) {
    return (
      isJsxPropValueExpression(unwrappedExpression.whenTrue) ||
      isJsxPropValueExpression(unwrappedExpression.whenFalse)
    );
  }

  return (
    ts.isBinaryExpression(unwrappedExpression) &&
    isLogicalJsxBranch(unwrappedExpression.right)
  );
}

function isLogicalJsxBranch(expression: ts.Expression): boolean {
  const unwrappedExpression = unwrapParentheses(expression);

  return (
    ts.isJsxElement(unwrappedExpression) ||
    ts.isJsxSelfClosingElement(unwrappedExpression) ||
    ts.isJsxFragment(unwrappedExpression)
  );
}

function isPotentialRenderValueExpression(
  expression: ts.Expression,
  renderValueBindings: Set<string>,
): boolean {
  return (
    (ts.isIdentifier(expression) && renderValueBindings.has(expression.text)) ||
    (ts.isPropertyAccessExpression(expression) &&
      expression.expression.getText(expression.getSourceFile()) === "props" &&
      isRenderValuePropName(expression.name.text))
  );
}

function isRenderValuePropName(name: string): boolean {
  return ["children", "fallback", "header", "sidebar", "element"].includes(name);
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
    .replace(/\s+$/, preserveTrailingSpace ? " " : "")
    .replace(htmlEntityPattern, decodeHtmlEntity);
}

const htmlEntityPattern = /&(#\d+|#x[\da-fA-F]+|[A-Za-z][A-Za-z\d]+);/g;

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "\u00a9",
  gt: ">",
  lt: "<",
  mdash: "\u2014",
  middot: "\u00b7",
  nbsp: "\u00a0",
  quot: "\"",
};

function decodeHtmlEntity(entity: string, body: string): string {
  if (body.startsWith("#x") || body.startsWith("#X")) {
    return decodeNumericHtmlEntity(entity, body.slice(2), 16);
  }

  if (body.startsWith("#")) {
    return decodeNumericHtmlEntity(entity, body.slice(1), 10);
  }

  return namedHtmlEntities[body] ?? entity;
}

function decodeNumericHtmlEntity(
  entity: string,
  value: string,
  radix: number,
): string {
  const codePoint = Number.parseInt(value, radix);

  if (
    !Number.isFinite(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff
  ) {
    return entity;
  }

  return String.fromCodePoint(codePoint);
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
      if (target === "server") {
        diagnostics.push(
          unsupportedSpreadAttributeDiagnostic(getLocation(sourceFile, property)),
        );
      }

      return [{ kind: "spread-attr", code: printNode(sourceFile, property.expression) }];
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
          diagnostics.push(
            unsupportedServerEventHandlerDiagnostic(
              name,
              getLocation(sourceFile, property.name),
            ),
          );
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
        diagnostics.push(
          unsupportedServerDynamicAttributeDiagnostic(
            name,
            getLocation(sourceFile, property.name),
          ),
        );
      }

      return [{ kind: "dynamic-attr", name, code }];
    }

    return [];
  });
}

function getLocation(sourceFile: ts.SourceFile, node: ts.Node): {
  line: number;
  column: number;
} {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}
