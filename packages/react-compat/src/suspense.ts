import {
  Suspense,
  isReactCompatElement,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import type { RootRuntime } from "./hooks.js";
import type { RenderOptions } from "./hydration.js";
import type {
  ReconcileNode,
  ReconcileResult,
  ReconcileSequence,
} from "./reconcile-types.js";
import { syncScopedChildNodes } from "./dom-children.js";
import { isThenable } from "./thenable.js";

interface ReactSuspenseBoundary {
  start: Comment;
  end: Comment;
  previousNodes: Node[];
  consumed: number;
}

export function reconcileSuspense(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions,
  reconcileNode: ReconcileNode,
): ReconcileResult {
  const boundary = findReactSuspenseBoundary(previousNodes);
  const boundaryPreviousNodes = boundary?.previousNodes ?? previousNodes;

  try {
    return consumeReactSuspenseBoundary(
      boundary,
      parent,
      reconcileNode(
        parent,
        boundaryPreviousNodes,
        element.props.children,
        runtime,
        `${path}.s`,
        options,
      ),
    );
  } catch (error) {
    if (!isThenable(error)) {
      throw error;
    }

    error.then(
      () => runtime.rerender(),
      () => runtime.rerender(),
    );
    return consumeReactSuspenseBoundary(
      boundary,
      parent,
      reconcileNode(
        parent,
        boundaryPreviousNodes,
        element.props.fallback as ReactCompatNode,
        runtime,
        `${path}.fallback`,
        options,
      ),
    );
  }
}

export function reconcileSuspenseList(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions,
  reconcileNode: ReconcileNode,
  reconcileSequence: ReconcileSequence,
): ReconcileResult {
  if (
    element.props.revealOrder !== "forwards" &&
    element.props.revealOrder !== "backwards" &&
    element.props.revealOrder !== "together"
  ) {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.sl`,
      options,
    );
  }

  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];

  if (element.props.revealOrder === "together") {
    return reconcileSequence(parent, previousNodes, children, runtime, `${path}.sl`, options);
  }

  const nodes: Node[] = [];
  let previousIndex = 0;

  if (element.props.revealOrder === "backwards") {
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index] as ReactCompatNode;
      const result = reconcileNode(
        parent,
        previousNodes.slice(previousIndex),
        child,
        runtime,
        `${path}.sl.${index}`,
        options,
      );
      nodes.unshift(...result.nodes);
      previousIndex += result.consumed;

      if (isSuspenseFallback(child, result.nodes)) {
        break;
      }
    }

    return { nodes, consumed: previousIndex };
  }

  for (const [index, child] of children.entries()) {
    const result = reconcileNode(
      parent,
      previousNodes.slice(previousIndex),
      child,
      runtime,
      `${path}.sl.${index}`,
      options,
    );
    nodes.push(...result.nodes);
    previousIndex += result.consumed;

    if (isSuspenseFallback(child, result.nodes)) {
      break;
    }
  }

  return { nodes, consumed: previousIndex };
}

function findReactSuspenseBoundary(
  previousNodes: readonly Node[],
): ReactSuspenseBoundary | undefined {
  const startIndex = previousNodes.findIndex(isReactSuspenseStartComment);

  if (startIndex < 0) {
    return undefined;
  }

  let depth = 0;

  for (let index = startIndex; index < previousNodes.length; index += 1) {
    const node = previousNodes[index];

    if (isReactSuspenseStartComment(node)) {
      depth += 1;
      continue;
    }

    if (isReactSuspenseEndComment(node)) {
      depth -= 1;

      if (depth === 0) {
        const start = previousNodes[startIndex] as Comment;
        const boundaryNodes = previousNodes.slice(startIndex + 1, index);

        return {
          start,
          end: node,
          previousNodes: isReactSuspensePendingStartComment(start)
            ? removeReactSuspensePendingTemplate(boundaryNodes)
            : boundaryNodes,
          consumed: index - startIndex + 1,
        };
      }
    }
  }

  return undefined;
}

function consumeReactSuspenseBoundary(
  boundary: ReactSuspenseBoundary | undefined,
  parent: ParentNode,
  result: ReconcileResult,
): ReconcileResult {
  if (boundary === undefined) {
    return result;
  }

  syncScopedChildNodes(parent, boundary.start, boundary.end, result.nodes);
  boundary.start.parentNode?.removeChild(boundary.start);
  boundary.end.parentNode?.removeChild(boundary.end);
  return { nodes: result.nodes, consumed: boundary.consumed };
}

function isReactSuspenseStartComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && reactSuspenseStartComments.has(node.data);
}

function isReactSuspensePendingStartComment(node: Comment): boolean {
  return node.data === "$?" || node.data === "$!";
}

function isReactSuspenseEndComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && node.data === "/$";
}

function removeReactSuspensePendingTemplate(nodes: readonly Node[]): Node[] {
  const [firstNode, ...remainingNodes] = nodes;

  return firstNode instanceof HTMLTemplateElement
    ? remainingNodes
    : [...nodes];
}

const reactSuspenseStartComments = new Set(["$", "$?", "$!"]);

function isSuspenseFallback(
  node: ReactCompatNode,
  renderedNodes: readonly Node[],
): boolean {
  return (
    isReactCompatElement(node) &&
    node.type === Suspense &&
    renderedNodes.some((renderedNode) =>
      renderedNode instanceof Element &&
      renderedNode.tagName.toLowerCase() === getFallbackTagName(node),
    )
  );
}

function getFallbackTagName(node: ReactCompatElement): string | undefined {
  const fallback = node.props.fallback;

  return isReactCompatElement(fallback) && typeof fallback.type === "string"
    ? fallback.type
    : undefined;
}
