import { parseSync } from "oxc-parser";
import {
  analyzeToIr,
  type AnalyzeToIrInput,
  type AnalyzeToIrOutput,
} from "./internal.js";
import { parseSource, transpileTypeScriptSnippet } from "./parse.js";
import { analyzeModule } from "./analyze.js";
import type {
  AttributeIr,
  AsyncBoundaryIr,
  ComponentIr,
  ComponentPropIr,
  JsxElementIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { CompileTarget, Diagnostic, SourceLocation } from "./types.js";

export interface OxcParityResult {
  matches: boolean;
  oxc: {
    errors: string[];
    exportedComponents: string[];
    ir?: ModuleIr;
  };
  typescript: {
    diagnostics: string[];
    exportedComponents: string[];
    ir?: ModuleIr;
  };
}

export function analyzeOxcParity(input: AnalyzeToIrInput): OxcParityResult {
  const oxc = parseSync(input.filename, input.code, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });
  const typescript = analyzeToIr(input);
  const oxcExportedComponents = collectOxcExportedComponents(oxc.program);
  const typescriptExportedComponents = typescript.ir.components.map(
    (component) => component.exportName,
  );
  const oxcOutput = analyzeOxcToIr(input.code, oxc.program, input.target);
  const oxcIr = needsTypescriptBodyLoweringFallback(oxcOutput.ir)
    ? typescript.ir
    : oxcOutput.ir;

  return {
    matches:
      arraysEqual(oxcExportedComponents, typescriptExportedComponents) &&
      JSON.stringify(oxcIr) === JSON.stringify(typescript.ir),
    oxc: {
      errors: oxc.errors.map((error) => error.message),
      exportedComponents: oxcExportedComponents,
      ir: oxcIr,
    },
    typescript: {
      diagnostics: typescript.diagnostics.map((diagnostic) => diagnostic.code),
      exportedComponents: typescriptExportedComponents,
      ir: typescript.ir,
    },
  };
}

export function analyzeWithOxc(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  const parsed = parseSync(input.filename, input.code, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });

  const analyzed = analyzeOxcToIr(input.code, parsed.program, input.target);
  const typescriptFallback = analyzeToIrWithTransformOptions(input);
  const fallback =
    needsTypescriptBodyLoweringFallback(analyzed.ir) ||
    !componentSignaturesEqual(analyzed.ir, typescriptFallback.ir)
      ? typescriptFallback
      : undefined;

  return {
    ir: fallback?.ir ?? analyzed.ir,
    diagnostics: [
      ...parsed.errors.map((error) => ({
        level: "error" as const,
        code: "MR_OXC_PARSE_ERROR",
        message: error.message,
      })),
      ...(fallback?.diagnostics ?? analyzed.diagnostics),
    ],
  };
}

function analyzeToIrWithTransformOptions(
  input: AnalyzeToIrInput,
): AnalyzeToIrOutput {
  return analyzeModule(
    parseSource(input.code, input.filename),
    input.target,
    input.options ?? {
      bodyStatementJsx: input.target === "server" ? "server-string" : "dom-node",
    },
  );
}

function needsTypescriptBodyLoweringFallback(ir: ModuleIr): boolean {
  return ir.components.some(
    (component) =>
      component.bodyStatements.some(containsRawJsx) ||
      containsRawJsxInNode(component.root),
  );
}

function componentSignaturesEqual(oxcIr: ModuleIr, typescriptIr: ModuleIr): boolean {
  return arraysEqual(
    oxcIr.components.map(componentSignature),
    typescriptIr.components.map(componentSignature),
  );
}

function componentSignature(component: ComponentIr): string {
  return `${component.exportName}:${component.name}`;
}

function containsRawJsx(value: string): boolean {
  return /<[A-Za-z][\w.:-]*(?:\s|>|\/)/.test(value);
}

