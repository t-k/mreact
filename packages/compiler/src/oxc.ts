import { parseSync } from "oxc-parser";
import {
  analyzeToIr,
  type AnalyzeToIrInput,
  type AnalyzeToIrOutput,
} from "./internal.js";
import type {
  AttributeIr,
  ComponentIr,
  ComponentPropIr,
  JsxElementIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";

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
  const oxcIr = analyzeOxcToIr(input.code, oxc.program);

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

  return {
    ir: analyzeOxcToIr(input.code, parsed.program),
    diagnostics: parsed.errors.map((error) => ({
      level: "error",
      code: "MR_OXC_PARSE_ERROR",
      message: error.message,
    })),
  };
}

function analyzeOxcToIr(code: string, program: unknown): ModuleIr {
  const body = readArray(readObject(program).body);
  const userImports: string[] = [];
  const moduleStatements: string[] = [];
  const moduleBindingNames = new Set<string>();

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ImportDeclaration") {
      userImports.push(formatStatement(code, statement));
      for (const bindingName of collectImportBindingNames(statement)) {
        moduleBindingNames.add(bindingName);
      }
      continue;
    }

    if (!isOxcExportedJsxComponent(statement)) {
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
    userImports,
    moduleStatements,
    moduleBindingNames: Array.from(moduleBindingNames),
    components: body.flatMap((statement) =>
      analyzeOxcComponent(code, statement, componentNames),
    ),
  };
}

function isOxcExportedJsxComponent(statement: unknown): boolean {
  const object = readObject(statement);

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  return declaration.type === "FunctionDeclaration" && hasJsxReturn(declaration.body);
}

function analyzeOxcComponent(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
): ComponentIr[] {
  const object = readObject(statement);

  if (object.type !== "ExportNamedDeclaration") {
    return [];
  }

  const declaration = readObject(object.declaration);

  if (declaration.type !== "FunctionDeclaration" || !hasJsxReturn(declaration.body)) {
    return [];
  }

  const id = readObject(declaration.id);

  if (typeof id.name !== "string") {
    return [];
  }

  const body = readArray(readObject(declaration.body).body);
  const returnStatement = body.find(
    (bodyStatement) => readObject(bodyStatement).type === "ReturnStatement",
  );
  const returnArgument = readObject(readObject(returnStatement).argument);
  const parameters = readArray(declaration.params).map((param) =>
    readSource(code, param),
  );
  const bodyStatements = body
    .filter((bodyStatement) => bodyStatement !== returnStatement)
    .map((bodyStatement) => formatStatement(code, bodyStatement));

  return [
    {
      name: id.name,
      exportName: id.name,
      parameters,
      bodyStatements,
      bindingNames: [...parameters, ...body.flatMap(collectBindingNames)],
      root: analyzeOxcJsxNode(code, returnArgument, componentNames),
    },
  ];
}

function analyzeOxcJsxNode(
  code: string,
  node: Record<string, unknown>,
  componentNames: Set<string>,
): JsxNodeIr {
  if (node.type !== "JSXElement") {
    return { kind: "expr", code: readSource(code, node) };
  }

  const openingElement = readObject(node.openingElement);
  const tagName = readOxcJsxTagName(readObject(openingElement.name));
  const attributes = readArray(openingElement.attributes);

  if (
    /^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) ||
    componentNames.has(tagName)
  ) {
    return {
      kind: "component",
      name: tagName,
      props: attributes.flatMap((attr) =>
        analyzeOxcComponentProp(code, attr, componentNames),
      ),
      children: analyzeOxcChildren(code, readArray(node.children), componentNames),
    };
  }

  return {
    kind: "element",
    tagName,
    attributes: attributes.flatMap((attr) => analyzeOxcAttribute(code, attr)),
    children: analyzeOxcChildren(code, readArray(node.children), componentNames),
  } satisfies JsxElementIr;
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

function analyzeOxcAttribute(code: string, attr: unknown): AttributeIr[] {
  const object = readObject(attr);

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
      return [
        {
          kind: "event",
          name,
          eventName: name.slice(2).toLowerCase(),
          code: expressionCode,
        },
      ];
    }

    return [{ kind: "dynamic-attr", name, code: expressionCode }];
  }

  return [{ kind: "static-attr", name, value: "" }];
}

function analyzeOxcComponentProp(
  code: string,
  attr: unknown,
  componentNames: Set<string>,
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
    const expression = readObject(value.expression);

    if (expression.type === "JSXElement") {
      return [
        {
          kind: "render-prop",
          name,
          children: [analyzeOxcJsxNode(code, expression, componentNames)],
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
): JsxNodeIr[] {
  return children.flatMap((child): JsxNodeIr[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value = typeof object.value === "string" ? object.value : "";
      return value === "" ? [] : [{ kind: "text", value }];
    }

    if (object.type === "JSXElement") {
      return [analyzeOxcJsxNode(code, object, componentNames)];
    }

    if (object.type === "JSXExpressionContainer") {
      return analyzeOxcExpressionChild(
        code,
        readObject(object.expression),
        componentNames,
      );
    }

    return [];
  });
}

function analyzeOxcExpressionChild(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
): JsxNodeIr[] {
  if (expression.type === "ConditionalExpression") {
    return [
      {
        kind: "conditional",
        conditionCode: readSource(code, readObject(expression.test)),
        whenTrue: analyzeOxcDynamicBranch(
          code,
          readObject(expression.consequent),
          componentNames,
        ),
        whenFalse: analyzeOxcDynamicBranch(
          code,
          readObject(expression.alternate),
          componentNames,
        ),
      },
    ];
  }

  if (expression.type === "LogicalExpression" && readObject(expression.right).type === "JSXElement") {
    const rightBranch = analyzeOxcDynamicBranch(
      code,
      readObject(expression.right),
      componentNames,
    );

    if (expression.operator === "&&") {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(expression.left)),
          whenTrue: rightBranch,
          whenFalse: [],
        },
      ];
    }

    if (expression.operator === "||") {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(expression.left)),
          whenTrue: [
            { kind: "expr", code: readSource(code, readObject(expression.left)) },
          ],
          whenFalse: rightBranch,
        },
      ];
    }
  }

  const list = analyzeOxcListExpression(code, expression, componentNames);

  if (list !== undefined) {
    return [list];
  }

  if (expression.type === "JSXElement") {
    return [analyzeOxcJsxNode(code, expression, componentNames)];
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
): JsxNodeIr[] {
  if (
    expression.type === "Literal" &&
    (expression.value === null || expression.value === false)
  ) {
    return [];
  }

  return analyzeOxcExpressionChild(code, expression, componentNames);
}

function analyzeOxcListExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
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
  const body = readObject(renderer.body);

  if (body.type !== "JSXElement") {
    return undefined;
  }

  return {
    kind: "list",
    itemsCode: readSource(code, readObject(callee.object)),
    itemName,
    children: [analyzeOxcJsxNode(code, body, componentNames)],
  };
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

    if (object.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readObject(object.declaration);

    if (declaration.type !== "FunctionDeclaration") {
      continue;
    }

    if (!hasJsxReturn(declaration.body)) {
      continue;
    }

    const id = readObject(declaration.id);

    if (typeof id.name === "string") {
      components.push(id.name);
    }
  }

  return components;
}

function hasJsxReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type !== "ReturnStatement") {
      return false;
    }

    return isJsxRoot(readObject(object.argument).type);
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
  return source.replace("() => {}", "() => { }");
}

function collectBindingNames(statement: unknown): string[] {
  const object = readObject(statement);

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

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
