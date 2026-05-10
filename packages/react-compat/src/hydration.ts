import type { ReactCompatNode } from "./element.js";

export interface HydrationRecoverableErrorInfo {
  kind: "tag" | "text" | "attribute" | "node";
  path: string;
}

export interface HydrationContext {
  onRecoverableError?: (
    error: Error,
    info: HydrationRecoverableErrorInfo,
  ) => void;
}

export interface RenderOptions {
  hydration?: HydrationContext;
  eventRoot?: Element;
}

export interface HydrationScope {
  parent: ParentNode;
  previousNodes: Node[];
  before: ChildNode | null;
  after: ChildNode | null;
}

export function applyStreamingHydrationFragments(
  root: ParentNode = document,
): void {
  const fragments = Array.from(
    root.querySelectorAll<HTMLTemplateElement>(
      "template[data-mreact-oob-fragment]",
    ),
  );

  for (const fragment of fragments) {
    const id = fragment.dataset.mreactOobFragment;

    if (id === undefined) {
      continue;
    }

    const placeholder = root.querySelector<HTMLTemplateElement>(
      `template[data-mreact-oob-placeholder="${escapeSelectorString(id)}"]`,
    );

    if (placeholder === null) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
  }
}

export function getHydrationScope(
  container: Element,
  resumeId: string | undefined,
): HydrationScope {
  if (resumeId === undefined) {
    return {
      parent: container,
      previousNodes: Array.from(container.childNodes),
      before: null,
      after: null,
    };
  }

  const encodedId = encodeURIComponent(resumeId);
  const start = findComment(container, `mreact-h:start:${encodedId}`);
  const end =
    start === null ? null : findFollowingComment(start, `mreact-h:end:${encodedId}`);

  if (start === null || end === null || start.parentNode === null) {
    return {
      parent: container,
      previousNodes: Array.from(container.childNodes),
      before: null,
      after: null,
    };
  }

  return {
    parent: start.parentNode,
    previousNodes: collectScopedNodes(start.parentNode, start, end),
    before: start,
    after: end,
  };
}

export function findContainingResumeBoundaryId(
  root: ParentNode,
  target: Node,
): string | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const stack: string[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (!(node instanceof Comment)) {
      continue;
    }

    const startId = readResumeMarkerId(node.data, "mreact-h:start:");

    if (startId !== undefined) {
      stack.push(startId);
      continue;
    }

    if (node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING) {
      break;
    }

    const endId = readResumeMarkerId(node.data, "mreact-h:end:");

    if (endId !== undefined) {
      const lastIndex = stack.lastIndexOf(endId);

      if (lastIndex >= 0) {
        stack.length = lastIndex;
      }
    }
  }

  return stack.at(-1);
}

export function collectScopedNodes(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
): Node[] {
  const nodes: Node[] = [];
  let cursor = before === null ? parent.firstChild : before.nextSibling;

  while (cursor !== null && cursor !== after) {
    nodes.push(cursor);
    cursor = cursor.nextSibling;
  }

  return nodes;
}

export function escapeSelectorString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export function reportRecoverable(
  options: RenderOptions,
  kind: HydrationRecoverableErrorInfo["kind"],
  path: string,
  error: Error,
): void {
  options.hydration?.onRecoverableError?.(error, { kind, path });
}

export function reportElementTextMismatch(
  options: RenderOptions,
  path: string,
  existing: HTMLElement,
  children: ReactCompatNode,
): void {
  if (
    (typeof children === "string" || typeof children === "number") &&
    existing.textContent !== String(children)
  ) {
    reportRecoverable(
      options,
      "text",
      path,
      new Error("Hydration text mismatch."),
    );
  }
}

export function reportExtraHydrationNodes(
  options: RenderOptions,
  path: string,
  previousNodes: readonly Node[],
  consumed: number,
): void {
  if (consumed >= previousNodes.length) {
    return;
  }

  reportRecoverable(
    options,
    "node",
    path,
    new Error("Hydration extra node mismatch."),
  );
}

function readResumeMarkerId(
  value: string,
  prefix: "mreact-h:start:" | "mreact-h:end:",
): string | undefined {
  return value.startsWith(prefix)
    ? decodeURIComponent(value.slice(prefix.length))
    : undefined;
}

function findComment(root: ParentNode, value: string): Comment | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node instanceof Comment && node.data === value) {
      return node;
    }
  }

  return null;
}

function findFollowingComment(start: Comment, value: string): Comment | null {
  let cursor: Node | null = start.nextSibling;

  while (cursor !== null) {
    if (cursor instanceof Comment && cursor.data === value) {
      return cursor;
    }

    cursor = cursor.nextSibling;
  }

  return null;
}