function containsRawJsxInNode(node: JsxNodeIr): boolean {
  if (node.kind === "list") {
    return (
      node.bodyStatements?.some(containsRawJsx) === true ||
      node.children.some(containsRawJsxInNode)
    );
  }

  if (node.kind === "conditional") {
    return (
      node.whenTrue.some(containsRawJsxInNode) ||
      node.whenFalse.some(containsRawJsxInNode)
    );
  }

  if (node.kind === "fragment") {
    return node.children.some(containsRawJsxInNode);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsRawJsxInNode) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsRawJsxInNode),
      )
    );
  }

  if (node.kind === "async-boundary") {
    return (
      node.children.some(containsRawJsxInNode) ||
      node.placeholderChildren?.some(containsRawJsxInNode) === true ||
      node.catchChildren?.some(containsRawJsxInNode) === true
    );
  }

  return node.kind === "element" && node.children.some(containsRawJsxInNode);
}

function analyzeOxcToIr(
  code: string,
  program: unknown,
  target: CompileTarget,
): { ir: ModuleIr; diagnostics: Diagnostic[] } {
  const body = readArray(readObject(program).body);
  const userImports: string[] = [];
  const moduleStatements: string[] = [];
  const moduleBindingNames = new Set<string>();
  const diagnostics: Diagnostic[] = [];

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ImportDeclaration") {
      userImports.push(formatStatement(code, statement));
      for (const bindingName of collectImportBindingNames(statement)) {
        moduleBindingNames.add(bindingName);
      }
      continue;
    }

    if (isOxcExportedJsxComponent(statement)) {
      for (const bindingName of collectBindingNames(statement)) {
        moduleBindingNames.add(bindingName);
      }
    } else {
      moduleStatements.push(formatStatement(code, statement));
      for (const bindingName of collectBindingNames(statement)) {
        moduleBindingNames.add(bindingName);
      }
    }
  }

  const componentNames = new Set([
    ...collectOxcExportedComponents(program),
    ...moduleBindingNames,
  ]);

  return {
    ir: {
      userImports,
      moduleStatements,
      moduleBindingNames: Array.from(moduleBindingNames),
      components: body.flatMap((statement) =>
        analyzeOxcComponent(code, statement, componentNames, target, diagnostics),
      ),
    },
    diagnostics,
  };
}

function isOxcExportedJsxComponent(statement: unknown): boolean {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(
      readObject(object.declaration),
    );
    return declaration !== undefined && hasOxcFunctionLikeJsxReturn(declaration);
  }

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  return (
    (declaration.type === "FunctionDeclaration" && hasJsxReturn(declaration.body)) ||
    readOxcVariableComponentDeclaration(declaration) !== undefined
  );
}

function analyzeOxcComponent(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): ComponentIr[] {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(
      readObject(object.declaration),
    );

    if (declaration === undefined || !hasOxcFunctionLikeJsxReturn(declaration)) {
      return [];
    }

    return [
      analyzeOxcFunctionLikeComponent(
        code,
        "DefaultExport",
        declaration,
        "default",
        componentNames,
        target,
        diagnostics,
        true,
      ),
    ];
  }

  if (object.type !== "ExportNamedDeclaration") {
    return [];
  }

  const declaration = readObject(object.declaration);

  if (declaration.type === "VariableDeclaration") {
    const variableComponent = readOxcVariableComponentDeclaration(declaration);

    if (variableComponent === undefined) {
      return [];
    }

    return [
      analyzeOxcFunctionLikeComponent(
        code,
        variableComponent.name,
        variableComponent.initializer,
        variableComponent.name,
        componentNames,
        target,
        diagnostics,
      ),
    ];
  }

  if (declaration.type !== "FunctionDeclaration" || !hasJsxReturn(declaration.body)) {
    return [];
  }

  const id = readObject(declaration.id);

  if (typeof id.name !== "string") {
    return [];
  }

  return [
    analyzeOxcFunctionLikeComponent(
      code,
      id.name,
      declaration,
      id.name,
      componentNames,
      target,
      diagnostics,
    ),
  ];
}

