import type { JsxNodeIr, ModuleIr } from "./ir.js";

const rawJsxCandidatePattern = /<[A-Za-z][\w.:-]*(?:\s|>|\/)/;
const rawJsxCandidateGlobalPattern = /<[A-Za-z][\w.:-]*(?:\s|>|\/)/g;

export function containsRawJsxInIr(ir: ModuleIr): boolean {
  return ir.components.some(
    (component) =>
      component.bodyStatements.some(containsRawJsx) || containsRawJsxInNode(component.root),
  );
}

function containsRawJsx(value: string): boolean {
  if (rawJsxCandidatePattern.test(value)) {
    rawJsxCandidateGlobalPattern.lastIndex = 0;

    for (
      let match = rawJsxCandidateGlobalPattern.exec(value);
      match !== null;
      match = rawJsxCandidateGlobalPattern.exec(value)
    ) {
      if (isCodePosition(value, match.index) && isLikelyRawJsxStart(value, match.index)) {
        return true;
      }
    }
  }

  return false;
}

function isCodePosition(value: string, target: number): boolean {
  let index = 0;

  while (index < target) {
    const char = value[index];
    if (char === '"' || char === "'") {
      const next = skipQuotedString(value, index, char);
      if (next > target) {
        return false;
      }
      index = next;
      continue;
    }

    if (char === "`") {
      const next = skipTemplateLiteral(value, index);
      if (next > target) {
        return false;
      }
      index = next;
      continue;
    }

    if (char === "/" && value[index + 1] === "/") {
      const next = skipLineComment(value, index + 2);
      if (next > target) {
        return false;
      }
      index = next;
      continue;
    }

    if (char === "/" && value[index + 1] === "*") {
      const next = skipBlockComment(value, index + 2);
      if (next > target) {
        return false;
      }
      index = next;
      continue;
    }

    index += 1;
  }

  return true;
}

function containsRawJsxInNode(node: JsxNodeIr): boolean {
  if (node.kind === "list") {
    return (
      node.bodyStatements?.some(containsRawJsx) === true || node.children.some(containsRawJsxInNode)
    );
  }

  if (node.kind === "conditional") {
    return node.whenTrue.some(containsRawJsxInNode) || node.whenFalse.some(containsRawJsxInNode);
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

function skipQuotedString(value: string, start: number, quote: string): number {
  let index = start + 1;

  while (index < value.length) {
    const char = value[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return value.length;
}

function skipTemplateLiteral(value: string, start: number): number {
  let index = start + 1;

  while (index < value.length) {
    const char = value[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "`") {
      return index + 1;
    }

    index += 1;
  }

  return value.length;
}

function skipLineComment(value: string, start: number): number {
  const end = value.indexOf("\n", start);
  return end === -1 ? value.length : end + 1;
}

function skipBlockComment(value: string, start: number): number {
  const end = value.indexOf("*/", start);
  return end === -1 ? value.length : end + 2;
}

function isLikelyRawJsxStart(value: string, start: number): boolean {
  const next = value[start + 1];
  if (next === ">") {
    return hasJsxExpressionPrefix(value, start);
  }

  if (next === undefined || !isAsciiLetter(next)) {
    return false;
  }

  let index = start + 2;
  while (index < value.length && isJsxNameChar(value[index] ?? "")) {
    index += 1;
  }

  const afterName = value[index];
  if (
    afterName !== undefined &&
    !isWhitespace(afterName) &&
    afterName !== ">" &&
    afterName !== "/"
  ) {
    return false;
  }

  return hasJsxExpressionPrefix(value, start);
}

function hasJsxExpressionPrefix(value: string, start: number): boolean {
  let index = start - 1;
  while (index >= 0 && isWhitespace(value[index] ?? "")) {
    index -= 1;
  }

  if (index < 0) {
    return true;
  }

  const previous = value[index] ?? "";
  if ("([{?:,=;&|!+-*~^>".includes(previous)) {
    return true;
  }

  if (isIdentifierChar(previous)) {
    const end = index + 1;
    while (index >= 0 && isIdentifierChar(value[index] ?? "")) {
      index -= 1;
    }

    const word = value.slice(index + 1, end);
    return word === "return" || word === "yield" || word === "throw";
  }

  return false;
}

function isAsciiLetter(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isJsxNameChar(value: string): boolean {
  return isIdentifierChar(value) || value === "." || value === ":" || value === "-";
}

function isIdentifierChar(value: string): boolean {
  if (value === "_" || value === "$") {
    return true;
  }

  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function isWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}
