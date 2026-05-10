import { parseSync } from "oxc-parser";
import {
  analyzeToIr,
  type AnalyzeToIrInput,
  type AnalyzeToIrOutput,
} from "./internal.js";
import type {
  AttributeIr,
  ComponentIr,
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
  return {
    userImports: [],
    moduleStatements: [],
    moduleBindingNames: [],
    components: readArray(readObject(program).body).flatMap((statement) =>
      analyzeOxcComponent(code, statement),
    ),
  };
}

function analyzeOxcComponent(code: string, statement: unknown): ComponentIr[] {
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
  const bodyStatements = body
    .filter((bodyStatement) => bodyStatement !== returnStatement)
    .map((bodyStatement) => formatStatement(code, bodyStatement));

  return [
    {
      name: id.name,
      exportName: id.name,
      parameters: readArray(declaration.params).map((param) =>
        readSource(code, param),
      ),
      bodyStatements,
      bindingNames: body.flatMap(collectBindingNames),
      root: analyzeOxcJsxNode(code, returnArgument),
    },
  ];
}

function analyzeOxcJsxNode(code: string, node: Record<string, unknown>): JsxNodeIr {
  if (node.type !== "JSXElement") {
    return { kind: "expr", code: readSource(code, node) };
  }

  const openingElement = readObject(node.openingElement);
  const tagName = readObject(openingElement.name).name;

  return {
    kind: "element",
    tagName: typeof tagName === "string" ? tagName : "",
    attributes: readArray(openingElement.attributes).flatMap((attr) =>
      analyzeOxcAttribute(code, attr),
    ),
    children: analyzeOxcChildren(code, readArray(node.children)),
  } satisfies JsxElementIr;
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

function analyzeOxcChildren(
  code: string,
  children: readonly unknown[],
): JsxNodeIr[] {
  return children.flatMap((child): JsxNodeIr[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value = typeof object.value === "string" ? object.value : "";
      return value === "" ? [] : [{ kind: "text", value }];
    }

    if (object.type === "JSXElement") {
      return [analyzeOxcJsxNode(code, object)];
    }

    if (object.type === "JSXExpressionContainer") {
      return analyzeOxcExpressionChild(code, readObject(object.expression));
    }

    return [];
  });
}

function analyzeOxcExpressionChild(
  code: string,
  expression: Record<string, unknown>,
): JsxNodeIr[] {
  if (expression.type === "ConditionalExpression") {
    return [
      {
        kind: "conditional",
        conditionCode: readSource(code, readObject(expression.test)),
        whenTrue: analyzeOxcDynamicBranch(code, readObject(expression.consequent)),
        whenFalse: analyzeOxcDynamicBranch(code, readObject(expression.alternate)),
      },
    ];
  }

  const list = analyzeOxcListExpression(code, expression);

  if (list !== undefined) {
    return [list];
  }

  if (expression.type === "JSXElement") {
    return [analyzeOxcJsxNode(code, expression)];
  }

  return [{ kind: "expr", code: readSource(code, expression) }];
}

function analyzeOxcDynamicBranch(
  code: string,
  expression: Record<string, unknown>,
): JsxNodeIr[] {
  if (
    expression.type === "Literal" &&
    (expression.value === null || expression.value === false)
  ) {
    return [];
  }

  return analyzeOxcExpressionChild(code, expression);
}

function analyzeOxcListExpression(
  code: string,
  expression: Record<string, unknown>,
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
    children: [analyzeOxcJsxNode(code, body)],
  };
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