function analyzeOxcFunctionLikeComponent(
  code: string,
  name: string,
  functionLike: Record<string, unknown>,
  exportName: string,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  exportDefault = false,
): ComponentIr {
  const functionBody = readObject(functionLike.body);
  const body = functionBody.type === "BlockStatement" ? readArray(functionBody.body) : [];
  const returnStatement = body.find(
    (bodyStatement) => readObject(bodyStatement).type === "ReturnStatement",
  );
  const expressionBody = unwrapOxcParentheses(readObject(functionLike.body));
  const returnExpression =
    returnStatement === undefined
      ? expressionBody
      : unwrapOxcParentheses(readObject(readObject(returnStatement).argument));
  const parameters = readArray(functionLike.params).map((param) =>
    readOxcParameterName(code, param),
  );
  const bodyStatements = body
    .filter((bodyStatement) => bodyStatement !== returnStatement)
    .map((bodyStatement) => formatStatement(code, bodyStatement));

  return {
    name,
    exportName,
    ...(exportDefault ? { exportDefault: true } : {}),
    parameters,
    bodyStatements,
    bindingNames: [...parameters, ...body.flatMap(collectBindingNames)],
    root: analyzeOxcJsxNode(
      code,
      returnExpression,
      componentNames,
      target,
      diagnostics,
    ),
  };
}

function analyzeOxcJsxNode(
  code: string,
  node: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): JsxNodeIr {
  if (node.type === "JSXFragment") {
    return {
      kind: "fragment",
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        componentNames,
        target,
        diagnostics,
      ),
    };
  }

  if (node.type !== "JSXElement") {
    return { kind: "expr", code: readSource(code, node) };
  }

  const openingElement = readObject(node.openingElement);
  const tagName = readOxcJsxTagName(readObject(openingElement.name));
  const attributes = readArray(openingElement.attributes);

  if (tagName === "await") {
    return analyzeOxcAsyncBoundary(
      code,
      node,
      attributes,
      componentNames,
      target,
      diagnostics,
    );
  }

  if (
    /^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) ||
    componentNames.has(tagName)
  ) {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");

    return {
      kind: "component",
      name: tagName,
      ...(keyCode === undefined ? {} : { keyCode }),
      props: attributes.flatMap((attr) =>
        analyzeOxcComponentProp(code, attr, componentNames, target, diagnostics),
      ).filter((prop) => prop.kind === "spread-prop" || prop.name !== "key"),
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        componentNames,
        target,
        diagnostics,
      ),
    };
  }

  const keyCode = findOxcJsxAttributeCode(code, attributes, "key");

  return {
    kind: "element",
    tagName,
    ...(keyCode === undefined ? {} : { keyCode }),
    attributes: attributes.flatMap((attr) =>
      analyzeOxcAttribute(code, attr, target, diagnostics),
    ).filter(
      (attribute) =>
        attribute.kind === "spread-attr" || attribute.name !== "key",
    ),
    children: analyzeOxcChildren(
      code,
      readArray(node.children),
      componentNames,
      target,
      diagnostics,
    ),
  } satisfies JsxElementIr;
}

