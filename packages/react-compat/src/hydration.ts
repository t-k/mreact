import type { ReactCompatNode } from "./element.js";

/** Details passed to recoverable hydration error callbacks. */
export interface HydrationRecoverableErrorInfo {
  kind: "tag" | "text" | "attribute" | "node" | "suspense-server-error";
  path: string;
  componentStack?: string;
}

export interface HydrationContext {
  onRecoverableError?: (
    error: Error,
    info: HydrationRecoverableErrorInfo,
  ) => void;
  componentStack?: string;
}

interface BufferedHydrationRecovery {
  error: Error;
  info: HydrationRecoverableErrorInfo;
}

interface HydrationRecoveryState {
  buffering: boolean;
  structuralMismatch: boolean;
  recoveries: BufferedHydrationRecovery[];
}

const hydrationRecoveryStates = new WeakMap<HydrationContext, HydrationRecoveryState>();

export interface RenderOptions {
  hydration?: HydrationContext;
  eventRoot?: Element;
  preserveHydrationAttributes?: boolean;
}

export interface HydrationScope {
  parent: ParentNode;
  previousNodes: Node[];
  before: ChildNode | null;
  after: ChildNode | null;
}

/** Applies streamed out-of-order hydration fragments to their placeholders. */
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

    const completionMarker = Array.from(
      root.querySelectorAll<Element>("[data-mreact-oob-complete]"),
    ).find((candidate) => candidate.getAttribute("data-mreact-oob-complete") === id);

    if (completionMarker === undefined) {
      continue;
    }

    const placeholder = root.querySelector<Element>(
      `[data-mreact-oob-placeholder="${escapeSelectorString(id)}"]`,
    );

    if (placeholder === null) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
    completionMarker.remove();
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
  const walker = container.ownerDocument.createTreeWalker(container, 128);
  const starts: Comment[] = [];
  const ends: Comment[] = [];
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (comment.data === `mreact-h:start:${encodedId}`) starts.push(comment);
    if (comment.data === `mreact-h:end:${encodedId}`) ends.push(comment);
  }
  const start = starts[0];
  const end = ends[0];
  if (starts.length !== 1 || ends.length !== 1 ||
      start === undefined || end === undefined || start.parentNode === null ||
      start.parentNode !== end.parentNode) {
    throw new Error("Invalid range markers.");
  }

  // Validate nesting only inside the requested range; other streamed ranges may be incomplete.
  const stack: string[] = [];
  let next: ChildNode | null = start;
  while (next !== null && next !== end) {
    if (next.nodeType === 8) {
      const value = (next as Comment).data;
      if (value.startsWith("mreact-h:start:")) stack.push(value.slice(15));
      if (value.startsWith("mreact-h:end:") && stack.pop() !== value.slice(13)) {
        throw new Error("Invalid range markers.");
      }
    }
    next = next.nextSibling;
  }
  if (next !== end || stack.length !== 1 || stack[0] !== encodedId) {
    throw new Error("Invalid range markers.");
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

    if (node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING) {
      break;
    }

    const startId = readResumeMarkerId(node.data, "mreact-h:start:");

    if (startId !== undefined) {
      stack.push(startId);
      continue;
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
  const componentStack = options.hydration?.componentStack;
  const info: HydrationRecoverableErrorInfo = {
    kind,
    path,
    ...(componentStack === undefined ? {} : { componentStack }),
  };
  const recoveryState =
    options.hydration === undefined ? undefined : hydrationRecoveryStates.get(options.hydration);

  if (recoveryState?.buffering === true) {
    recoveryState.recoveries.push({ error, info });
    recoveryState.structuralMismatch ||=
      kind === "node" || kind === "tag" || kind === "text";
    return;
  }

  options.hydration?.onRecoverableError?.(error, info);
}

export function beginHydrationRecovery(options: RenderOptions): void {
  const hydration = options.hydration;
  if (hydration === undefined) return;

  const state = hydrationRecoveryStates.get(hydration) ?? {
    buffering: true,
    structuralMismatch: false,
    recoveries: [],
  };
  state.buffering = true;
  state.structuralMismatch = false;
  state.recoveries.length = 0;
  hydrationRecoveryStates.set(hydration, state);
}

export function hasStructuralHydrationMismatch(options: RenderOptions): boolean {
  return options.hydration === undefined
    ? false
    : hydrationRecoveryStates.get(options.hydration)?.structuralMismatch === true;
}

export function flushHydrationRecoveries(options: RenderOptions): void {
  const hydration = options.hydration;
  if (hydration === undefined) return;

  const state = hydrationRecoveryStates.get(hydration);
  if (state === undefined) return;

  state.buffering = false;
  const recoveries = state.structuralMismatch
    ? state.recoveries
        .filter(
          ({ info }) =>
            info.kind === "node" || info.kind === "tag" || info.kind === "text",
        )
        .slice(0, 1)
    : state.recoveries;
  state.recoveries = [];

  for (const recovery of recoveries) {
    hydration.onRecoverableError?.(recovery.error, recovery.info);
  }
}

export function reportMissingHydrationNode(
  options: RenderOptions,
  path: string,
): void {
  reportRecoverable(
    options,
    "node",
    path,
    new Error("Hydration missing node mismatch."),
  );
}

export function reportReactSuspenseServerError(
  options: RenderOptions,
  path: string,
  message: string,
  componentStack: string | undefined,
): void {
  options.hydration?.onRecoverableError?.(new Error(message), {
    kind: "suspense-server-error",
    path,
    ...(componentStack === undefined ? {} : { componentStack }),
  });
}

export function reportHydrationNodeTypeMismatch(
  options: RenderOptions,
  path: string,
  expected: string,
  existing: Node,
): void {
  reportRecoverable(
    options,
    "node",
    path,
    new Error(
      `Hydration node type mismatch: expected ${expected} but found ${describeHydrationNode(existing)}.`,
    ),
  );
}

export function withHydrationComponentStack(
  options: RenderOptions,
  componentName: string,
): RenderOptions {
  if (options.hydration === undefined) {
    return options;
  }

  const frame = `\n    at ${componentName}`;
  const hydration = {
    ...options.hydration,
    componentStack: `${options.hydration.componentStack ?? ""}${frame}`,
  };
  const recoveryState = hydrationRecoveryStates.get(options.hydration);
  if (recoveryState !== undefined) {
    hydrationRecoveryStates.set(hydration, recoveryState);
  }

  return {
    ...options,
    hydration,
  };
}

export function reportElementTextMismatch(
  options: RenderOptions,
  path: string,
  existing: Element,
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

function describeHydrationNode(node: Node): string {
  if (node instanceof HTMLElement) {
    return `<${node.tagName.toLowerCase()}>`;
  }

  if (node instanceof Text) {
    return "text";
  }

  if (node instanceof Comment) {
    return "comment";
  }

  return "node";
}

function readResumeMarkerId(
  value: string,
  prefix: "mreact-h:start:" | "mreact-h:end:",
): string | undefined {
  return value.startsWith(prefix)
    ? decodeURIComponent(value.slice(prefix.length))
    : undefined;
}
