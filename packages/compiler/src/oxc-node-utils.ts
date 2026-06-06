import type { SourceLocation } from "./types.js";

const lineStartCache = new Map<string, readonly number[]>();
const lineStartCacheLimit = 128;

export function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readSource(code: string, node: unknown): string {
  const object = readObject(node);
  return typeof object.start === "number" && typeof object.end === "number"
    ? code.slice(object.start, object.end)
    : "";
}

export function unwrapOxcParentheses(
  expression: Record<string, unknown>,
): Record<string, unknown> {
  let current = expression;

  while (current.type === "ParenthesizedExpression") {
    current = readObject(current.expression);
  }

  return current;
}

export function getOxcLocation(code: string, node: unknown): SourceLocation | undefined {
  const start = readObject(node).start;

  if (typeof start !== "number") {
    return undefined;
  }

  return getOxcLocationFromOffset(code, start);
}

export function getOxcLocationFromOffset(
  code: string,
  start: number,
): SourceLocation | undefined {
  if (!Number.isInteger(start) || start < 0 || start > code.length) {
    return undefined;
  }

  const lineStarts = getLineStarts(code);
  const lineIndex = findLineStartIndex(lineStarts, start);

  return {
    line: lineIndex + 1,
    column: start - (lineStarts[lineIndex] ?? 0) + 1,
  };
}

function getLineStarts(code: string): readonly number[] {
  const cached = lineStartCache.get(code);

  if (cached !== undefined) {
    return cached;
  }

  const starts = [0];

  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") {
      starts.push(index + 1);
    }
  }

  rememberLineStarts(code, starts);

  return starts;
}

function rememberLineStarts(code: string, starts: readonly number[]): void {
  if (lineStartCache.size >= lineStartCacheLimit) {
    const first = lineStartCache.keys().next().value;

    if (first !== undefined) {
      lineStartCache.delete(first);
    }
  }

  lineStartCache.set(code, starts);
}

function findLineStartIndex(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle] ?? 0;

    if (lineStart <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, low - 1);
}

export function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