function analyzeOxcAsyncBoundary(
  code: string,
  node: Record<string, unknown>,
  attributes: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): AsyncBoundaryIr {
  const valueCode = readOxcExpressionAttribute(code, attributes, "value") ?? "undefined";
  const placeholderExpression = readOxcExpressionAttributeNode(
    attributes,
    "placeholder",
  );
  const catchExpression = readOxcExpressionAttributeNode(attributes, "catch");
  const renderer = analyzeOxcSingleArrowJsxChild(
    code,
    readArray(node.children),
    componentNames,
    target,
    diagnostics,
  );
  const catchRenderer =
    catchExpression !== undefined &&
    readObject(catchExpression).type === "ArrowFunctionExpression"
      ? analyzeOxcArrowJsxRenderer(
          code,
          readObject(catchExpression),
          componentNames,
          target,
          diagnostics,
        )
      : undefined;
  const placeholderChildren =
    placeholderExpression === undefined
      ? undefined
      : analyzeOxcExpressionChild(
          code,
          readObject(placeholderExpression),
          componentNames,
          target,
          diagnostics,
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

function readOxcExpressionAttribute(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  const expression = readOxcExpressionAttributeNode(attributes, name);
  return expression === undefined ? undefined : readSource(code, expression);
}

function readOxcExpressionAttributeNode(
  attributes: readonly unknown[],
  name: string,
): Record<string, unknown> | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (
      object.type !== "JSXAttribute" ||
      String(readObject(object.name).name) !== name
    ) {
      continue;
    }

    const value = readObject(object.value);

    if (value.type === "JSXExpressionContainer") {
      return unwrapOxcParentheses(readObject(value.expression));
    }
  }

  return undefined;
}

function analyzeOxcSingleArrowJsxChild(
  code: string,
  children: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): {
  valueName: string;
  children: JsxNodeIr[];
} {
  for (const child of children) {
    const object = readObject(child);

    if (object.type !== "JSXExpressionContainer") {
      continue;
    }

    const expression = unwrapOxcParentheses(readObject(object.expression));

    if (expression.type === "ArrowFunctionExpression") {
      return analyzeOxcArrowJsxRenderer(
        code,
        expression,
        componentNames,
        target,
        diagnostics,
      );
    }
  }

  return {
    valueName: "_value",
    children: [],
  };
}

function analyzeOxcArrowJsxRenderer(
  code: string,
  arrow: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): {
  valueName: string;
  children: JsxNodeIr[];
} {
  const firstParameter = readObject(readArray(arrow.params)[0]);
  const valueName = typeof firstParameter.name === "string" ? firstParameter.name : "_value";
  const body = unwrapOxcParentheses(readObject(arrow.body));

  if (body.type === "JSXElement" || body.type === "JSXFragment") {
    return {
      valueName,
      children: [analyzeOxcJsxNode(code, body, componentNames, target, diagnostics)],
    };
  }

  return {
    valueName,
    children: [{ kind: "expr", code: readSource(code, body) }],
  };
}

function unwrapOxcParentheses(
  expression: Record<string, unknown>,
): Record<string, unknown> {
  let current = expression;

  while (current.type === "ParenthesizedExpression") {
    current = readObject(current.expression);
  }

  return current;
}

function readOxcJsxTagName(node: Record<string, unknown>): string {
  if (typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXMemberExpression") {
    const objectName = readOxcJsxTagName(readObject(node.object));
    const propertyName = readOxcJsxTagName(readObject(node.property));
    return `${objectName}.${propertyName}`;
  }

  return "";
}

function analyzeOxcAttribute(
  code: string,
  attr: unknown,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): AttributeIr[] {
  const object = readObject(attr);

  if (object.type === "JSXSpreadAttribute") {
    if (target === "server") {
      const loc = getOxcLocation(code, object);
      diagnostics.push({
        level: "error",
        code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
        message: "Server target does not support JSX spread attributes.",
        ...(loc === undefined ? {} : { loc }),
      });
    }

    return [{ kind: "spread-attr", code: readSource(code, readObject(object.argument)) }];
  }

  if (object.type !== "JSXAttribute") {
    return [];
  }

  const name = String(readObject(object.name).name);
  const value = readObject(object.value);

  if (value.type === "Literal") {
    return [{ kind: "static-attr", name, value: String(value.value) }];
  }

  if (value.type === "JSXExpressionContainer") {
    const expressionCode = readSource(code, readObject(value.expression));

    if (/^on[A-Z]/.test(name)) {
      if (target === "server") {
        const loc = getOxcLocation(code, object.name);
        diagnostics.push({
          level: "error",
          code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
          message: `Server target does not support event handler '${name}'.`,
          ...(loc === undefined ? {} : { loc }),
        });
      }

      return [
        {
          kind: "event",
          name,
          eventName: name.slice(2).toLowerCase(),
          code: expressionCode,
        },
      ];
    }

    if (target === "server") {
      const loc = getOxcLocation(code, object.name);
      diagnostics.push({
        level: "error",
        code: "MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE",
        message: `Server target does not support dynamic attribute '${name}'.`,
        ...(loc === undefined ? {} : { loc }),
      });
    }

    return [{ kind: "dynamic-attr", name, code: expressionCode }];
  }

  return [{ kind: "static-attr", name, value: "" }];
}

