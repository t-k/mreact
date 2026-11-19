import type { RenderValue } from "./types.js";

const maxRenderValueDepth = 256;
const renderValueNormalizerGlobalKey = Symbol.for("mreact.reactiveDom.renderValueNormalizer");
const renderValueNormalizerGlobal = globalThis as typeof globalThis & Record<symbol, unknown>;

export type RenderValueNormalizer = (value: unknown, depth: number) => Node[] | undefined;

let customRenderValueNormalizer: RenderValueNormalizer | undefined =
  typeof renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] === "function"
    ? (renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] as RenderValueNormalizer)
    : undefined;

export function registerRenderValueNormalizer(normalizer: RenderValueNormalizer): void {
  const previous = customRenderValueNormalizer;
  const combined =
    previous === undefined
      ? normalizer
      : (value: unknown, depth: number) => normalizer(value, depth) ?? previous(value, depth);
  customRenderValueNormalizer = combined;
  renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] = combined;
}

export function normalizeRenderValue(value: RenderValue, depth = 0): Node[] {
  if (depth <= maxRenderValueDepth && typeof Element !== "undefined" && value instanceof Element) {
    return [value];
  }

  return collectRenderNodes(value, depth);
}

function collectRenderNodes(value: RenderValue, depth: number, output?: Node[]): Node[] {
  if (depth > maxRenderValueDepth) {
    throw new Error(`mreact render value is too deep: exceeded ${maxRenderValueDepth} levels`);
  }

  if (value === null || value === undefined || typeof value === "boolean") {
    return output ?? [];
  }

  if (typeof value === "string" || typeof value === "number") {
    return appendNode(document.createTextNode(String(value)), output);
  }

  if (typeof DocumentFragment !== "undefined" && value instanceof DocumentFragment) {
    return appendNodes(Array.from(value.childNodes), output);
  }

  if (value instanceof Node) {
    return appendNode(value, output);
  }

  const normalizer =
    customRenderValueNormalizer ??
    (typeof renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] === "function"
      ? (renderValueNormalizerGlobal[renderValueNormalizerGlobalKey] as RenderValueNormalizer)
      : undefined);
  const customNodes = normalizer?.(value, depth + 1);

  if (customNodes !== undefined) {
    return appendNodes(customNodes, output);
  }

  if (!isIterable(value)) {
    return appendNode(document.createTextNode(String(value)), output);
  }

  const nodes = output ?? [];
  for (const item of value) {
    collectRenderNodes(item, depth + 1, nodes);
  }
  return nodes;
}

function appendNode(node: Node, output: Node[] | undefined): Node[] {
  if (output === undefined) {
    return [node];
  }

  output.push(node);
  return output;
}

function appendNodes(nodes: Node[], output: Node[] | undefined): Node[] {
  if (output === undefined) {
    return nodes;
  }

  for (const node of nodes) {
    output.push(node);
  }

  return output;
}

function isIterable(value: unknown): value is Iterable<RenderValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  );
}
