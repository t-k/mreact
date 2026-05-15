import type { ComponentPropIr, JsxNodeIr } from "./ir.js";
import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import { stripOxcGeneratedImports } from "./oxc-code-utils.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import { containsOxcJsxSyntax } from "./oxc-render-values.js";
import { transformJsxWithOxc } from "./oxc-transform.js";

export type AnalyzeOxcJsxNodeCallback = (
  node: Record<string, unknown>,
  bodyStatementJsx?: OxcBodyStatementJsxMode,
) => JsxNodeIr;

export function analyzeOxcComponentProp(
  code: string,
  attr: unknown,
  analyzeJsxNode: AnalyzeOxcJsxNodeCallback,
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
          children: [analyzeJsxNode(expression)],
        },
      ];
    }

    return [
      {
        kind: "prop",
        name,
        code:
          expression.type === "ArrowFunctionExpression" && containsOxcJsxSyntax(expression)
            ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, expression)))
            : readSource(code, expression),
      },
    ];
  }

  return [{ kind: "prop", name, code: "true" }];
}

export function readOxcConsumerRenderProp(
  code: string,
  children: readonly unknown[],
  analyzeJsxNode: AnalyzeOxcJsxNodeCallback,
  bodyStatementJsx?: OxcBodyStatementJsxMode,
): ComponentPropIr | undefined {
  for (const child of children) {
    const object = readObject(child);

    if (object.type !== "JSXExpressionContainer") {
      continue;
    }

    const expression = unwrapOxcParentheses(readObject(object.expression));

    if (expression.type !== "ArrowFunctionExpression") {
      continue;
    }

    const renderer = analyzeOxcArrowJsxRenderer(
      code,
      expression,
      analyzeJsxNode,
      bodyStatementJsx,
    );

    return {
      kind: "render-prop",
      name: "children",
      valueName: renderer.valueName,
      children: renderer.children,
    };
  }

  return undefined;
}

export function analyzeOxcSingleArrowJsxChild(
  code: string,
  children: readonly unknown[],
  analyzeJsxNode: AnalyzeOxcJsxNodeCallback,
  bodyStatementJsx?: OxcBodyStatementJsxMode,
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
      return analyzeOxcArrowJsxRenderer(code, expression, analyzeJsxNode, bodyStatementJsx);
    }
  }

  return {
    valueName: "_value",
    children: [],
  };
}

export function analyzeOxcArrowJsxRenderer(
  code: string,
  arrow: Record<string, unknown>,
  analyzeJsxNode: AnalyzeOxcJsxNodeCallback,
  bodyStatementJsx?: OxcBodyStatementJsxMode,
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
      children: [analyzeJsxNode(body, bodyStatementJsx)],
    };
  }

  return {
    valueName,
    children: [{ kind: "expr", code: readSource(code, body) }],
  };
}