function findOxcJsxAttributeCode(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (
      object.type !== "JSXAttribute" ||
      String(readObject(object.name).name) !== name
    ) {
      continue;
    }

    const value = readObject(object.value);

    if (Object.keys(value).length === 0) {
      return "true";
    }

    if (value.type === "Literal") {
      return JSON.stringify(value.value);
    }

    if (value.type === "JSXExpressionContainer") {
      return readSource(code, unwrapOxcParentheses(readObject(value.expression)));
    }
  }

  return undefined;
}

function analyzeOxcComponentProp(
  code: string,
  attr: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): ComponentPropIr[] {
  const object = readObject(attr);

  if (object.type === "JSXSpreadAttribute") {
    return [{ kind: "spread-prop", code: readSource(code, readObject(object.argument)) }];
  }

  if (object.type !== "JSXAttribute") {
    return [];
  }

  const name = String(readObject(object.name).name);
  const value = readObject(object.value);

  if (value.type === "Literal") {
    return [{ kind: "prop", name, code: JSON.stringify(value.value) }];
  }

  if (value.type === "JSXExpressionContainer") {
      const expression = unwrapOxcParentheses(readObject(value.expression));

    if (expression.type === "JSXElement" || expression.type === "JSXFragment") {
      return [
        {
          kind: "render-prop",
          name,
          children: [
            analyzeOxcJsxNode(
              code,
              expression,
              componentNames,
              target,
              diagnostics,
            ),
          ],
        },
      ];
    }

    return [
      {
        kind: "prop",
        name,
        code: readSource(code, expression),
      },
    ];
  }

  return [{ kind: "prop", name, code: "true" }];
}

function analyzeOxcChildren(
  code: string,
  children: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): JsxNodeIr[] {
  return children.flatMap((child, index): JsxNodeIr[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value = typeof object.value === "string" ? object.value : "";
      const normalizedValue = normalizeOxcJsxText(value, children, index);
      return normalizedValue === "" ? [] : [{ kind: "text", value: normalizedValue }];
    }

    if (object.type === "JSXElement" || object.type === "JSXFragment") {
      return [
        analyzeOxcJsxNode(code, object, componentNames, target, diagnostics),
      ];
    }

    if (object.type === "JSXExpressionContainer") {
      return analyzeOxcExpressionChild(
        code,
        readObject(object.expression),
        componentNames,
        target,
        diagnostics,
      );
    }

    return [];
  });
}

