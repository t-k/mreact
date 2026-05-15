import type { SourceLocation } from "./types.js";

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

export function getOxcLocation(code: string, node: unknown): SourceLocation | undefined {
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

export function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
