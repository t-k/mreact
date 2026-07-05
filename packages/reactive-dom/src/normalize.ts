import type { RenderValue } from "./types.js";

const maxRenderValueDepth = 256;
const renderValueNormalizerGlobalKey = Symbol.for("mreact.reactiveDom.renderValueNormalizer");
const renderValueNormalizerGlobal = globalThis as typeof globalThis & Record<symbol, unknown>;

export type RenderValueNormalizer = (
  value: unknown,
  depth: number,
) => Node[] | undefined;

let customRenderValueNormalizer: RenderValueNormalizer | undefined =
  typeof renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] === "function"
    ? (renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] as RenderValueNormalizer)
    : undefined;

export function registerRenderValueNormalizer(
  normalizer: RenderValueNormalizer,
): void {
  customRenderValueNormalizer = normalizer;
  renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] = normalizer;
}

export function normalizeRenderValue(value: RenderValue, depth = 0): Node[] {
  if (depth > maxRenderValueDepth) {
    throw new Error(`mreact render value is too deep: exceeded ${maxRenderValueDepth} levels`);
  }

  if (value === null || value === undefined || typeof value === "boolean") {
    return [];
  }

  if (typeof value === "string" || typeof value === "number") {
    return [document.createTextNode(String(value))];
  }

  if (typeof DocumentFragment !== "undefined" && value instanceof DocumentFragment) {
    return Array.from(value.childNodes);
  }

  if (value instanceof Node) {
    return [value];
  }

  const normalizer =
    customRenderValueNormalizer ??
    (typeof renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] === "function"
      ? (renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] as RenderValueNormalizer)
      : undefined);
  const customNodes = normalizer?.(value, depth + 1);

  if (customNodes !== undefined) {
    return customNodes;
  }

  const nodes: Node[] = [];

  if (!isIterable(value)) {
    return [document.createTextNode(String(value))];
  }

  for (const item of value as Iterable<RenderValue>) {
    nodes.push(...normalizeRenderValue(item, depth + 1));
  }

  return nodes;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  );
}