function analyzeOxcExpressionChild(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): JsxNodeIr[] {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type === "ConditionalExpression") {
    return [
      {
        kind: "conditional",
        conditionCode: readSource(code, readObject(unwrappedExpression.test)),
        whenTrue: analyzeOxcDynamicBranch(
          code,
          readObject(unwrappedExpression.consequent),
          componentNames,
          target,
          diagnostics,
        ),
        whenFalse: analyzeOxcDynamicBranch(
          code,
          readObject(unwrappedExpression.alternate),
          componentNames,
          target,
          diagnostics,
        ),
      },
    ];
  }

  if (
    unwrappedExpression.type === "LogicalExpression" &&
    isOxcJsxBranch(readObject(unwrappedExpression.right))
  ) {
    const rightBranch = analyzeOxcDynamicBranch(
      code,
      readObject(unwrappedExpression.right),
      componentNames,
      target,
      diagnostics,
    );

    if (unwrappedExpression.operator === "&&") {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(unwrappedExpression.left)),
          whenTrue: rightBranch,
          whenFalse: [],
        },
      ];
    }

    if (unwrappedExpression.operator === "||") {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(unwrappedExpression.left)),
          whenTrue: [
            { kind: "expr", code: readSource(code, readObject(unwrappedExpression.left)) },
          ],
          whenFalse: rightBranch,
        },
      ];
    }
  }

  const list = analyzeOxcListExpression(
    code,
    unwrappedExpression,
    componentNames,
    target,
    diagnostics,
  );

  if (list !== undefined) {
    return [list];
  }

  if (unwrappedExpression.type === "JSXElement" || unwrappedExpression.type === "JSXFragment") {
    return [
      analyzeOxcJsxNode(code, unwrappedExpression, componentNames, target, diagnostics),
    ];
  }

  return [
    {
      kind: "expr",
      code: readSource(code, expression),
      ...(isOxcRenderValueExpression(expression)
        ? { renderMode: "dynamic" as const }
        : {}),
    },
  ];
}

function analyzeOxcDynamicBranch(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): JsxNodeIr[] {
  if (
    expression.type === "Literal" &&
    (expression.value === null || expression.value === false)
  ) {
    return [];
  }

  return analyzeOxcExpressionChild(
    code,
    expression,
    componentNames,
    target,
    diagnostics,
  );
}

function analyzeOxcListExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): JsxNodeIr | undefined {
  if (expression.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(expression.callee);

  if (
    callee.type !== "MemberExpression" ||
    readObject(callee.property).name !== "map"
  ) {
    return undefined;
  }

  const renderer = readObject(readArray(expression.arguments)[0]);

  if (renderer.type !== "ArrowFunctionExpression") {
    return undefined;
  }

  const itemName = String(readObject(readArray(renderer.params)[0]).name ?? "_item");
  const indexName = readObject(readArray(renderer.params)[1]).name;
  const rendererBody = analyzeOxcListRenderer(
    code,
    renderer,
    componentNames,
    target,
    diagnostics,
  );

  if (rendererBody === undefined) {
    return undefined;
  }

  const { children, bodyStatements } = rendererBody;
  const keyCode = findOxcKeyCodeInChildren(children);

  return {
    kind: "list",
    itemsCode: readSource(code, readObject(callee.object)),
    itemName,
    ...(typeof indexName === "string" ? { indexName } : {}),
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(bodyStatements.length === 0 ? {} : { bodyStatements }),
    children,
  };
}

function analyzeOxcListRenderer(
  code: string,
  renderer: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  const body = readObject(renderer.body);

  if (body.type !== "BlockStatement") {
    return analyzeOxcListReturnExpression(
      code,
      unwrapOxcParentheses(body),
      [],
      componentNames,
      target,
      diagnostics,
    );
  }

  const statements = readArray(body.body);
  const ifStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "IfStatement",
  );

  if (ifStatementIndex >= 0) {
    return analyzeOxcListIfRenderer(
      code,
      statements,
      ifStatementIndex,
      componentNames,
      target,
      diagnostics,
    );
  }

  const returnStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "ReturnStatement",
  );
  const returnStatement =
    returnStatementIndex === -1
      ? undefined
      : readObject(statements[returnStatementIndex]);
  const returnArgument =
    returnStatement === undefined
      ? undefined
      : unwrapOxcParentheses(readObject(returnStatement.argument));

  if (returnArgument === undefined) {
    return undefined;
  }

  return analyzeOxcListReturnExpression(
    code,
    returnArgument,
    statements
      .slice(0, returnStatementIndex)
      .map((statement) => formatStatement(code, statement)),
    componentNames,
    target,
    diagnostics,
  );
}

function analyzeOxcListReturnExpression(
  code: string,
  body: Record<string, unknown>,
  bodyStatements: string[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  if (body.type !== "JSXElement" && body.type !== "JSXFragment") {
    return undefined;
  }

  return {
    children: [analyzeOxcJsxNode(code, body, componentNames, target, diagnostics)],
    bodyStatements,
  };
}

function analyzeOxcListIfRenderer(
  code: string,
  statements: readonly unknown[],
  ifStatementIndex: number,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  const ifStatement = readObject(statements[ifStatementIndex]);
  const whenTrueExpression = readOxcReturnExpressionFromStatement(
    ifStatement.consequent,
  );
  const alternate = readOxcReturnExpressionFromStatement(ifStatement.alternate);
  const fallthrough = readOxcReturnExpressionFromStatement(
    statements[ifStatementIndex + 1],
  );
  const whenFalseExpression = alternate ?? fallthrough;

  if (whenTrueExpression === undefined || whenFalseExpression === undefined) {
    return undefined;
  }

  return {
    bodyStatements: statements
      .slice(0, ifStatementIndex)
      .map((statement) => formatStatement(code, statement)),
    children: [
      {
        kind: "conditional",
        conditionCode: readSource(code, readObject(ifStatement.test)),
        whenTrue: analyzeOxcDynamicBranch(
          code,
          whenTrueExpression,
          componentNames,
          target,
          diagnostics,
        ),
        whenFalse: analyzeOxcDynamicBranch(
          code,
          whenFalseExpression,
          componentNames,
          target,
          diagnostics,
        ),
      },
    ],
  };
}

function readOxcReturnExpressionFromStatement(
  statement: unknown,
): Record<string, unknown> | undefined {
  const object = readObject(statement);

  if (object.type === "ReturnStatement") {
    return unwrapOxcParentheses(readObject(object.argument));
  }

  if (object.type === "BlockStatement") {
    const returnStatement = readArray(object.body)
      .map(readObject)
      .find((child) => child.type === "ReturnStatement");
    return returnStatement === undefined
      ? undefined
      : unwrapOxcParentheses(readObject(returnStatement.argument));
  }

  return undefined;
}

function isOxcJsxBranch(expression: Record<string, unknown>): boolean {
  const unwrappedExpression = unwrapOxcParentheses(expression);
  return unwrappedExpression.type === "JSXElement" || unwrappedExpression.type === "JSXFragment";
}

function findOxcKeyCodeInChildren(children: readonly JsxNodeIr[]): string | undefined {
  if (children.length !== 1) {
    return undefined;
  }

  const child = children[0];

  if (child?.kind === "element" || child?.kind === "component") {
    return child.keyCode;
  }

  return undefined;
}

function isOxcRenderValueExpression(expression: Record<string, unknown>): boolean {
  if (expression.type !== "MemberExpression") {
    return false;
  }

  const object = readObject(expression.object);
  const property = readObject(expression.property);

  return (
    object.type === "Identifier" &&
    object.name === "props" &&
    typeof property.name === "string" &&
    ["children", "fallback", "header", "sidebar", "element"].includes(property.name)
  );
}

function collectOxcExportedComponents(program: unknown): string[] {
  const body = readArray(readObject(program).body);
  const components: string[] = [];

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ExportDefaultDeclaration") {
      const declaration = unwrapOxcComponentFunctionLikeInitializer(
        readObject(object.declaration),
      );

      if (declaration !== undefined && hasOxcFunctionLikeJsxReturn(declaration)) {
        components.push("default");
      }
      continue;
    }

    if (object.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readObject(object.declaration);

    if (declaration.type === "FunctionDeclaration" && hasJsxReturn(declaration.body)) {
      const id = readObject(declaration.id);

      if (typeof id.name === "string") {
        components.push(id.name);
      }
      continue;
    }

    const variableComponent = readOxcVariableComponentDeclaration(declaration);

    if (variableComponent !== undefined) {
      components.push(variableComponent.name);
    }
  }

  return components;
}

function readOxcVariableComponentDeclaration(
  declaration: Record<string, unknown>,
): { name: string; initializer: Record<string, unknown> } | undefined {
  if (declaration.type !== "VariableDeclaration") {
    return undefined;
  }

  for (const declarator of readArray(declaration.declarations)) {
    const object = readObject(declarator);
    const id = readObject(object.id);

    if (typeof id.name !== "string" || !/^[A-Z]/.test(id.name)) {
      continue;
    }

    const initializer = unwrapOxcComponentFunctionLikeInitializer(readObject(object.init));

    if (initializer !== undefined && hasOxcFunctionLikeJsxReturn(initializer)) {
      return { name: id.name, initializer };
    }
  }

  return undefined;
}

function unwrapOxcComponentFunctionLikeInitializer(
  expression: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const unwrapped = unwrapOxcParentheses(expression);

  if (
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "FunctionExpression"
  ) {
    return unwrapped;
  }

  if (unwrapped.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(unwrapped.callee);

  if (callee.type !== "Identifier" || (callee.name !== "memo" && callee.name !== "forwardRef")) {
    return undefined;
  }

  const firstArg = readObject(readArray(unwrapped.arguments)[0]);

  return unwrapOxcComponentFunctionLikeInitializer(firstArg);
}

function hasOxcFunctionLikeJsxReturn(functionLike: Record<string, unknown>): boolean {
  const body = readObject(functionLike.body);

  if (isJsxRoot(body.type)) {
    return true;
  }

  return hasJsxReturn(body);
}

function hasJsxReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type !== "ReturnStatement") {
      return false;
    }

    return isJsxRoot(unwrapOxcParentheses(readObject(object.argument)).type);
  });
}

function isJsxRoot(type: unknown): boolean {
  return (
    type === "JSXElement" ||
    type === "JSXFragment" ||
    type === "JSXSelfClosingElement"
  );
}

function formatStatement(code: string, statement: unknown): string {
  const source = readSource(code, statement);
  return transpileTypeScriptSnippet(source).replace("() => {}", "() => { }");
}

function collectBindingNames(statement: unknown): string[] {
  const object = readObject(statement);

  if (object.type === "ExportNamedDeclaration") {
    return collectBindingNames(object.declaration);
  }

  if (object.type !== "VariableDeclaration") {
    return [];
  }

  return readArray(object.declarations).flatMap((declaration) => {
    const id = readObject(readObject(declaration).id);
    return typeof id.name === "string" ? [id.name] : [];
  });
}

function collectImportBindingNames(statement: unknown): string[] {
  return readArray(readObject(statement).specifiers).flatMap((specifier) => {
    const local = readObject(readObject(specifier).local);
    return typeof local.name === "string" ? [local.name] : [];
  });
}

function readOxcParameterName(code: string, parameter: unknown): string {
  const object = readObject(parameter);

  if (typeof object.name === "string") {
    return object.name;
  }

  if (object.type === "AssignmentPattern") {
    return readOxcParameterName(code, object.left);
  }

  if (object.type === "RestElement") {
    return `...${readOxcParameterName(code, object.argument)}`;
  }

  return readSource(code, parameter);
}

function readSource(code: string, node: unknown): string {
  const object = readObject(node);
  return typeof object.start === "number" && typeof object.end === "number"
    ? code.slice(object.start, object.end)
    : "";
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getOxcLocation(
  code: string,
  node: unknown,
): SourceLocation | undefined {
  const start = readObject(node).start;

  if (typeof start !== "number") {
    return undefined;
  }

  let line = 1;
  let column = 1;

  for (let index = 0; index < start; index += 1) {
    if (code[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function normalizeOxcJsxText(
  rawValue: string,
  siblings: readonly unknown[],
  index: number,
): string {
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

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
