import {
  Activity,
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
  Fragment,
  HOST_CHILDREN_ONLY_PROPS_META,
  LAZY_TYPE,
  MEMO_TYPE,
  Profiler,
  REACTIVE_DOM_BLOCK_TYPE,
  REACTIVE_TEXT_BINDING_META,
  STRICT_MODE_TYPE,
  Suspense,
  SuspenseList,
  type MemoType,
  type ReactCompatElement,
  type ReactCompatPortal,
  type ReactiveDomBlockProps,
  type ReactiveDomBlockResult,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatNode,
} from "./element.js";
import {
  batchReactivePropCellUpdates,
  createReactivePropCell,
  createReactivePropProxy,
  setReactivePropCell,
  type ReactiveDomBlockState,
} from "./reactive-prop-cell.js";
import {
  consumerContext,
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import {
  applyPostChildFormProps,
  applyProps,
  hasDangerouslySetInnerHtmlProp,
  hasTextAreaValueProp,
} from "./dom-props.js";
import { syncChildNodes, syncOwnedChildNodes, syncScopedChildNodes } from "./dom-children.js";
import { setLogicalEventParent } from "./host-event-binder.js";
import { ChildDeletion, NoFlags, Placement, Update } from "./fiber-flags.js";
import {
  createHostElement,
  hostElementMatches,
  isDomHostElement,
  isHostElement,
  namespaceForHostChildren,
  namespaceForHostElement,
  type CustomHostDocument,
  type HostElement,
  type HostNamespace,
} from "./dom-host-rules.js";
import { createFiber, createWorkInProgress, type Fiber, type FiberRoot } from "./fiber.js";
import {
  renderWithRootRuntime,
  renderWithProfiler,
  renderWithStrictModeMemoCapture,
  renderStrictModeReplay,
  runWithHostCommit,
  restoreRuntimeSnapshot,
  takeRuntimeSnapshot,
  getDevToolsHookState,
  collectRuntimeInstanceKeys,
  hasContextDependency,
  hasChangedContextDependency,
  subscribeReactiveTextBinding,
  type RootRuntime,
} from "./hooks.js";
import { isThenable } from "./thenable.js";
import {
  hasDirtyClassUpdate,
  isClassComponentType,
  recoverClassComponentError,
  renderClassComponentWithRuntime,
  type ClassComponentInstance,
} from "./class-component.js";
import { areMemoPropsEqual, getPendingProps, shallowEqual } from "./prop-comparison.js";
import {
  reportElementTextMismatch,
  reportExtraHydrationNodes,
  reportHydrationNodeTypeMismatch,
  reportMissingHydrationNode,
  reportReactSuspenseServerError,
  reportRecoverable,
  type HydrationScope,
  type RenderOptions,
  withHydrationComponentStack,
} from "./hydration.js";
import { withBatchedDelegatedRootReleases } from "@reckona/mreact-reactive-dom";
import { attachRef, detachRef } from "./ref-lifecycle.js";

interface MemoFiberState {
  props: Record<string, unknown>;
  instanceKeys: string[];
  hasDirtyInstanceDependencies: boolean;
  hasUnflushedEffectDependencies: boolean;
  hasRetainedInstanceDependencies: boolean;
}

interface FunctionFiberState {
  element: ReactCompatElement;
  props: Record<string, unknown>;
  instanceKeys: string[];
  hasContextDependencies: boolean;
}

interface SuspenseFiberState {
  didSuspend: boolean;
}

const committedPortalContainers = new Set<Element>();
const pendingHostRefUpdates: { detach: boolean; ref: unknown; node: unknown }[] = [];
const pendingReactiveDomBlockAfterCommits: (() => void)[] = [];
const emptyInstanceKeys: string[] = [];

interface FiberHydrationOptions extends RenderOptions {
  previousNodes?: readonly Node[];
  resumeId?: string;
  consumeResumeMarkers?: boolean;
  namespace?: HostNamespace;
  documentRef?: Document | CustomHostDocument;
  runtimePathPrefix?: string;
}

const SKIP_COMMIT_PATH = "\0";
const hasOwnProperty = Object.prototype.hasOwnProperty;

interface FiberReconcileResult {
  fiber: Fiber | undefined;
  consumed: number;
}

interface AppendSuffixCommitHint {
  fiber: Fiber;
  index: number;
}

interface ReactSuspenseBoundary {
  previousNodes?: Node[];
  consumed: number;
  serverError?: {
    message: string;
    componentStack?: string;
  };
}

let suspensePrimaryRenderDepth = 0;

export function canRenderHostFiber(node: ReactCompatNode): boolean {
  if (
    node === null ||
    node === undefined ||
    typeof node === "boolean" ||
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return true;
  }

  if (Array.isArray(node)) {
    return node.every(canRenderHostFiber);
  }

  if (isReactCompatPortal(node)) {
    return canRenderHostFiber(node.children);
  }

  if (!isReactCompatElement(node)) {
    return false;
  }

  if (node.type === Fragment || node.type === Profiler || node.type === STRICT_MODE_TYPE) {
    return canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  if (node.type === Activity) {
    return (node.props as { mode?: unknown }).mode === "hidden"
      ? true
      : canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  if (node.type === Suspense || node.type === SuspenseList) {
    return true;
  }

  if (node.type === ERROR_BOUNDARY_TYPE) {
    return true;
  }

  if (node.type === REACTIVE_DOM_BLOCK_TYPE) {
    return true;
  }

  if (isReactCompatProvider(node.type)) {
    return canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  if (isReactCompatConsumer(node.type)) {
    return true;
  }

  if (isForwardRefType(node.type)) {
    return true;
  }

  if (isMemoType(node.type)) {
    return true;
  }

  if (isLazyType(node.type)) {
    return true;
  }

  if (isClassComponentType(node.type)) {
    return true;
  }

  return (
    (typeof node.type === "string" && canRenderHostFiber(node.props.children as ReactCompatNode)) ||
    isFunctionComponentType(node.type)
  );
}

export function renderHostFiberRoot(
  root: FiberRoot,
  element: ReactCompatNode,
  runtime?: RootRuntime,
  options: FiberHydrationOptions = {},
): Fiber {
  const workInProgress = createWorkInProgress(root.current, { children: element });
  const rootDocument = root.container.ownerDocument;
  const hydrating = options.previousNodes !== undefined;
  const result = batchReactivePropCellUpdates(() =>
    reconcileHostChild(workInProgress, root.current.child, element, runtime, hydrating ? "" : "0", {
      ...options,
      ...(hydrating ? { runtimePathPrefix: "0" } : {}),
      documentRef: options.documentRef ?? rootDocument,
    }),
  );
  workInProgress.child = result.fiber;
  workInProgress.memoizedProps = { children: element };
  root.refCleanupKnown = true;
  return workInProgress;
}

export function renderHydratingHostFiberRoot(
  root: FiberRoot,
  element: ReactCompatNode,
  runtime: RootRuntime,
  scope: HydrationScope,
  options: FiberHydrationOptions = {},
): Fiber {
  root.hydrationState = {
    parent: scope.parent,
    nextHydratableNode: scope.previousNodes[0] ?? null,
    before: scope.before,
    after: scope.after,
    ...(options.resumeId === undefined ? {} : { resumeId: options.resumeId }),
  };
  return renderHostFiberRoot(root, element, runtime, {
    ...options,
    previousNodes: scope.previousNodes,
  });
}

export function commitHostFiberRoot(
  root: FiberRoot,
  finishedWork: Fiber,
  options: RenderOptions = {},
): void {
  runWithHostCommit(() => {
    let committed = false;
    try {
      committedPortalContainers.clear();
      pendingHostRefUpdates.length = 0;
      pendingReactiveDomBlockAfterCommits.length = 0;
      const commitPath = getRootCommitPath(options);
      if (!hasChildListMutation(finishedWork)) {
        commitHostDirtyChildrenOf(
          finishedWork,
          finishedWork.child,
          root.container,
          root.container,
          commitPath,
          options,
        );
        flushPendingReactiveDomBlockAfterCommits();
        committed = true;
        return;
      }

      if (
        finishedWork.childListChanged &&
        commitHostKeyedChildListMutationFiber(
          finishedWork,
          root.container,
          root.container,
          commitPath,
          options,
        )
      ) {
        flushPendingReactiveDomBlockAfterCommits();
        committed = true;
        return;
      }

      if (
        !finishedWork.childListChanged &&
        finishedWork.subtreeChildListChanged &&
        commitHostKeyedChildListMutation(
          finishedWork.child,
          root.container,
          root.container,
          commitPath,
          options,
        )
      ) {
        flushPendingReactiveDomBlockAfterCommits();
        committed = true;
        return;
      }

      const nodes = commitHostChildren(
        finishedWork.child,
        root.container,
        root.container,
        commitPath,
        options,
      );
      syncChildNodes(root.container, nodes);
      flushPendingReactiveDomBlockAfterCommits();
      committed = true;
    } finally {
      if (committed) {
        flushPendingHostRefUpdates();
      } else {
        pendingHostRefUpdates.length = 0;
      }
      committedPortalContainers.clear();
    }
  });
}

export function commitHydratingHostFiberRoot(
  root: FiberRoot,
  finishedWork: Fiber,
  scope: HydrationScope,
  options: FiberHydrationOptions = {},
): void {
  runWithHostCommit(() => {
    let committed = false;
    try {
      committedPortalContainers.clear();
      pendingHostRefUpdates.length = 0;
      pendingReactiveDomBlockAfterCommits.length = 0;
      const eventRoot = root.container;
      const nodes = commitHostChildren(finishedWork.child, scope.parent, eventRoot, "", options);
      syncScopedChildNodes(scope.parent, scope.before, scope.after, nodes);
      flushPendingReactiveDomBlockAfterCommits();
      committed = true;
    } finally {
      if (committed) {
        flushPendingHostRefUpdates();
      } else {
        pendingHostRefUpdates.length = 0;
        pendingReactiveDomBlockAfterCommits.length = 0;
      }
      committedPortalContainers.clear();
    }
  });

  if (options.consumeResumeMarkers === true) {
    scope.before?.parentNode?.removeChild(scope.before);
    scope.after?.parentNode?.removeChild(scope.after);
  }
}

export function disposeHostFiberResources(fiber: Fiber | undefined): void {
  if (fiber === undefined || fiber.hasDisposableResources !== true) {
    return;
  }

  withBatchedDelegatedRootReleases(() => {
    // Dispose this fiber and its SUBTREE only — not its siblings. This is called
    // once per deleted fiber, and deleted siblings are disposed by their own
    // calls; walking siblings here re-walked the whole deleted list per deletion
    // (O(n^2) on a cleared 1k-row reactive list). The dedupe set is allocated
    // once for the subtree walk.
    const seen = new Set<unknown>();
    if (fiber.tag === "reactive-dom-block") {
      disposeReactiveDomBlockState(fiber.stateNode, seen);
    }
    disposeHostFiberChildResources(fiber.child, seen);
  });
}

export function disposeUnretainedHostFiberResources(
  fiber: Fiber | undefined,
  retained: ReadonlySet<Fiber>,
): void {
  if (fiber === undefined || fiber.hasDisposableResources !== true || retained.has(fiber)) {
    return;
  }

  withBatchedDelegatedRootReleases(() => {
    const seen = new Set<unknown>();
    disposeUnretainedHostFiberSubtreeResources(fiber, seen, retained);
  });
}

function disposeHostFiberChildResources(fiber: Fiber | undefined, seen: Set<unknown>): void {
  let cursor = fiber;

  while (cursor !== undefined) {
    if (cursor.hasDisposableResources === true) {
      if (cursor.tag === "reactive-dom-block") {
        disposeReactiveDomBlockState(cursor.stateNode, seen);
      }

      disposeHostFiberChildResources(cursor.child, seen);
    }

    cursor = cursor.sibling;
  }
}

function disposeUnretainedHostFiberSubtreeResources(
  fiber: Fiber | undefined,
  seen: Set<unknown>,
  retained: ReadonlySet<Fiber>,
): void {
  if (fiber === undefined || retained.has(fiber) || fiber.hasDisposableResources !== true) {
    return;
  }

  if (fiber.tag === "reactive-dom-block") {
    disposeReactiveDomBlockState(fiber.stateNode, seen);
  }

  let child = fiber.child;
  while (child !== undefined) {
    disposeUnretainedHostFiberSubtreeResources(child, seen, retained);
    child = child.sibling;
  }
}

function reconcileHostChild(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  node: ReactCompatNode,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  resetFiberRefSubtree(parent);
  parent.subtreeFlags = NoFlags;
  parent.childListChanged = false;
  parent.subtreeChildListChanged = false;

  if (node === null || node === undefined || typeof node === "boolean") {
    parent.childListChanged = currentFirstChild !== undefined;
    if (currentFirstChild !== undefined) {
      markOptimizedChildrenForDeletion(parent, currentFirstChild);
    }
    return { fiber: undefined, consumed: 0 };
  }

  const children = Array.isArray(node) ? node : undefined;
  const rowResult =
    children === undefined
      ? undefined
      : (reconcileKeyedRowHostChildren(parent, currentFirstChild, children, options) ??
        reconcileKeyedMemoRowHostChildren(
          parent,
          currentFirstChild,
          children,
          runtime,
          path,
          options,
        ));
  if (rowResult !== undefined) {
    return rowResult;
  }

  const childCount = children === undefined ? 1 : children.length;
  const hasKeyedChildren = children !== undefined && hasKeyedChild(children);
  const canReuseCurrentFibersInList = !hasKeyedChildren || currentFirstChild === undefined;
  let existingByKey: Map<string, Fiber> | undefined;
  let currentKeyed: Fiber | undefined = currentFirstChild;
  let currentUnkeyed = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let consumed = 0;
  let skipRemainingKeyedLookup = false;
  let sequentialCurrentCursor = currentFirstChild;
  let childListOrderChanged = false;
  let dirtyChildren: Fiber[] | undefined;
  let usedCurrentChildren =
    currentFirstChild === undefined || hasKeyedChildren ? undefined : new Set<Fiber>();
  const ensureUsedCurrentChildren = (): Set<Fiber> => {
    if (usedCurrentChildren === undefined) {
      usedCurrentChildren = new Set<Fiber>();
      let cursor = currentFirstChild;

      while (cursor !== undefined && cursor !== sequentialCurrentCursor) {
        usedCurrentChildren.add(cursor);
        cursor = cursor.sibling;
      }
    }

    return usedCurrentChildren;
  };

  for (let index = 0; index < childCount; index += 1) {
    const child = children === undefined ? node : children[index];
    const key = getNodeKey(child);
    let matchedCurrent: Fiber | undefined;
    let canReuseMatchedCurrentFiber = canReuseCurrentFibersInList;

    if (key === undefined) {
      if (hasKeyedChildren && currentUnkeyed !== undefined) {
        childListOrderChanged = true;
        ensureUsedCurrentChildren();
      }
      matchedCurrent = currentUnkeyed;
    } else if (skipRemainingKeyedLookup) {
      childListOrderChanged = true;
      matchedCurrent = undefined;
    } else if (existingByKey !== undefined) {
      childListOrderChanged = true;
      matchedCurrent = existingByKey.get(key);
      canReuseMatchedCurrentFiber = matchedCurrent === undefined;
    } else if (currentKeyed?.key === key) {
      matchedCurrent = currentKeyed;
      canReuseMatchedCurrentFiber = true;
      currentKeyed = currentKeyed.sibling;
      sequentialCurrentCursor = currentKeyed;
    } else if (
      children !== undefined &&
      currentKeyed?.sibling?.key === key &&
      canSkipSingleDeletedKeyedFiber(children, index, currentKeyed.sibling)
    ) {
      const deleted = currentKeyed;
      const matched = currentKeyed.sibling;
      const suffixResult = tryReuseDependencyFreeMemoRemovalSuffix(
        parent,
        children,
        index,
        deleted,
        matched,
        runtime,
        options,
        first,
        previous,
        consumed,
      );
      if (suffixResult !== undefined) {
        return suffixResult;
      }
      childListOrderChanged = true;
      ensureUsedCurrentChildren();
      matchedCurrent = matched;
      canReuseMatchedCurrentFiber = false;
      currentKeyed = matched.sibling;
    } else {
      if (
        children !== undefined &&
        hasKeyedChildren &&
        canSkipRemainingKeyedLookup(currentKeyed, children, index)
      ) {
        childListOrderChanged = true;
        skipRemainingKeyedLookup = true;
        currentKeyed = undefined;
      } else if (hasKeyedChildren) {
        childListOrderChanged = true;
        ensureUsedCurrentChildren();
        existingByKey = collectExistingKeyedFibers(currentKeyed);
        matchedCurrent = existingByKey.get(key);
        canReuseMatchedCurrentFiber = matchedCurrent === undefined;
      }
    }

    const memoBailout = tryReuseDependencyFreeMemoBailout(
      matchedCurrent,
      child,
      runtime,
      options,
      canReuseMatchedCurrentFiber,
    );
    const previousNodes =
      memoBailout !== undefined || options.previousNodes === undefined
        ? undefined
        : options.previousNodes.slice(consumed);
    const result =
      memoBailout ??
      createHostFiber(
        parent,
        matchedCurrent,
        child,
        key,
        runtime,
        getReconcileChildPath(path, child, index, options),
        previousNodes === undefined ? options : { ...options, previousNodes },
        canReuseMatchedCurrentFiber,
      );
    const fiber = result.fiber;

    if (fiber === undefined) {
      if (matchedCurrent !== undefined) {
        usedCurrentChildren?.add(matchedCurrent);
        markOptimizedChildForDeletion(parent, matchedCurrent);
      }
      continue;
    }

    if (matchedCurrent !== undefined) {
      usedCurrentChildren?.add(matchedCurrent);
      if (fiber !== matchedCurrent && fiber.alternate !== matchedCurrent) {
        markOptimizedChildForDeletion(parent, matchedCurrent);
      }
    }

    if (key === undefined) {
      currentUnkeyed = currentUnkeyed?.sibling;
    }
    consumed += result.consumed;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    bubbleHostChild(parent, fiber);
    if (
      fiber.tag !== "memo" &&
      fiber.tag !== "function-component" &&
      fiber.tag !== "forward-ref" &&
      fiber.tag !== "profiler" &&
      fiber.tag !== "suspense" &&
      fiber.tag !== "suspense-list" &&
      fiber.memoizedState === undefined
    ) {
      fiber.memoizedState = index;
    } else if (
      fiber.tag === "memo" &&
      (fiber.stateNode === undefined || typeof fiber.stateNode === "number")
    ) {
      fiber.stateNode = index;
    }
    if (hasHostCommitWork(fiber)) {
      (dirtyChildren ??= []).push(fiber);
    }
    previous = fiber;
  }

  if (usedCurrentChildren === undefined && hasKeyedChildren && currentKeyed !== undefined) {
    markOptimizedChildrenForDeletion(parent, currentKeyed);
  } else {
    markUnusedCurrentChildrenForDeletion(parent, currentFirstChild, usedCurrentChildren);
  }
  parent.childListChanged =
    childListOrderChanged || childFiberListShapeChanged(currentFirstChild, first);
  recordDirtyChildCommitHints(parent, dirtyChildren);

  return { fiber: first, consumed };
}

function reconcileKeyedRowHostChildren(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
  options: FiberHydrationOptions,
): FiberReconcileResult | undefined {
  if (
    children.length === 0 ||
    currentFirstChild === undefined ||
    options.previousNodes !== undefined ||
    !isKeyedRowHostElementCandidate(children[0]) ||
    !shouldUseDirectHostTextChild()
  ) {
    return undefined;
  }

  let currentKeyed: Fiber | undefined = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let listShapeChanged = currentFirstChild === undefined;
  let skipRemainingKeyedLookup = false;
  let subtreeFlags = NoFlags;
  let subtreeChildListChanged = false;
  let hasRefSubtree = false;
  let hasDisposableResources = false;
  let appendSuffix: AppendSuffixCommitHint | undefined;
  const canReuseUnchangedRows = hasSameKeyOrderPrefix(currentFirstChild, children);
  const row = createKeyedRowHostElementScratch();

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (!readKeyedRowHostElement(child, row)) {
      return undefined;
    }

    let matchedCurrent: Fiber | undefined;
    let matchedByAppendSuffix = false;

    if (skipRemainingKeyedLookup) {
      matchedCurrent = undefined;
    } else if (currentKeyed === undefined) {
      listShapeChanged = true;
      skipRemainingKeyedLookup = true;
      matchedByAppendSuffix = true;
      matchedCurrent = undefined;
    } else if (currentKeyed?.key === row.key) {
      matchedCurrent = currentKeyed;
      currentKeyed = currentKeyed.sibling;
    } else if (
      currentKeyed?.sibling?.key === row.key &&
      canSkipSingleDeletedKeyedFiber(children, index, currentKeyed.sibling)
    ) {
      const deleted = currentKeyed;
      const matched = currentKeyed.sibling;
      listShapeChanged = true;
      markOptimizedChildForDeletion(parent, deleted);
      matchedCurrent = matched;
      currentKeyed = matched.sibling;
    } else if (canSkipRemainingKeyedLookup(currentKeyed, children, index)) {
      listShapeChanged = true;
      markOptimizedChildrenForDeletion(parent, currentKeyed);
      skipRemainingKeyedLookup = true;
      currentKeyed = undefined;
      matchedCurrent = undefined;
    } else {
      return undefined;
    }

    const fiber =
      matchedCurrent === undefined
        ? createKeyedRowHostFiber(parent, undefined, row, options)
        : ((canReuseUnchangedRows
            ? getReusableKeyedRowHostFiber(matchedCurrent, row)
            : undefined) ?? createKeyedRowHostFiber(parent, matchedCurrent, row, options));

    if (matchedByAppendSuffix && appendSuffix === undefined) {
      appendSuffix = { fiber, index };
    }

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    if (fiber.hasRefSubtree) {
      hasRefSubtree = true;
    }
    if (fiber.hasDisposableResources) {
      hasDisposableResources = true;
    }
    subtreeFlags |= fiber.flags | fiber.subtreeFlags;
    subtreeChildListChanged =
      subtreeChildListChanged || fiber.childListChanged || fiber.subtreeChildListChanged;
    if (fiber.memoizedState === undefined) {
      fiber.memoizedState = index;
    }
    previous = fiber;
  }

  if (currentKeyed !== undefined) {
    listShapeChanged = true;
    markOptimizedChildrenForDeletion(parent, currentKeyed);
  }

  parent.hasRefSubtree = hasRefSubtree;
  parent.hasDisposableResources = hasDisposableResources;
  parent.subtreeFlags = subtreeFlags;
  parent.subtreeChildListChanged = subtreeChildListChanged;
  parent.childListChanged = listShapeChanged;
  if (appendSuffix !== undefined && canStoreAppendSuffixCommitHint(parent)) {
    parent.memoizedState = appendSuffix;
  }
  return { fiber: first, consumed: 0 };
}

function isKeyedMemoRowCandidate(node: ReactCompatNode): boolean {
  return (
    isReactCompatElement(node) && node.key !== null && node.ref === null && isMemoType(node.type)
  );
}

// Marker the compiler stamps on a lowered host-only component that returns its
// props verbatim as a reactive block (`createReactiveDomBlock(render, props)`).
// Such a component is pure and structurally static, so on a props change the
// reconciler can drive its committed block straight through the prop cell instead
// of re-invoking the component (the block's bound DOM updates via subscriptions).
const STATIC_REACTIVE_BLOCK_MARKER = "__mreactStaticBlock";
const MEMO_COMPARE_PROPS_MARKER = "__mreactMemoCompareProps";

function isStaticReactiveBlockComponent(type: unknown): boolean {
  return (
    typeof type === "function" &&
    (type as unknown as Record<string, unknown>)[STATIC_REACTIVE_BLOCK_MARKER] === true
  );
}

function consumeReactiveDomBlockHydrationNode(previousNodes: readonly Node[] | undefined): number {
  return previousNodes === undefined || previousNodes.length === 0 ? 0 : 1;
}

function areCompilerMemoComparePropsEqual(
  memoType: MemoType<Record<string, unknown>>,
  previousProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
): boolean | undefined {
  const keys = memoType[MEMO_COMPARE_PROPS_MARKER];
  if (keys === undefined) {
    return undefined;
  }

  if (keys.length === 1) {
    const key = keys[0] as string;
    return previousProps[key] === nextProps[key];
  }

  if (keys.length === 2) {
    const first = keys[0] as string;
    const second = keys[1] as string;
    return previousProps[first] === nextProps[first] && previousProps[second] === nextProps[second];
  }

  if (keys.length === 3) {
    const first = keys[0] as string;
    const second = keys[1] as string;
    const third = keys[2] as string;
    return (
      previousProps[first] === nextProps[first] &&
      previousProps[second] === nextProps[second] &&
      previousProps[third] === nextProps[third]
    );
  }

  for (const key of keys) {
    if (previousProps[key] !== nextProps[key]) {
      return false;
    }
  }

  return true;
}

function tryCreateInitialStaticBlockMemoFiber(
  node: ReactCompatElement,
  key: string | undefined,
  memoType: {
    type: ReactCompatElement["type"];
    compare?: (previous: Record<string, unknown>, next: Record<string, unknown>) => boolean;
  },
  runtime: RootRuntime,
  memoPath: string,
  options: FiberHydrationOptions,
): FiberReconcileResult | undefined {
  if (
    options.previousNodes !== undefined ||
    node.ref !== null ||
    !isStaticReactiveBlockComponent(memoType.type)
  ) {
    return undefined;
  }

  const props = node.props as Record<string, unknown>;
  const componentType = memoType.type as (props: Record<string, unknown>) => ReactCompatNode;
  const rendered = componentType(props);

  if (!isReactCompatElement(rendered) || rendered.type !== REACTIVE_DOM_BLOCK_TYPE) {
    return undefined;
  }

  const memoFiber = createFiber("memo", props, key);
  memoFiber.type = memoType;

  const componentFiber = createFiber("function-component", props, key);
  componentFiber.type = componentType;

  const childResult = createHostFiber(
    componentFiber,
    undefined,
    rendered,
    key,
    runtime,
    `${memoPath}.0`,
    options,
  );
  componentFiber.child = childResult.fiber;
  if (componentFiber.child !== undefined) {
    componentFiber.child.return = componentFiber;
    componentFiber.child.sibling = undefined;
    bubbleHostChild(componentFiber, componentFiber.child);
  }
  componentFiber.stateNode = {
    element: node,
    props,
    instanceKeys: emptyInstanceKeys,
    hasContextDependencies: false,
  } satisfies FunctionFiberState;

  memoFiber.child = componentFiber;
  componentFiber.return = memoFiber;
  bubbleHostChild(memoFiber, componentFiber);
  memoFiber.memoizedState = {
    props,
    instanceKeys: emptyInstanceKeys,
    hasDirtyInstanceDependencies: false,
    hasUnflushedEffectDependencies: false,
    hasRetainedInstanceDependencies: false,
  } satisfies MemoFiberState;

  return { fiber: memoFiber, consumed: childResult.consumed };
}

// In-place bailout for a keyed memo row whose props are unchanged and which has
// no hook/context/effect dependencies. The caller has proven the key order is
// unchanged (hasSameKeyOrderPrefix), so the fiber keeps its position and can be
// reused WITHOUT createWorkInProgress — no allocation, and the retained subtree
// (including any reactive-dom-block subscriptions) is left untouched. Returns
// undefined when the row must re-render or has dependencies (handled by the
// general per-child path instead). Mirrors tryReuseDependencyFreeMemoBailout +
// getMemoBailoutFiber's in-place branch, but is safe to reuse a fiber with
// disposable resources because a stable position means nothing is disposed.
function tryReuseDependencyFreeKeyedMemoRow(
  matched: Fiber,
  child: ReactCompatElement,
): Fiber | undefined {
  if (
    matched.tag !== "memo" ||
    matched.type !== child.type ||
    matched.hasRefSubtree === true ||
    matched.hydrateExisting === true
  ) {
    return undefined;
  }

  const state = matched.memoizedState as MemoFiberState | undefined;

  if (
    state === undefined ||
    state.hasDirtyInstanceDependencies !== false ||
    state.hasUnflushedEffectDependencies !== false ||
    state.hasRetainedInstanceDependencies !== false
  ) {
    return undefined;
  }

  const memoType = child.type as MemoType<Record<string, unknown>>;
  const nextProps = child.props as Record<string, unknown>;
  const propsEqual =
    areCompilerMemoComparePropsEqual(memoType, state.props, nextProps) ??
    areMemoPropsEqual(memoType, state.props, nextProps);

  if (!propsEqual) {
    return undefined;
  }

  matched.pendingProps = child.props;
  matched.flags = NoFlags;
  matched.subtreeFlags = NoFlags;
  matched.childListChanged = false;
  matched.subtreeChildListChanged = false;
  matched.hostChildListChanged = false;
  matched.child = getSkippedChild(matched);
  return matched;
}

// In-place CHANGED-row update for a keyed memo row whose inner component is a
// compiler-marked static reactive block (returns its props verbatim as the block
// props). Instead of re-invoking the component to rebuild a throwaway block
// element, push the new props straight into the committed block's prop cell — the
// bound DOM updates via subscriptions, exactly as the normal block re-render path
// would, but without the memo/component render machinery. Same-order is proven by
// the caller, so the fiber is reused in place. Returns undefined when this is not
// a marked, dependency-free, single-block memo row (the general path handles it).
function tryCellUpdateStaticBlockMemoRow(
  matched: Fiber,
  child: ReactCompatElement,
): Fiber | undefined {
  if (
    matched.tag !== "memo" ||
    matched.type !== child.type ||
    matched.hasRefSubtree === true ||
    matched.hydrateExisting === true ||
    !isStaticReactiveBlockComponent((matched.type as { type?: unknown }).type)
  ) {
    return undefined;
  }

  const state = matched.memoizedState as MemoFiberState | undefined;

  if (
    state === undefined ||
    state.hasDirtyInstanceDependencies !== false ||
    state.hasUnflushedEffectDependencies !== false ||
    state.hasRetainedInstanceDependencies !== false
  ) {
    return undefined;
  }

  // Navigate memo -> component fiber -> reactive-dom-block fiber. The marked
  // component renders exactly one static block, so anything else is unexpected.
  const componentFiber = matched.child;
  if (componentFiber === undefined || componentFiber.sibling !== undefined) {
    return undefined;
  }

  const blockFiber = componentFiber.child;
  if (
    blockFiber === undefined ||
    blockFiber.tag !== "reactive-dom-block" ||
    blockFiber.sibling !== undefined
  ) {
    return undefined;
  }

  const blockState = blockFiber.stateNode as ReactiveDomBlockState | undefined;
  if (blockState?.propCell === undefined) {
    return undefined;
  }

  // Drive the bound DOM through the prop cell (the marker guarantees the block's
  // props are the component's props verbatim), then reuse the memo fiber in place.
  const nextProps = child.props as Record<string, unknown>;
  setReactivePropCell(blockState.propCell, nextProps);
  state.props = nextProps;
  matched.memoizedState = state;
  matched.pendingProps = child.props;
  matched.flags = NoFlags;
  matched.subtreeFlags = NoFlags;
  matched.childListChanged = false;
  matched.subtreeChildListChanged = false;
  matched.hostChildListChanged = false;
  matched.child = getSkippedChild(matched);
  return matched;
}

// Fast path for a keyed list of memo-wrapped rows (e.g. `<RowMemo key={id} />`)
// whose key order is UNCHANGED, append-only, or a single deletion between
// renders — the js-framework-benchmark "select row", "partial update",
// "append rows", and "remove row" shapes. Walks current fibers and new children
// in lockstep: unchanged rows bail in place (no allocation, no general
// keyed-reconcile machinery), changed rows cell-update through the proven
// per-child path, appended rows are created as a suffix, and a single deleted
// row is removed while the suffix is retained. Any reorder / insert /
// multi-delete / non-memo child makes it return undefined so the general
// reconcile takes over.
function reconcileKeyedMemoRowHostChildren(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions,
): FiberReconcileResult | undefined {
  if (
    children.length === 0 ||
    currentFirstChild === undefined ||
    runtime === undefined ||
    options.previousNodes !== undefined ||
    !isKeyedMemoRowCandidate(children[0])
  ) {
    return undefined;
  }

  const memoRowType = (children[0] as ReactCompatElement).type;
  if (!hasSameAppendOrSingleDeleteKeyOrder(currentFirstChild, children, memoRowType)) {
    return undefined;
  }

  let currentKeyed: Fiber | undefined = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let subtreeFlags = NoFlags;
  let subtreeChildListChanged = false;
  let hasRefSubtree = false;
  let hasDisposableResources = false;
  let listShapeChanged = false;
  let appendSuffix: AppendSuffixCommitHint | undefined;
  let removedFiber: Fiber | undefined;
  let dirtyChildren: Fiber[] | undefined;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index] as ReactCompatElement;
    const childElement = child;
    let matched: Fiber | undefined = currentKeyed;

    if (matched === undefined) {
      // append-only suffix
    } else if (matched.key === childElement.key) {
      currentKeyed = matched.sibling;
    } else if (
      removedFiber === undefined &&
      matched.sibling?.key === childElement.key &&
      canSkipSingleDeletedKeyedFiber(children, index, matched.sibling)
    ) {
      removedFiber = matched;
      matched = matched.sibling;
      currentKeyed = matched.sibling;
      listShapeChanged = true;
    } else {
      return undefined;
    }

    let fiber =
      matched === undefined
        ? undefined
        : (tryReuseDependencyFreeKeyedMemoRow(matched, childElement) ??
          tryCellUpdateStaticBlockMemoRow(matched, childElement));
    if (fiber === undefined) {
      const result = createHostFiber(
        parent,
        matched,
        child,
        childElement.key ?? undefined,
        runtime,
        getReconcileChildPath(path, child, index, options),
        options,
        false,
      );
      fiber = result.fiber;

      if (fiber === undefined) {
        return undefined;
      }

      if (matched !== undefined && fiber !== matched && fiber.alternate !== matched) {
        markOptimizedChildForDeletion(parent, matched);
      }
    }

    if (matched === undefined) {
      listShapeChanged = true;
      appendSuffix ??= { fiber, index };
    }

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    if (fiber.hasRefSubtree) {
      hasRefSubtree = true;
    }
    if (fiber.hasDisposableResources) {
      hasDisposableResources = true;
    }
    subtreeFlags |= fiber.flags | fiber.subtreeFlags;
    subtreeChildListChanged =
      subtreeChildListChanged || fiber.childListChanged || fiber.subtreeChildListChanged;
    if (
      fiber.tag === "memo" &&
      (fiber.stateNode === undefined || typeof fiber.stateNode === "number")
    ) {
      fiber.stateNode = index;
    }
    if (hasHostCommitWork(fiber)) {
      (dirtyChildren ??= []).push(fiber);
    }
    previous = fiber;
  }

  if (currentKeyed !== undefined) {
    if (removedFiber !== undefined || currentKeyed.sibling !== undefined) {
      return undefined;
    }
    removedFiber = currentKeyed;
    listShapeChanged = true;
  }

  parent.hasRefSubtree = hasRefSubtree;
  parent.hasDisposableResources = hasDisposableResources;
  parent.subtreeFlags = subtreeFlags;
  parent.subtreeChildListChanged = subtreeChildListChanged;
  parent.childListChanged = listShapeChanged;
  if (appendSuffix !== undefined && canStoreAppendSuffixCommitHint(parent)) {
    parent.memoizedState = appendSuffix;
  }
  if (removedFiber !== undefined) {
    parent.deletions = [removedFiber];
    markOptimizedChildForDeletion(parent, removedFiber);
  }
  recordDirtyChildCommitHints(parent, dirtyChildren);
  return { fiber: first, consumed: 0 };
}

function hasSameAppendOrSingleDeleteKeyOrder(
  currentFirstChild: Fiber,
  children: readonly ReactCompatNode[],
  expectedType: ReactCompatElement["type"],
): boolean {
  let current: Fiber | undefined = currentFirstChild;
  let skippedDeletion = false;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!isSameKeyedMemoRowCandidate(child, expectedType)) {
      return false;
    }

    const key = (child as ReactCompatElement).key;

    if (current === undefined) {
      return true;
    }

    if (current.key === key) {
      current = current.sibling;
      continue;
    }

    const sibling = current.sibling;
    if (
      !skippedDeletion &&
      sibling !== undefined &&
      sibling.key === key &&
      canSkipSingleDeletedKeyedFiber(children, index, sibling)
    ) {
      skippedDeletion = true;
      current = sibling.sibling;
      continue;
    }

    return false;
  }

  return current === undefined || (!skippedDeletion && current.sibling === undefined);
}

function isSameKeyedMemoRowCandidate(
  node: ReactCompatNode,
  expectedType: ReactCompatElement["type"],
): boolean {
  return (
    isReactCompatElement(node) &&
    node.key !== null &&
    node.ref === null &&
    node.type === expectedType
  );
}

function canReuseDependencyFreeMemoAtKey(
  current: Fiber | undefined,
  node: ReactCompatElement,
  key: string,
): boolean {
  return (
    current !== undefined &&
    current.key === key &&
    current.tag === "memo" &&
    current.type === node.type &&
    current.hasRefSubtree !== true &&
    current.hasDisposableResources !== true &&
    current.hydrateExisting !== true &&
    isMemoType(node.type)
  );
}

function tryReuseDependencyFreeMemoRemovalSuffix(
  parent: Fiber,
  children: readonly ReactCompatNode[],
  startIndex: number,
  removed: Fiber,
  matchedCurrent: Fiber,
  runtime: RootRuntime | undefined,
  options: FiberHydrationOptions,
  prefixFirst: Fiber | undefined,
  prefixPrevious: Fiber | undefined,
  consumed: number,
): FiberReconcileResult | undefined {
  if (runtime === undefined || options.previousNodes !== undefined || removed.hasRefSubtree) {
    return undefined;
  }

  const suffix: Fiber[] = [];
  let current: Fiber | undefined = matchedCurrent;

  for (let index = startIndex; index < children.length; index += 1) {
    const child = children[index];
    const key = getNodeKey(child);

    if (key === undefined || !isReactCompatElement(child) || !isMemoType(child.type)) {
      return undefined;
    }

    if (!canReuseDependencyFreeMemoAtKey(current, child, key)) {
      return undefined;
    }

    if (current === undefined) {
      return undefined;
    }

    const matched: Fiber = current;
    const fiber = reuseDependencyFreeMemoFiber(matched, child);

    if (fiber === undefined) {
      return undefined;
    }

    suffix.push(fiber);
    current = matched.sibling;
  }

  if (current !== undefined) {
    return undefined;
  }

  let first = prefixFirst;
  let previous = prefixPrevious;

  for (const fiber of suffix) {
    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    previous = fiber;
  }

  parent.childListChanged = true;
  parent.deletions = [removed];
  markOptimizedChildForDeletion(parent, removed);
  return { fiber: first, consumed };
}

function reuseDependencyFreeMemoFiber(current: Fiber, node: ReactCompatElement): Fiber | undefined {
  if (!isMemoType(node.type)) {
    return undefined;
  }

  const previousMemoState = current.memoizedState as MemoFiberState | undefined;

  if (
    previousMemoState === undefined ||
    previousMemoState.hasDirtyInstanceDependencies !== false ||
    previousMemoState.hasUnflushedEffectDependencies !== false ||
    previousMemoState.hasRetainedInstanceDependencies !== false ||
    !areMemoPropsEqual(node.type, previousMemoState.props, node.props)
  ) {
    return undefined;
  }

  current.pendingProps = node.props;
  current.flags = NoFlags;
  current.subtreeFlags = NoFlags;
  current.childListChanged = false;
  current.subtreeChildListChanged = false;
  current.hostChildListChanged = false;
  current.type = node.type;
  current.child = getSkippedChild(current);
  current.memoizedState = previousMemoState;
  return current;
}

function canStoreAppendSuffixCommitHint(parent: Fiber): boolean {
  return parent.tag === "fragment" || parent.tag === "host-component" || parent.tag === "host-root";
}

function markOptimizedChildForDeletion(parent: Fiber, _child: Fiber): void {
  parent.flags |= ChildDeletion;
}

function markOptimizedChildrenForDeletion(parent: Fiber, _firstChild: Fiber): void {
  parent.flags |= ChildDeletion;
}

function markUnusedCurrentChildrenForDeletion(
  parent: Fiber,
  firstChild: Fiber | undefined,
  used: ReadonlySet<Fiber> | undefined,
): void {
  if (firstChild === undefined || used === undefined) {
    return;
  }

  let cursor: Fiber | undefined = firstChild;

  while (cursor !== undefined) {
    if (!used.has(cursor)) {
      parent.flags |= ChildDeletion;
      return;
    }
    cursor = cursor.sibling;
  }
}

function hasSameKeyOrderPrefix(
  currentFirstChild: Fiber,
  children: readonly ReactCompatNode[],
): boolean {
  let current: Fiber | undefined = currentFirstChild;

  for (let index = 0; index < children.length; index += 1) {
    if (current === undefined) {
      return true;
    }

    if (current.key !== getNodeKey(children[index])) {
      return false;
    }

    current = current.sibling;
  }

  return current === undefined;
}

function getReusableKeyedRowHostFiber(current: Fiber, row: KeyedRowHostElement): Fiber | undefined {
  if (
    current.tag !== "host-component" ||
    current.type !== row.type ||
    current.hydrateExisting ||
    current.child !== undefined ||
    !isHostElement(current.stateNode)
  ) {
    return undefined;
  }

  const previousProps = current.memoizedProps ?? current.pendingProps;

  if (typeof previousProps !== "object" || previousProps === null) {
    return undefined;
  }

  const previousRecord = previousProps as Record<string, unknown>;

  if (
    getDirectHostTextChild(previousRecord.children) !== row.text ||
    !hostOwnPropsEqual(previousRecord, row.element.props)
  ) {
    return undefined;
  }

  current.pendingProps = row.element.props;
  current.flags = NoFlags;
  current.subtreeFlags = NoFlags;
  current.childListChanged = false;
  current.subtreeChildListChanged = false;
  current.hostChildListChanged = false;
  current.hasRefSubtree = false;
  current.hasDisposableResources = false;
  return current;
}

interface KeyedRowHostElement {
  element: ReactCompatElement;
  key: string;
  type: string;
  text: string;
}

function createKeyedRowHostElementScratch(): KeyedRowHostElement {
  return {
    element: undefined as unknown as ReactCompatElement,
    key: "",
    type: "",
    text: "",
  };
}

function isKeyedRowHostElementCandidate(node: ReactCompatNode): boolean {
  return (
    isReactCompatElement(node) &&
    typeof node.type === "string" &&
    node.key !== null &&
    node.ref === null
  );
}

function readKeyedRowHostElement(node: ReactCompatNode, row: KeyedRowHostElement): boolean {
  if (
    !isReactCompatElement(node) ||
    typeof node.type !== "string" ||
    node.key === null ||
    node.ref !== null
  ) {
    return false;
  }

  // Any keyed host row whose children collapse to a single text value
  // qualifies; row props are compared per reuse with hostOwnPropsEqual.
  const text = getDirectHostTextChild((node.props as Record<string, unknown>).children);

  if (text === undefined) {
    return false;
  }

  row.element = node;
  row.key = node.key;
  row.type = node.type;
  row.text = text;
  return true;
}

function createKeyedRowHostFiber(
  parent: Fiber,
  current: Fiber | undefined,
  row: KeyedRowHostElement,
  options: FiberHydrationOptions,
): Fiber {
  const node = row.element;
  const elementNamespace = namespaceForHostElement(options.namespace ?? "html", row.type);
  const fiber =
    current?.tag === "host-component" && current.type === row.type
      ? createWorkInProgress(current, node.props)
      : createFiber("host-component", node.props, row.key);

  fiber.type = row.type;
  fiber.stateNode =
    current?.tag === "host-component" &&
    current.type === row.type &&
    isHostElement(current.stateNode) &&
    hostElementMatches(current.stateNode, row.type, elementNamespace)
      ? current.stateNode
      : createHostElement(getDocumentRef(options), row.type, options.namespace ?? "html");
  fiber.child = undefined;
  fiber.pendingProps = node.props;
  fiber.hostChildListChanged = false;
  fiber.hasRefSubtree = false;
  fiber.hasDisposableResources = false;

  if (current === undefined || fiber.alternate !== current) {
    fiber.flags |= Placement;
    fiber.hostChildListChanged = true;
    return fiber;
  }

  const previousProps = current.memoizedProps ?? current.pendingProps;
  const previousText = getDirectHostTextChild(hostFiberChildrenProp(previousProps));

  if (previousText !== row.text || !hostOwnPropsEqual(previousProps, row.element.props)) {
    fiber.flags |= Update;
  }

  return fiber;
}

function canReuseStaticHostSubtree(fiber: Fiber | undefined): boolean {
  let cursor = fiber;

  while (cursor !== undefined) {
    if (
      cursor.tag !== "host-component" &&
      cursor.tag !== "host-text" &&
      cursor.tag !== "fragment" &&
      cursor.tag !== "strict-mode"
    ) {
      return false;
    }

    if (cursor.child !== undefined && !canReuseStaticHostSubtree(cursor.child)) {
      return false;
    }

    cursor = cursor.sibling;
  }

  return true;
}

function canSkipSingleDeletedKeyedFiber(
  children: readonly ReactCompatNode[],
  index: number,
  matched: Fiber,
): boolean {
  const nextKey = index + 1 < children.length ? getNodeKey(children[index + 1]) : undefined;
  const afterMatched = matched.sibling;

  return nextKey === undefined ? afterMatched === undefined : afterMatched?.key === nextKey;
}

function canSkipRemainingKeyedLookup(
  current: Fiber | undefined,
  children: readonly ReactCompatNode[],
  startIndex: number,
): boolean {
  const currentRange = readContiguousNumericFiberKeyRange(current);

  if (currentRange === undefined) {
    return false;
  }

  const nextRange = readContiguousNumericNodeKeyRange(children, startIndex);

  if (nextRange === undefined) {
    return false;
  }

  return currentRange.end < nextRange.start || nextRange.end < currentRange.start;
}

function readContiguousNumericFiberKeyRange(
  fiber: Fiber | undefined,
): { start: number; end: number } | undefined {
  let cursor = fiber;
  let start: number | undefined;
  let previous: number | undefined;

  while (cursor !== undefined) {
    const value = parseNumericKey(cursor.key);

    if (value === undefined || (previous !== undefined && value !== previous + 1)) {
      return undefined;
    }

    start ??= value;
    previous = value;
    cursor = cursor.sibling;
  }

  return start === undefined || previous === undefined ? undefined : { start, end: previous };
}

function readContiguousNumericNodeKeyRange(
  children: readonly ReactCompatNode[],
  startIndex: number,
): { start: number; end: number } | undefined {
  let start: number | undefined;
  let previous: number | undefined;

  for (let index = startIndex; index < children.length; index += 1) {
    const value = parseNumericKey(getNodeKey(children[index]));

    if (value === undefined || (previous !== undefined && value !== previous + 1)) {
      return undefined;
    }

    start ??= value;
    previous = value;
  }

  return start === undefined || previous === undefined ? undefined : { start, end: previous };
}

function parseNumericKey(key: string | undefined): number | undefined {
  if (key === undefined || key.length === 0) {
    return undefined;
  }

  const value = Number(key);

  return Number.isSafeInteger(value) && String(value) === key ? value : undefined;
}

function childFiberListShapeChanged(current: Fiber | undefined, next: Fiber | undefined): boolean {
  let currentCursor = current;
  let nextCursor = next;

  while (currentCursor !== undefined && nextCursor !== undefined) {
    const isSameSlot = nextCursor === currentCursor || nextCursor.alternate === currentCursor;

    if (
      !isSameSlot ||
      currentCursor.tag !== nextCursor.tag ||
      currentCursor.type !== nextCursor.type ||
      currentCursor.key !== nextCursor.key
    ) {
      return true;
    }

    currentCursor = currentCursor.sibling;
    nextCursor = nextCursor.sibling;
  }

  return currentCursor !== undefined || nextCursor !== undefined;
}

function bubbleHostChild(parent: Fiber, child: Fiber): void {
  if (child.hasRefSubtree) {
    parent.hasRefSubtree = true;
  }
  if (child.hasDisposableResources) {
    parent.hasDisposableResources = true;
  }
  parent.subtreeFlags |= child.flags | child.subtreeFlags;
  parent.subtreeChildListChanged =
    parent.subtreeChildListChanged || child.childListChanged || child.subtreeChildListChanged;
}

function recordDirtyChildCommitHints(parent: Fiber, dirtyChildren: Fiber[] | undefined): void {
  if (parent.childListChanged || dirtyChildren === undefined || dirtyChildren.length === 0) {
    return;
  }

  // Reuse the effect-list slot only when there are no child-list deletions.
  parent.deletions = dirtyChildren;
}

function resetFiberRefSubtree(fiber: Fiber): void {
  fiber.hasRefSubtree = false;
  fiber.hasDisposableResources = false;
}

function includeNodeRef(fiber: Fiber, node: ReactCompatNode): void {
  fiber.hasRefSubtree = fiber.hasRefSubtree || (isReactCompatElement(node) && node.ref !== null);
}

function markHostFiberEffects(
  fiber: Fiber,
  current: Fiber | undefined,
  node: ReactCompatNode,
): void {
  if (current === undefined || fiber.alternate !== current) {
    fiber.flags |= Placement;
    fiber.hostChildListChanged = true;
    return;
  }

  if (fiber.tag === "host-text") {
    if (!Object.is(current.memoizedProps ?? current.pendingProps, fiber.pendingProps)) {
      fiber.flags |= Update;
    }
    return;
  }

  if (fiber.tag !== "host-component") {
    return;
  }

  const previousProps = current.memoizedProps ?? current.pendingProps;
  const nextProps = fiber.pendingProps as Record<string, unknown>;

  fiber.hostChildListChanged = hostChildListChanged(previousProps, nextProps);

  if (
    !hostOwnPropsEqual(previousProps, nextProps) ||
    hostDirectTextChildChanged(previousProps, nextProps)
  ) {
    fiber.flags |= Update;
  }

  if (isReactCompatElement(node) && node.ref !== null) {
    fiber.flags |= Update;
  }
}

function createHostFiber(
  parent: Fiber,
  current: Fiber | undefined,
  node: ReactCompatNode,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
  canReuseCurrentFiber = true,
): FiberReconcileResult {
  const result = createHostFiberImpl(
    parent,
    current,
    node,
    key,
    runtime,
    path,
    options,
    canReuseCurrentFiber,
  );

  if (result.fiber !== undefined) {
    if (canFinalizeNewHostFiber(result.fiber, current, node, options)) {
      result.fiber.flags |= Placement;
      result.fiber.hostChildListChanged = true;
      return result;
    }

    result.fiber.pendingProps = getPendingProps(node);
    includeNodeRef(result.fiber, node);
    markHostFiberEffects(result.fiber, current, node);
  }

  return result;
}

function canFinalizeNewHostFiber(
  fiber: Fiber,
  current: Fiber | undefined,
  node: ReactCompatNode,
  options: FiberHydrationOptions,
): boolean {
  return (
    current === undefined &&
    options.previousNodes === undefined &&
    fiber.tag === "host-component" &&
    isReactCompatElement(node) &&
    node.ref === null &&
    typeof node.type === "string"
  );
}

function createHostFiberImpl(
  parent: Fiber,
  current: Fiber | undefined,
  node: ReactCompatNode,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
  canReuseCurrentFiber = true,
): FiberReconcileResult {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { fiber: undefined, consumed: 0 };
  }

  if (node === "") {
    return { fiber: undefined, consumed: 0 };
  }

  if (typeof node === "string" || typeof node === "number") {
    const textHydration = findHydrationTextNode(options.previousNodes);
    const existing = textHydration.node;
    const fiber =
      current?.tag === "host-text"
        ? createWorkInProgress(current, String(node))
        : createFiber("host-text", String(node), key);
    if (existing === undefined && options.previousNodes !== undefined) {
      reportMissingHydrationNode(options, path);
    } else if (existing !== undefined && !(existing instanceof Text)) {
      reportHydrationNodeTypeMismatch(options, path, "text", existing);
    }
    fiber.stateNode =
      existing instanceof Text
        ? existing
        : current?.tag === "host-text" && current.stateNode instanceof Text
          ? current.stateNode
          : createHostTextNode(getDocumentRef(options));

    if (existing instanceof Text && existing.data !== String(node)) {
      reportRecoverable(options, "text", path, new Error("Hydration text mismatch."));
    }

    return { fiber, consumed: existing instanceof Text ? textHydration.consumed : 0 };
  }

  if (Array.isArray(node)) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node)
        : createFiber("fragment", node, key);
    const childResult = reconcileHostChild(fiber, current?.child, node, runtime, path, options);
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  const memoBailout = tryReuseMemoBailout(
    current,
    node,
    runtime,
    path,
    options,
    canReuseCurrentFiber,
  );
  if (memoBailout !== undefined) {
    return memoBailout;
  }

  if (!isReactCompatElement(node)) {
    if (isReactCompatPortal(node)) {
      return createPortalFiber(parent, current, node, key, runtime, path, options);
    }

    return { fiber: undefined, consumed: 0 };
  }

  // Host elements (string type) are by far the most common node. Dispatch them
  // before the component-type checks below, none of which a string can match,
  // so each reconciled host element skips ~12 type comparisons / probes.
  if (typeof node.type === "string") {
    return createHostComponentFiber(parent, current, node, key, runtime, path, options);
  }

  if (node.type === Fragment) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node.props.children)
        : createFiber("fragment", node.props.children, key);
    const childResult = reconcileHostChild(
      fiber,
      current?.child,
      node.props.children as ReactCompatNode,
      runtime,
      `${path}.f`,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (node.type === Activity) {
    const children =
      (node.props as { mode?: unknown }).mode === "hidden" ? null : node.props.children;
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, children)
        : createFiber("fragment", children, key);
    fiber.type = node.type;
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "fragment" ? current.child : undefined,
      children as ReactCompatNode,
      runtime,
      `${path}.activity`,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (node.type === Profiler) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const fiber =
      current?.tag === "profiler" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("profiler", node.props, key);
    fiber.type = node.type;
    const profilerPath = `${path}.profiler`;
    const childResult = renderWithProfiler(
      runtime,
      getRuntimePath(profilerPath, options),
      node.props,
      () =>
        reconcileHostChild(
          fiber,
          current?.tag === "profiler" ? current.child : undefined,
          node.props.children as ReactCompatNode,
          runtime,
          profilerPath,
          options,
        ),
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (node.type === STRICT_MODE_TYPE) {
    return createStrictModeFiber(current, node, key, runtime, path, options);
  }

  if (node.type === Suspense) {
    return createSuspenseFiber(current, node, key, runtime, path, options);
  }

  if (node.type === SuspenseList) {
    return createSuspenseListFiber(current, node, key, runtime, path, options);
  }

  if (node.type === ERROR_BOUNDARY_TYPE) {
    const fiber =
      current?.tag === "error-boundary"
        ? createWorkInProgress(current, node.props)
        : createFiber("error-boundary", node.props, key);
    fiber.type = node.type;

    try {
      const childResult = reconcileHostChild(
        fiber,
        current?.tag === "error-boundary" ? current.child : undefined,
        node.props.children as ReactCompatNode,
        runtime,
        `${path}.eb`,
        options,
      );
      fiber.child = childResult.fiber;
    } catch (error) {
      if (isThenable(error)) {
        throw error;
      }

      const normalizedError = error instanceof Error ? error : new Error(String(error));
      const onError = node.props.onError;

      if (typeof onError === "function") {
        (onError as (error: Error) => void)(normalizedError);
      }

      const fallback = node.props.fallback;
      const fallbackNode =
        typeof fallback === "function"
          ? (fallback as (error: Error) => ReactCompatNode)(normalizedError)
          : null;
      const fallbackResult = reconcileHostChild(
        fiber,
        current?.tag === "error-boundary" ? current.child : undefined,
        fallbackNode,
        runtime,
        `${path}.eb.fallback`,
        options,
      );
      fiber.child = fallbackResult.fiber;
    }
    return { fiber, consumed: options.previousNodes?.length ?? 0 };
  }

  if (node.type === REACTIVE_DOM_BLOCK_TYPE) {
    const blockProps = (node.props as unknown as ReactiveDomBlockProps).blockProps;
    if (current?.tag === "reactive-dom-block") {
      // Re-render: reuse the committed DOM/subscriptions and push the new props
      // into the prop cell instead of re-running render(). Bound text/attributes
      // update via their reactive subscriptions; the subtree is never reconciled.
      const fiber = createWorkInProgress(current, node.props);
      fiber.type = node.type;
      fiber.hasDisposableResources = true;
      const previousState = current.stateNode as ReactiveDomBlockState | undefined;
      if (previousState?.propCell !== undefined && blockProps !== undefined) {
        setReactivePropCell(previousState.propCell, blockProps);
      }
      fiber.stateNode = previousState;
      return { fiber, consumed: consumeReactiveDomBlockHydrationNode(options.previousNodes) };
    }

    const fiber = createFiber("reactive-dom-block", node.props, key);
    fiber.type = node.type;
    fiber.hasDisposableResources = true;
    const render = (node.props as unknown as ReactiveDomBlockProps).render;
    if (blockProps !== undefined) {
      const propCell = createReactivePropCell(blockProps);
      const result = render(createReactivePropProxy(propCell));
      fiber.stateNode = { node: result.node, dispose: result.dispose, propCell };
    } else {
      fiber.stateNode = (render as () => ReactiveDomBlockResult)();
    }
    return { fiber, consumed: consumeReactiveDomBlockHydrationNode(options.previousNodes) };
  }

  if (isReactCompatProvider(node.type)) {
    const fiber =
      current?.tag === "context-provider" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("context-provider", node.props, key);
    fiber.type = node.type;
    const childResult = renderWithContextProvider(node.type, node.props.value, () =>
      reconcileHostChild(
        fiber,
        current?.tag === "context-provider" ? current.child : undefined,
        node.props.children as ReactCompatNode,
        runtime,
        `${path}.provider`,
        options,
      ),
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (isReactCompatConsumer(node.type)) {
    const fiber =
      current?.tag === "context-consumer" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("context-consumer", node.props, key);
    fiber.type = node.type;
    const children = node.props.children;
    const render =
      typeof children === "function"
        ? (children as (value: unknown) => ReactCompatNode)
        : () => null;
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "context-consumer" ? current.child : undefined,
      render(useContext(consumerContext(node.type))),
      runtime,
      `${path}.consumer`,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (isForwardRefType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const forwardRefType = node.type;
    const fiber =
      current?.tag === "forward-ref" && current.type === forwardRefType
        ? createWorkInProgress(current, node.props)
        : createFiber("forward-ref", node.props, key);
    fiber.type = forwardRefType;
    const runtimePath = getRuntimePath(path, options);
    const rendered = renderWithRootRuntime(
      runtime,
      runtimePath,
      () => forwardRefType.render(node.props, node.ref),
      forwardRefType,
    );
    fiber.memoizedState = getDevToolsHookState(runtime, runtimePath);
    const childOptions = getHydrationChildOptions(options, forwardRefType.render);
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "forward-ref" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.forwardRef`,
      childOptions,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (isMemoType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const memoType = node.type;
    const memoPath = `${path}.memo`;
    const memoRuntimePath = getRuntimePath(memoPath, options);
    const previousMemoFiber =
      current?.tag === "memo" && current.type === memoType ? current : undefined;
    const initialStaticBlockMemoFiber =
      previousMemoFiber === undefined
        ? tryCreateInitialStaticBlockMemoFiber(node, key, memoType, runtime, memoPath, options)
        : undefined;

    if (initialStaticBlockMemoFiber !== undefined) {
      return initialStaticBlockMemoFiber;
    }

    const previousMemoState =
      previousMemoFiber !== undefined
        ? (previousMemoFiber.memoizedState as MemoFiberState | undefined)
        : undefined;

    if (
      previousMemoFiber !== undefined &&
      previousMemoState !== undefined &&
      !(
        memoStateNeedsDirtyInstanceCheck(previousMemoState) &&
        hasDirtyInstance(runtime, previousMemoState.instanceKeys, memoRuntimePath)
      ) &&
      !(
        memoStateNeedsEffectCheck(previousMemoState) &&
        hasUnflushedMountEffectInstance(runtime, previousMemoState.instanceKeys)
      ) &&
      areMemoPropsEqual(memoType, previousMemoState.props, node.props)
    ) {
      const fiber = getMemoBailoutFiber(
        runtime,
        previousMemoFiber,
        node.props,
        previousMemoState,
        canReuseCurrentFiber,
      );
      fiber.child = getSkippedChild(previousMemoFiber);
      fiber.memoizedState = previousMemoState;
      return {
        fiber,
        consumed: options.previousNodes?.length ?? 0,
      };
    }

    const fiber =
      previousMemoFiber !== undefined
        ? createWorkInProgress(previousMemoFiber, node.props)
        : createFiber("memo", node.props, key);
    fiber.type = memoType;

    const renderedElement: ReactCompatElement = {
      $$typeof: node.$$typeof,
      type: memoType.type,
      key: node.key,
      ref: node.ref,
      props: node.props,
    };
    const childResult = createHostFiber(
      fiber,
      current?.tag === "memo" ? current.child : undefined,
      renderedElement,
      key,
      runtime,
      memoPath,
      options,
    );
    fiber.child = childResult.fiber;
    if (fiber.child !== undefined) {
      fiber.child.return = fiber;
      fiber.child.sibling = undefined;
      bubbleHostChild(fiber, fiber.child);
    }
    const instanceKeys = collectMemoInstanceKeys(runtime, memoRuntimePath);
    const hasClassDescendant = hasClassComponentDescendant(fiber.child);
    fiber.memoizedState = {
      props: node.props as Record<string, unknown>,
      instanceKeys,
      hasDirtyInstanceDependencies:
        hasDirtyInstanceDependencies(runtime, instanceKeys) || hasClassDescendant,
      hasUnflushedEffectDependencies: hasUnflushedEffectDependencies(runtime, instanceKeys),
      hasRetainedInstanceDependencies:
        hasRetainedInstanceDependencies(runtime, instanceKeys) || hasClassDescendant,
    };
    return { fiber, consumed: childResult.consumed };
  }

  if (isLazyType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const lazyType = node.type;
    const fiber =
      current?.tag === "lazy" && current.type === lazyType
        ? createWorkInProgress(current, node.props)
        : createFiber("lazy", node.props, key);
    fiber.type = lazyType;

    if (lazyType.status === "resolved" && lazyType.resolved !== undefined) {
      const renderedElement: ReactCompatElement = {
        $$typeof: node.$$typeof,
        type: lazyType.resolved,
        key: node.key,
        ref: node.ref,
        props: node.props,
      };
      const childResult = createHostFiber(
        fiber,
        current?.tag === "lazy" ? current.child : undefined,
        renderedElement,
        key,
        runtime,
        `${path}.lazy`,
        options,
      );
      fiber.child = childResult.fiber;
      if (fiber.child !== undefined) {
        fiber.child.return = fiber;
        fiber.child.sibling = undefined;
        bubbleHostChild(fiber, fiber.child);
      }
      return { fiber, consumed: childResult.consumed };
    }

    if (lazyType.status === "rejected") {
      throw lazyType.error;
    }

    if (lazyType.status === "uninitialized") {
      lazyType.status = "pending";
      lazyType.promise = lazyType
        .load()
        .then((module) => {
          lazyType.status = "resolved";
          lazyType.resolved = module.default;
          runtime.rerender();
        })
        .catch((error: unknown) => {
          lazyType.status = "rejected";
          lazyType.error = error;
          runtime.rerender();
        });
    }

    if (suspensePrimaryRenderDepth > 0) {
      throw lazyType.promise;
    }

    fiber.child = undefined;
    return { fiber, consumed: 0 };
  }

  if (isClassComponentType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const classType = node.type;
    const runtimePath = getRuntimePath(path, options);
    const classRuntimePath = `${runtimePath}.class`;
    const fiber =
      current?.tag === "class-component" && current.type === classType
        ? createWorkInProgress(current, node.props)
        : createFiber("class-component", node.props, key);
    fiber.type = classType;
    const previousClassChildKeys = collectInstanceKeys(runtime, classRuntimePath);
    const currentClassInstance =
      current?.tag === "class-component" && current.type === classType
        ? (current.stateNode as ClassComponentInstance)
        : undefined;
    const hasCurrentClassFiber = current?.tag === "class-component" && current.type === classType;
    const rendered = renderClassComponentWithRuntime(classType, node.props, runtime, runtimePath, {
      ...(currentClassInstance === undefined ? {} : { currentInstance: currentClassInstance }),
      hasDirtyDescendant: hasDirtyInstance(runtime, previousClassChildKeys, classRuntimePath),
      allowSkip: hasCurrentClassFiber,
    });
    applyRef(node.ref, rendered.kind === "skip" ? current?.stateNode : rendered.instance);

    if (rendered.kind === "skip") {
      fiber.child = getSkippedChild(current);
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const childOptions = getHydrationChildOptions(options, classType);

    try {
      const childResult = reconcileHostChild(
        fiber,
        current?.tag === "class-component" ? current.child : undefined,
        rendered.node,
        runtime,
        `${path}.class`,
        childOptions,
      );
      fiber.child = childResult.fiber;
      fiber.stateNode = rendered.instance;
    } catch (error) {
      const fallbackNode = recoverClassComponentError(rendered.type, rendered.instance, error);

      if (fallbackNode === undefined) {
        throw error;
      }

      const fallbackResult = reconcileHostChild(
        fiber,
        current?.tag === "class-component" ? current.child : undefined,
        fallbackNode,
        runtime,
        `${path}.class.fallback`,
        childOptions,
      );
      fiber.child = fallbackResult.fiber;
    }
    return { fiber, consumed: options.previousNodes?.length ?? 0 };
  }

  if (isFunctionComponentType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const previousFunctionState =
      current?.tag === "function-component"
        ? (current.stateNode as FunctionFiberState | undefined)
        : undefined;
    const fiber =
      current?.tag === "function-component" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("function-component", node.props, key);
    fiber.type = node.type;
    const runtimePath = getRuntimePath(path, options);

    const canReuseSameElement =
      previousFunctionState !== undefined &&
      previousFunctionState.hasContextDependencies !== true &&
      previousFunctionState.element === node;
    const canReuseExternalStoreSnapshot =
      previousFunctionState !== undefined &&
      runtime.externalStoreUpdate &&
      shallowEqual(previousFunctionState.props, node.props) &&
      !hasChangedContextDependency(runtime, previousFunctionState.instanceKeys);

    if (
      runtime.strictReplayDepth === 0 &&
      previousFunctionState !== undefined &&
      (canReuseSameElement || canReuseExternalStoreSnapshot) &&
      !hasDirtyInstance(runtime, previousFunctionState.instanceKeys, runtimePath) &&
      !hasUnflushedMountEffectInstance(runtime, previousFunctionState.instanceKeys) &&
      !hasPendingAsyncChild(current?.child)
    ) {
      markActiveInstanceKeys(runtime, previousFunctionState.instanceKeys);
      fiber.child = getSkippedChild(current);
      fiber.memoizedState = current?.memoizedState;
      fiber.stateNode = previousFunctionState;
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const rendered = renderWithRootRuntime(
      runtime,
      runtimePath,
      () => (node.type as (props: Record<string, unknown>) => ReactCompatNode)(node.props),
      node.type,
    );
    fiber.memoizedState = getDevToolsHookState(runtime, runtimePath);
    const childOptions = getHydrationChildOptions(options, node.type as Function);
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "function-component" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.0`,
      childOptions,
    );
    fiber.child = childResult.fiber;
    const instanceKeys = collectInstanceKeys(runtime, runtimePath);
    fiber.stateNode = {
      element: node,
      props: node.props as Record<string, unknown>,
      instanceKeys,
      hasContextDependencies: hasContextDependency(runtime, instanceKeys),
    } satisfies FunctionFiberState;
    return { fiber, consumed: childResult.consumed };
  }

  return { fiber: undefined, consumed: 0 };
}

function findHydrationTextNode(previousNodes: readonly Node[] | undefined): {
  node: Node | undefined;
  consumed: number;
} {
  const first = previousNodes?.[0];
  if (first instanceof Comment && first.data === " " && previousNodes?.[1] instanceof Text) {
    return { node: previousNodes[1], consumed: 2 };
  }

  return { node: first, consumed: first instanceof Text ? 1 : 0 };
}

// The host-component reconcile, split out of createHostFiberImpl so host
// elements can be dispatched before the component-type checks. Only called with
// a string element type.
function createHostComponentFiber(
  parent: Fiber,
  current: Fiber | undefined,
  node: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions,
): FiberReconcileResult {
  if (typeof node.type !== "string") {
    return { fiber: undefined, consumed: 0 };
  }

  const initialHostOnlyFiber = tryCreateInitialHostOnlyFiber(current, node, key, options);
  if (initialHostOnlyFiber !== undefined) {
    return { fiber: initialHostOnlyFiber, consumed: 0 };
  }

  const elementNamespace = namespaceForHostElement(options.namespace ?? "html", node.type);
  const childNamespace = namespaceForHostChildren(elementNamespace, node.type);
  const reusableCurrent =
    current?.tag === "host-component" && current.type === node.type ? current : undefined;
  const fiber =
    reusableCurrent !== undefined
      ? createWorkInProgress(reusableCurrent, node.props)
      : createFiber("host-component", node.props, key);
  // The hydration node bookkeeping only matters when hydrating. Skipping it for
  // the common (non-hydration) render avoids an isHostElement(undefined) probe
  // and the mismatch checks on every reconciled element.
  const existing = options.previousNodes?.[0];
  let existingElement: HostElement | undefined;
  let tagMatches = false;
  if (options.previousNodes !== undefined) {
    existingElement = isHostElement(existing) ? existing : undefined;
    tagMatches =
      existingElement !== undefined &&
      hostElementMatches(existingElement, node.type, elementNamespace);

    if (existing === undefined) {
      reportMissingHydrationNode(options, path);
    } else if (!isHostElement(existing)) {
      reportHydrationNodeTypeMismatch(options, path, `<${node.type}>`, existing);
    }

    if (existingElement !== undefined && !tagMatches) {
      reportRecoverable(
        options,
        "tag",
        path,
        new Error(
          `Hydration tag mismatch: expected <${node.type}> but found <${existingElement.tagName.toLowerCase()}>.`,
        ),
      );
      reportElementTextMismatch(options, `${path}.c`, existingElement, node.props.children);
    }
  }

  fiber.type = node.type;
  // When reusing a same-type current fiber, its stateNode was created for this
  // exact tag and namespace (same tree position), so the hostElementMatches
  // re-check (localName + namespaceURI reads) is redundant.
  fiber.stateNode = tagMatches
    ? existingElement
    : reusableCurrent !== undefined && isHostElement(reusableCurrent.stateNode)
      ? reusableCurrent.stateNode
      : createHostElement(getDocumentRef(options), node.type, options.namespace ?? "html");
  fiber.hydrateExisting = tagMatches;
  const previousChildNodes =
    tagMatches && existingElement !== undefined
      ? Array.from((existingElement as Element).childNodes)
      : undefined;
  if (hasDangerouslySetInnerHtmlProp(node.props)) {
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "host-component" ? current.child : undefined,
      null,
      runtime,
      `${path}.c`,
      getHostChildFiberOptions(options, childNamespace, previousChildNodes),
    );
    fiber.child = childResult.fiber;
    parent.child ??= fiber;
    return { fiber, consumed: existing === undefined ? 0 : 1 };
  }
  const directTextChild =
    shouldUseDirectHostTextChild() && previousChildNodes === undefined
      ? getDirectHostTextChild(node.props.children)
      : undefined;
  if (
    previousChildNodes === undefined &&
    current?.tag === "host-component" &&
    current.type === node.type &&
    Object.is(hostFiberChildrenProp(current.memoizedProps), node.props.children) &&
    !hasDirtyInstance(runtime, [], getRuntimePath(`${path}.c`, options)) &&
    canReuseStaticHostSubtree(current.child)
  ) {
    fiber.child = current.child;
    if (fiber.child !== undefined) {
      fiber.child.return = fiber;
    }
    parent.child ??= fiber;
    return { fiber, consumed: existing === undefined ? 0 : 1 };
  }

  if (directTextChild !== undefined) {
    fiber.child = undefined;
    parent.child ??= fiber;
    return { fiber, consumed: existing === undefined ? 0 : 1 };
  }

  const childResult = reconcileHostChild(
    fiber,
    current?.tag === "host-component" ? current.child : undefined,
    node.props.children as ReactCompatNode,
    runtime,
    `${path}.c`,
    getHostChildFiberOptions(options, childNamespace, previousChildNodes),
  );
  fiber.child = childResult.fiber;
  if (
    previousChildNodes !== undefined &&
    !hasTextAreaValueProp(node.type, node.props)
  ) {
    reportExtraHydrationNodes(options, `${path}.c`, previousChildNodes, childResult.consumed);
  }
  parent.child ??= fiber;
  return { fiber, consumed: existing === undefined ? 0 : 1 };
}

function isFunctionComponentType(
  value: unknown,
): value is (props: Record<string, unknown>) => ReactCompatNode {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render !== "function"
  );
}

function tryCreateInitialHostOnlyFiber(
  current: Fiber | undefined,
  node: ReactCompatElement,
  key: string | undefined,
  options: FiberHydrationOptions,
): Fiber | undefined {
  if (
    current !== undefined ||
    options.previousNodes !== undefined ||
    typeof node.type !== "string" ||
    !canCreateInitialHostOnlyNode(node)
  ) {
    return undefined;
  }

  return createInitialHostOnlyElementFiber(
    node,
    key,
    options.namespace ?? "html",
    getDocumentRef(options),
  );
}

function createInitialHostOnlyElementFiber(
  node: ReactCompatElement,
  key: string | undefined,
  namespace: HostNamespace,
  documentRef: Document | CustomHostDocument,
): Fiber {
  const elementType = node.type as string;
  const elementNamespace = namespaceForHostElement(namespace, elementType);
  const childNamespace = namespaceForHostChildren(elementNamespace, elementType);
  const fiber = createFiber("host-component", node.props, key);
  fiber.type = elementType;
  fiber.stateNode = createHostElement(documentRef, elementType, namespace);
  fiber.flags |= Placement;
  fiber.hostChildListChanged = true;

  if (
    getDirectHostTextChild(node.props.children) === undefined ||
    !shouldUseDirectHostTextChild()
  ) {
    fiber.child = createInitialHostOnlyChildList(
      fiber,
      node.props.children as ReactCompatNode,
      childNamespace,
      documentRef,
    );
  }

  return fiber;
}

function createInitialHostOnlyChildList(
  parent: Fiber,
  children: ReactCompatNode,
  namespace: HostNamespace,
  documentRef: Document | CustomHostDocument,
): Fiber | undefined {
  const normalized = normalizeChildren(children);
  let first: Fiber | undefined;
  let previous: Fiber | undefined;

  for (let index = 0; index < normalized.length; index += 1) {
    const child = normalized[index];
    const fiber = createInitialHostOnlyChildFiber(child, namespace, documentRef);

    if (fiber === undefined) {
      continue;
    }

    fiber.return = parent;
    fiber.memoizedState = index;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    bubbleHostChild(parent, fiber);
    previous = fiber;
  }

  return first;
}

function createInitialHostOnlyChildFiber(
  node: ReactCompatNode,
  namespace: HostNamespace,
  documentRef: Document | CustomHostDocument,
): Fiber | undefined {
  if (node === null || node === undefined || typeof node === "boolean") {
    return undefined;
  }

  if (typeof node === "string" || typeof node === "number") {
    const fiber = createFiber("host-text", String(node));
    fiber.stateNode = createHostTextNode(documentRef);
    fiber.flags |= Placement;
    return fiber;
  }

  if (Array.isArray(node)) {
    const fiber = createFiber("fragment", node);
    fiber.child = createInitialHostOnlyChildList(fiber, node, namespace, documentRef);
    return fiber.child === undefined ? undefined : fiber;
  }

  if (!isReactCompatElement(node) || typeof node.type !== "string") {
    return undefined;
  }

  return createInitialHostOnlyElementFiber(
    node,
    node.key === null ? undefined : node.key,
    namespace,
    documentRef,
  );
}

function canCreateInitialHostOnlyNode(node: ReactCompatNode): boolean {
  if (
    node === null ||
    node === undefined ||
    typeof node === "boolean" ||
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return true;
  }

  if (Array.isArray(node)) {
    return node.every(canCreateInitialHostOnlyNode);
  }

  if (
    !isReactCompatElement(node) ||
    typeof node.type !== "string" ||
    node.ref !== null ||
    hasInitialHostOnlyExcludedProps(node.props)
  ) {
    return false;
  }

  return canCreateInitialHostOnlyNode(node.props.children as ReactCompatNode);
}

function hasInitialHostOnlyExcludedProps(props: Record<string, unknown>): boolean {
  return (
    hasOwnProperty.call(props, REACTIVE_TEXT_BINDING_META) ||
    hasOwnProperty.call(props, "dangerouslySetInnerHTML") ||
    props.contentEditable === true ||
    props.suppressContentEditableWarning === true ||
    props.value !== undefined ||
    props.defaultValue !== undefined ||
    props.checked !== undefined ||
    props.defaultChecked !== undefined
  );
}

function getHostChildFiberOptions(
  options: FiberHydrationOptions,
  namespace: HostNamespace,
  previousNodes: readonly Node[] | undefined,
): FiberHydrationOptions {
  const namespaceUnchanged =
    options.namespace === namespace || (options.namespace === undefined && namespace === "html");

  if (previousNodes === undefined && namespaceUnchanged) {
    return options;
  }

  return {
    ...options,
    namespace,
    ...(previousNodes === undefined ? {} : { previousNodes }),
  };
}

function commitHostChildren(
  fiber: Fiber | undefined,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): Node[] {
  const nodes: Node[] = [];
  let cursor = fiber;
  let index = 0;

  while (cursor !== undefined) {
    for (const node of commitHostFiber(
      cursor,
      parent,
      eventRoot,
      joinCommitPath(path, String(index)),
      options,
    )) {
      nodes.push(node);
    }
    cursor = cursor.sibling;
    index += 1;
  }

  return nodes;
}

function commitHostDirtyChildren(
  fiber: Fiber | undefined,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): void {
  let cursor = fiber;
  let index = 0;

  while (cursor !== undefined) {
    if (hasHostCommitWork(cursor)) {
      commitHostDirtyFiber(cursor, parent, eventRoot, joinCommitPath(path, String(index)), options);
    }
    cursor = cursor.sibling;
    index += 1;
  }
}

function commitHostDirtyChildrenOf(
  owner: Fiber,
  fiber: Fiber | undefined,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): void {
  const dirtyChildren = readDirtyChildCommitHints(owner);

  if (dirtyChildren === undefined) {
    commitHostDirtyChildren(fiber, parent, eventRoot, path, options);
    return;
  }

  for (let index = 0; index < dirtyChildren.length; index += 1) {
    const dirtyChild = dirtyChildren[index];

    if (dirtyChild !== undefined && hasHostCommitWork(dirtyChild)) {
      commitHostDirtyFiber(
        dirtyChild,
        parent,
        eventRoot,
        joinCommitPath(path, String(getDirtyChildCommitIndex(dirtyChild, index))),
        options,
      );
    }
  }
  owner.deletions = undefined;
}

function readDirtyChildCommitHints(fiber: Fiber): Fiber[] | undefined {
  return fiber.childListChanged ? undefined : fiber.deletions;
}

function getDirtyChildCommitIndex(fiber: Fiber, fallback: number): number {
  if (typeof fiber.memoizedState === "number") {
    return fiber.memoizedState;
  }

  return typeof fiber.stateNode === "number" ? fiber.stateNode : fallback;
}

function commitHostDirtyFiber(
  fiber: Fiber,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): void {
  if (fiber.tag === "host-text") {
    commitHostFiber(fiber, parent, eventRoot, path, options);
    return;
  }

  if (fiber.tag === "host-component") {
    const element = fiber.stateNode;

    if (!isHostElement(element)) {
      finishCommittedFiber(fiber);
      return;
    }

    const isDomElement = isDomHostElement(element);
    const props = fiber.pendingProps as Record<string, unknown>;
    const previousProps = fiber.memoizedProps as Record<string, unknown> | undefined;
    const directTextChild =
      fiber.child === undefined &&
      fiber.hydrateExisting !== true &&
      !hasDangerouslySetInnerHtmlProp(props)
        ? getDirectHostTextChild(props.children)
        : undefined;
    const textOnlyChildrenUpdate =
      directTextChild !== undefined &&
      hostPropsAreKnownChildrenOnly(fiber.memoizedProps) &&
      hostPropsAreKnownChildrenOnly(props);
    const propsAreUnchanged =
      fiber.hydrateExisting !== true &&
      !textOnlyChildrenUpdate &&
      hostPropsEqual(fiber.memoizedProps, props);
    const propsAreChildrenOnly =
      textOnlyChildrenUpdate ||
      (fiber.hydrateExisting !== true &&
        hostPropsAreChildrenOnly(fiber.memoizedProps) &&
        hostPropsAreChildrenOnly(props));
    const textOnlyRowUpdate =
      !propsAreUnchanged &&
      !propsAreChildrenOnly &&
      fiber.hydrateExisting !== true &&
      isRowTextOnlyUpdate(fiber.memoizedProps, props);

    if (isDomElement && !propsAreUnchanged && !propsAreChildrenOnly && !textOnlyRowUpdate) {
      applyProps(element, props, path, {
        ...options,
        eventRoot,
        preserveHydrationAttributes: fiber.hydrateExisting,
      });
    }

    if (directTextChild !== undefined) {
      const text = syncDirectHostTextChild(element, directTextChild);
      subscribeReactiveHostTextBinding(props, text);
    } else if (
      fiber.hostChildListChanged ||
      fiber.childListChanged ||
      fiber.subtreeChildListChanged
    ) {
      const childNodes = commitHostChildren(fiber.child, element, eventRoot, `${path}.c`, options);
      if (
        !(isDomElement && childNodes.length === 0 && committedPortalContainers.has(element)) &&
        !(isDomElement && shouldPreserveContentEditableChildren(element, props, childNodes)) &&
        !(isDomElement && hasDangerouslySetInnerHtmlProp(props))
      ) {
        syncChildNodes(element as ParentNode, childNodes);
        flushPendingReactiveDomBlockAfterCommits();
      }
    } else if (fiber.subtreeFlags !== NoFlags) {
      commitHostDirtyChildrenOf(fiber, fiber.child, element, eventRoot, `${path}.c`, options);
    }

    if (isDomElement && isFormHostType(fiber.type)) {
      applyPostChildFormProps(element, props, previousProps, fiber.hydrateExisting === true);
    }
    applyChangedRef(previousProps?.ref, props.ref, element);
    fiber.memoizedProps = props;
    finishCommittedFiber(fiber);
    return;
  }

  if (fiber.tag === "portal") {
    const container = fiber.stateNode;

    if (isPortalHostContainer(container)) {
      if (container instanceof Element) {
        setLogicalEventParent(container, parent);
      }
      const portalEventRoot =
        container instanceof Element && eventRoot !== container && eventRoot.contains(container)
          ? eventRoot
          : container instanceof Element
            ? container
            : eventRoot;
      const portalOptions = withPortalHostOptions(options, container);

      if (
        fiber.childListChanged ||
        fiber.subtreeChildListChanged ||
        (fiber.subtreeFlags & Placement) !== NoFlags
      ) {
        const childNodes = commitHostChildren(
          fiber.child,
          container as ParentNode,
          portalEventRoot,
          `${path}.portal`,
          portalOptions,
        );
        const previousNodes = committedHostNodesFromState(fiber.alternate?.memoizedState);
        syncOwnedChildNodes(container as ParentNode, previousNodes, childNodes);
        fiber.memoizedState = childNodes;
      } else {
        commitHostDirtyChildrenOf(
          fiber,
          fiber.child,
          container as ParentNode,
          portalEventRoot,
          `${path}.portal`,
          portalOptions,
        );
      }
    }
    fiber.memoizedProps = fiber.pendingProps;
    finishCommittedFiber(fiber);
    return;
  }

  if (fiber.tag === "reactive-dom-block") {
    fiber.memoizedProps = fiber.pendingProps;
    finishCommittedFiber(fiber);
    return;
  }

  if (fiber.subtreeFlags !== NoFlags) {
    commitHostDirtyChildrenOf(fiber, fiber.child, parent, eventRoot, path, options);
  }
  fiber.memoizedProps = fiber.pendingProps;
  finishCommittedFiber(fiber);
}

function hasHostCommitWork(fiber: Fiber): boolean {
  return (
    fiber.flags !== NoFlags ||
    fiber.subtreeFlags !== NoFlags ||
    fiber.hostChildListChanged ||
    fiber.childListChanged ||
    fiber.subtreeChildListChanged ||
    fiber.hydrateExisting
  );
}

function commitHostKeyedChildListMutation(
  fiber: Fiber | undefined,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): boolean {
  let cursor = fiber;
  let index = 0;
  let committed = false;

  while (cursor !== undefined) {
    if (!hasHostCommitWork(cursor)) {
      cursor = cursor.sibling;
      index += 1;
      continue;
    }

    const childPath = joinCommitPath(path, String(index));
    const didCommit = commitHostKeyedChildListMutationFiber(
      cursor,
      parent,
      eventRoot,
      childPath,
      options,
    );

    if (!didCommit) {
      return false;
    }

    committed = true;
    cursor = cursor.sibling;
    index += 1;
  }

  return committed;
}

function commitHostKeyedChildListMutationFiber(
  fiber: Fiber,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): boolean {
  if (fiber.tag === "portal") {
    commitHostDirtyFiber(fiber, parent, eventRoot, path, options);
    return true;
  }

  if (fiber.tag === "host-component" && (fiber.flags & Update) !== NoFlags) {
    commitHostDirtyFiber(fiber, parent, eventRoot, path, options);
    return true;
  }

  if (fiber.childListChanged) {
    const mutationParent =
      fiber.tag === "host-component" && isHostElement(fiber.stateNode) ? fiber.stateNode : parent;

    if (fiber.tag === "host-component" && !isHostElement(fiber.stateNode)) {
      return false;
    }

    if (commitHostAppendSuffix(fiber, mutationParent, eventRoot, path, options)) {
      finishHostPassthroughFiber(fiber);
      return true;
    }

    if (commitHostSingleRemoval(fiber, mutationParent)) {
      finishHostPassthroughFiber(fiber);
      return true;
    }

    return false;
  }

  if (fiber.subtreeChildListChanged) {
    if (fiber.tag === "host-component") {
      const element = fiber.stateNode;

      if (!isHostElement(element)) {
        return false;
      }

      if (
        !commitHostKeyedChildListMutation(fiber.child, element, eventRoot, `${path}.c`, options)
      ) {
        return false;
      }
      finishHostPassthroughFiber(fiber);
      return true;
    }

    if (!commitHostKeyedChildListMutation(fiber.child, parent, eventRoot, path, options)) {
      return false;
    }
    finishHostPassthroughFiber(fiber);
    return true;
  }

  commitHostDirtyFiber(fiber, parent, eventRoot, path, options);
  return true;
}

function commitHostAppendSuffix(
  fiber: Fiber,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions,
): boolean {
  const appendHint = readAppendSuffixCommitHint(fiber.memoizedState);
  const append = appendHint ?? getAppendSuffix(fiber.alternate?.child, fiber.child);

  if (append === undefined) {
    return false;
  }

  if (appendHint !== undefined) {
    fiber.memoizedState = undefined;
  }

  let cursor: Fiber | undefined = append.fiber;
  let index = append.index;

  while (cursor !== undefined) {
    for (const node of commitHostFiber(
      cursor,
      parent,
      eventRoot,
      joinCommitPath(path, String(index)),
      options,
    )) {
      parent.appendChild(node);
    }
    cursor = cursor.sibling;
    index += 1;
  }

  return true;
}

function readAppendSuffixCommitHint(value: unknown): AppendSuffixCommitHint | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as Partial<AppendSuffixCommitHint>;
  return candidate.fiber !== undefined && typeof candidate.index === "number"
    ? { fiber: candidate.fiber, index: candidate.index }
    : undefined;
}

function commitHostSingleRemoval(fiber: Fiber, parent: ParentNode): boolean {
  const removed =
    fiber.deletions?.length === 1
      ? fiber.deletions[0]
      : getSingleRemovedFiber(fiber.alternate?.child, fiber.child);

  if (removed === undefined) {
    return false;
  }

  let removedAny = false;

  for (const node of collectCommittedHostNodes(removed)) {
    if (node.parentNode !== parent) {
      return false;
    }

    parent.removeChild(node);
    removedAny = true;
  }

  if (removedAny) {
    disposeHostFiberResources(removed);
    fiber.deletions = undefined;
  }

  return removedAny;
}

function getAppendSuffix(
  current: Fiber | undefined,
  next: Fiber | undefined,
): { fiber: Fiber; index: number } | undefined {
  let currentCursor = current;
  let nextCursor = next;
  let index = 0;

  while (currentCursor !== undefined && nextCursor !== undefined) {
    if (!isSameFiberSlot(currentCursor, nextCursor) || hasHostCommitWork(nextCursor)) {
      return undefined;
    }

    currentCursor = currentCursor.sibling;
    nextCursor = nextCursor.sibling;
    index += 1;
  }

  if (currentCursor !== undefined || nextCursor === undefined) {
    return undefined;
  }

  return { fiber: nextCursor, index };
}

function getSingleRemovedFiber(
  current: Fiber | undefined,
  next: Fiber | undefined,
): Fiber | undefined {
  let currentCursor = current;
  let nextCursor = next;

  while (currentCursor !== undefined && nextCursor !== undefined) {
    if (!isSameFiberSlot(currentCursor, nextCursor)) {
      break;
    }

    if (hasHostCommitWork(nextCursor)) {
      return undefined;
    }

    currentCursor = currentCursor.sibling;
    nextCursor = nextCursor.sibling;
  }

  if (currentCursor === undefined) {
    return undefined;
  }

  const removed = currentCursor;
  currentCursor = currentCursor.sibling;

  while (currentCursor !== undefined && nextCursor !== undefined) {
    if (!isSameFiberSlot(currentCursor, nextCursor) || hasHostCommitWork(nextCursor)) {
      return undefined;
    }

    currentCursor = currentCursor.sibling;
    nextCursor = nextCursor.sibling;
  }

  return currentCursor === undefined && nextCursor === undefined ? removed : undefined;
}

function isSameFiberSlot(current: Fiber, next: Fiber): boolean {
  return (
    (next === current || next.alternate === current) &&
    current.tag === next.tag &&
    current.type === next.type &&
    current.key === next.key
  );
}

function collectCommittedHostNodes(fiber: Fiber): Node[] {
  if (fiber.tag === "reactive-dom-block") {
    const node = getReactiveDomBlockNode(fiber.stateNode);
    return node === undefined ? [] : [node];
  }

  if (
    (fiber.tag === "host-component" || fiber.tag === "host-text") &&
    fiber.stateNode instanceof Node
  ) {
    return [fiber.stateNode];
  }

  const nodes: Node[] = [];
  let child = fiber.child;

  while (child !== undefined) {
    nodes.push(...collectCommittedHostNodes(child));
    child = child.sibling;
  }

  return nodes;
}

function hasCommittedHostNode(fiber: Fiber): boolean {
  if (fiber.tag === "reactive-dom-block") {
    return getReactiveDomBlockNode(fiber.stateNode) !== undefined;
  }

  if (
    (fiber.tag === "host-component" || fiber.tag === "host-text") &&
    fiber.stateNode instanceof Node
  ) {
    return true;
  }

  let child = fiber.child;

  while (child !== undefined) {
    if (hasCommittedHostNode(child)) {
      return true;
    }
    child = child.sibling;
  }

  return false;
}

function getSkippedChild(current: Fiber | undefined): Fiber | undefined {
  const child = current?.child;
  const alternateChild = current?.alternate?.child;

  if (
    child !== undefined &&
    alternateChild !== undefined &&
    !hasCommittedHostNode(child) &&
    hasCommittedHostNode(alternateChild)
  ) {
    return alternateChild;
  }

  return child;
}

function finishHostPassthroughFiber(fiber: Fiber): void {
  fiber.memoizedProps = fiber.pendingProps;
  finishCommittedFiber(fiber);
}

function commitHostFiber(
  fiber: Fiber,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
  options: RenderOptions = {},
): Node[] {
  if (fiber.tag === "host-text") {
    const text = fiber.stateNode;

    if (!(text instanceof Text)) {
      finishCommittedFiber(fiber);
      return [];
    }

    const nextText = String(fiber.pendingProps);
    if (text.data !== nextText) {
      text.data = nextText;
    }
    fiber.memoizedProps = fiber.pendingProps;
    finishCommittedFiber(fiber);
    return [text];
  }

  if (fiber.tag === "reactive-dom-block") {
    const node = getReactiveDomBlockNode(fiber.stateNode);
    enqueueReactiveDomBlockAfterCommit(fiber.stateNode);
    fiber.memoizedProps = fiber.pendingProps;
    finishCommittedFiber(fiber);
    return node === undefined ? [] : [node];
  }

  if (fiber.tag === "host-component") {
    const element = fiber.stateNode;

    if (!isHostElement(element)) {
      finishCommittedFiber(fiber);
      return [];
    }

    if (
      fiber.hydrateExisting !== true &&
      fiber.flags === NoFlags &&
      fiber.subtreeFlags === NoFlags &&
      fiber.hostChildListChanged !== true &&
      fiber.childListChanged !== true &&
      fiber.subtreeChildListChanged !== true
    ) {
      fiber.memoizedProps = fiber.pendingProps;
      return [element];
    }

    const isDomElement = isDomHostElement(element);
    const props = fiber.pendingProps as Record<string, unknown>;
    const previousProps = fiber.memoizedProps as Record<string, unknown> | undefined;
    const directTextChild =
      fiber.child === undefined &&
      fiber.hydrateExisting !== true &&
      !hasDangerouslySetInnerHtmlProp(props)
        ? getDirectHostTextChild(props.children)
        : undefined;
    const textOnlyChildrenUpdate =
      directTextChild !== undefined &&
      hostPropsAreKnownChildrenOnly(fiber.memoizedProps) &&
      hostPropsAreKnownChildrenOnly(props);
    const propsAreUnchanged =
      fiber.hydrateExisting !== true &&
      !textOnlyChildrenUpdate &&
      hostPropsEqual(fiber.memoizedProps, props);
    const propsAreChildrenOnly =
      textOnlyChildrenUpdate ||
      (fiber.hydrateExisting !== true &&
        hostPropsAreChildrenOnly(fiber.memoizedProps) &&
        hostPropsAreChildrenOnly(props));
    const textOnlyRowUpdate =
      !propsAreUnchanged &&
      !propsAreChildrenOnly &&
      fiber.hydrateExisting !== true &&
      isRowTextOnlyUpdate(fiber.memoizedProps, props);

    if (isDomElement && !propsAreUnchanged && !propsAreChildrenOnly && !textOnlyRowUpdate) {
      applyProps(element, props, path, {
        ...options,
        eventRoot,
        preserveHydrationAttributes: fiber.hydrateExisting,
      });
    }
    if (directTextChild !== undefined) {
      const text = syncDirectHostTextChild(element, directTextChild);
      subscribeReactiveHostTextBinding(props, text);
    } else if (
      fiber.hostChildListChanged ||
      fiber.childListChanged ||
      fiber.subtreeChildListChanged ||
      fiber.hydrateExisting === true ||
      (fiber.subtreeFlags & Placement) !== NoFlags
    ) {
      const childNodes = commitHostChildren(fiber.child, element, eventRoot, `${path}.c`, options);
      if (
        !(isDomElement && childNodes.length === 0 && committedPortalContainers.has(element)) &&
        !(isDomElement && shouldPreserveContentEditableChildren(element, props, childNodes)) &&
        !(isDomElement && hasDangerouslySetInnerHtmlProp(props))
      ) {
        syncChildNodes(element as ParentNode, childNodes);
        flushPendingReactiveDomBlockAfterCommits();
      }
    } else if (fiber.subtreeFlags !== NoFlags) {
      commitHostChildren(fiber.child, element, eventRoot, `${path}.c`, options);
    }

    if (isDomElement && isFormHostType(fiber.type)) {
      applyPostChildFormProps(element, props, previousProps, fiber.hydrateExisting === true);
    }
    applyChangedRef(previousProps?.ref, props.ref, element);
    fiber.memoizedProps = props;
    finishCommittedFiber(fiber);
    return [element];
  }

  if (fiber.tag === "fragment") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.f`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "profiler") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.profiler`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "strict-mode") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.strict`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "suspense") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.s`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "suspense-list") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.sl`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "context-provider" || fiber.tag === "context-consumer") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.ctx`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "function-component") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.fc`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "forward-ref") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.fr`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "memo") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.memo`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "lazy") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.lazy`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "error-boundary") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.eb`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "class-component") {
    fiber.memoizedProps = fiber.pendingProps;
    const nodes = commitHostChildren(fiber.child, parent, eventRoot, `${path}.class`, options);
    finishCommittedFiber(fiber);
    return nodes;
  }

  if (fiber.tag === "portal") {
    const container = fiber.stateNode;

    if (!isPortalHostContainer(container)) {
      return [];
    }

    if (container instanceof Element) {
      setLogicalEventParent(container, parent);
      committedPortalContainers.add(container);
    }
    const portalEventRoot =
      container instanceof Element && eventRoot !== container && eventRoot.contains(container)
        ? eventRoot
        : container instanceof Element
          ? container
          : eventRoot;
    const portalOptions = withPortalHostOptions(options, container);
    const childNodes = commitHostChildren(
      fiber.child,
      container as ParentNode,
      portalEventRoot,
      `${path}.portal`,
      portalOptions,
    );
    const previousNodes = committedHostNodesFromState(fiber.alternate?.memoizedState);
    syncOwnedChildNodes(container as ParentNode, previousNodes, childNodes);
    fiber.memoizedState = childNodes;
    fiber.memoizedProps = fiber.pendingProps;
    finishCommittedFiber(fiber);
    return [];
  }

  finishCommittedFiber(fiber);
  return [];
}

function finishCommittedFiber(fiber: Fiber): void {
  fiber.flags = NoFlags;
  fiber.subtreeFlags = NoFlags;
  fiber.childListChanged = false;
  fiber.subtreeChildListChanged = false;
  fiber.hostChildListChanged = false;
}

function getReactiveDomBlockNode(state: unknown): ChildNode | undefined {
  if (
    typeof state === "object" &&
    state !== null &&
    "node" in state &&
    (state as { node?: unknown }).node instanceof Node
  ) {
    return (state as { node: ChildNode }).node;
  }

  return undefined;
}

function enqueueReactiveDomBlockAfterCommit(state: unknown): void {
  const afterCommit = (state as { afterCommit?: unknown } | undefined)?.afterCommit;

  if (typeof afterCommit === "function") {
    pendingReactiveDomBlockAfterCommits.push(afterCommit as () => void);
  }
}

function flushPendingReactiveDomBlockAfterCommits(): void {
  const pending = pendingReactiveDomBlockAfterCommits.splice(0);

  for (const afterCommit of pending) {
    afterCommit();
  }
}

function disposeReactiveDomBlockState(state: unknown, seen: Set<unknown>): void {
  if (typeof state !== "object" || state === null || seen.has(state)) {
    return;
  }

  seen.add(state);
  const dispose = (state as { dispose?: unknown }).dispose;

  if (typeof dispose === "function") {
    dispose();
    (state as { dispose?: unknown }).dispose = undefined;
  }
}

function hasChildListMutation(fiber: Fiber): boolean {
  return fiber.childListChanged || fiber.subtreeChildListChanged;
}

function hostPropsEqual(previous: unknown, next: Record<string, unknown>): boolean {
  if (previous === next) {
    return true;
  }

  if (typeof previous !== "object" || previous === null) {
    return false;
  }

  const previousProps = previous as Record<string, unknown>;
  let previousCount = 0;
  let nextCount = 0;

  for (const key in previousProps) {
    if (!hasOwnProperty.call(previousProps, key)) {
      continue;
    }
    previousCount += 1;
    if (!hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!Object.is(previousProps[key], next[key])) {
      return false;
    }
  }

  for (const key in next) {
    if (hasOwnProperty.call(next, key)) {
      nextCount += 1;
    }
  }

  return previousCount === nextCount;
}

function hostOwnPropsEqual(previous: unknown, next: Record<string, unknown>): boolean {
  if (previous === next) {
    return true;
  }

  if (typeof previous !== "object" || previous === null) {
    return false;
  }

  const previousProps = previous as Record<string, unknown>;

  let previousCount = 0;
  let nextCount = 0;

  for (const key in previousProps) {
    if (!hasOwnProperty.call(previousProps, key) || key === "children") {
      continue;
    }
    previousCount += 1;
    if (!hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!Object.is(previousProps[key], next[key])) {
      return false;
    }
  }

  for (const key in next) {
    if (hasOwnProperty.call(next, key) && key !== "children") {
      nextCount += 1;
    }
  }

  return previousCount === nextCount;
}

function hostDirectTextChildChanged(previous: unknown, next: Record<string, unknown>): boolean {
  const previousText = getDirectHostTextChild(hostFiberChildrenProp(previous));
  const nextText = getDirectHostTextChild(next.children);

  return (previousText !== undefined || nextText !== undefined) && previousText !== nextText;
}

function hostChildListChanged(previous: unknown, next: Record<string, unknown>): boolean {
  const previousChildren = hostFiberChildrenProp(previous);
  const nextChildren = next.children;

  if (Object.is(previousChildren, nextChildren)) {
    return false;
  }

  if (
    getDirectHostTextChild(previousChildren) !== undefined ||
    getDirectHostTextChild(nextChildren) !== undefined
  ) {
    return false;
  }

  if (sameSingleHostChild(previousChildren, nextChildren)) {
    return false;
  }

  if (sameHostChildList(previousChildren, nextChildren)) {
    return false;
  }

  return true;
}

function sameSingleHostChild(previous: unknown, next: unknown): boolean {
  return (
    isReactCompatElement(previous) &&
    isReactCompatElement(next) &&
    previous.key === next.key &&
    previous.type === next.type
  );
}

function sameHostChildList(previous: unknown, next: unknown): boolean {
  if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousChild = previous[index];
    const nextChild = next[index];

    if (Object.is(previousChild, nextChild)) {
      continue;
    }

    if (!sameSingleHostChild(previousChild, nextChild)) {
      return false;
    }
  }

  return previous.length > 0 || (Array.isArray(previous) && Array.isArray(next));
}

function hostPropsAreChildrenOnly(props: unknown): boolean {
  if (typeof props !== "object" || props === null) {
    return false;
  }

  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key) && key !== "children") {
      return false;
    }
  }

  return true;
}

function hostPropsAreKnownChildrenOnly(props: unknown): boolean {
  return (
    typeof props === "object" &&
    props !== null &&
    (props as { [HOST_CHILDREN_ONLY_PROPS_META]?: true })[HOST_CHILDREN_ONLY_PROPS_META] === true
  );
}

function isRowTextOnlyUpdate(previous: unknown, next: Record<string, unknown>): boolean {
  if (typeof previous !== "object" || previous === null) {
    return false;
  }

  const previousProps = previous as Record<string, unknown>;
  const previousText = getDirectHostTextChild(previousProps.children);
  const nextText = getDirectHostTextChild(next.children);

  return (
    previousText !== undefined &&
    nextText !== undefined &&
    previousText !== nextText &&
    hostOwnPropsEqual(previousProps, next)
  );
}

function hostFiberChildrenProp(props: unknown): unknown {
  return typeof props === "object" && props !== null
    ? (props as { children?: unknown }).children
    : undefined;
}

function getDirectHostTextChild(children: unknown): string | undefined {
  return typeof children === "string" || typeof children === "number"
    ? String(children)
    : undefined;
}

// Only these host tags carry post-child form value/checked semantics. Gating on
// the (cheap, already-known) type string lets the commit skip applyPostChildFormProps
// and its instanceof probes for every other element.
function isFormHostType(type: unknown): boolean {
  return type === "input" || type === "textarea" || type === "select";
}

// This package has no Node type dependency; declare the minimal process
// shape needed for the literal process.env.NODE_ENV expression below.
declare const process: { env: Record<string, string | undefined> };

type HostFastPathMode = "static-fast" | "dynamic";

const hostFastPathMode: HostFastPathMode = (() => {
  try {
    // The literal process.env.NODE_ENV member expression is what bundler
    // define rewriting matches; a globalThis.process indirection is never
    // rewritten and leaves deployed browser bundles without any fast path.
    return process.env.NODE_ENV === "production" ? "static-fast" : "dynamic";
  } catch {
    // No process global at all: an unbundled browser runtime. Treat it as
    // production rather than running every host update on the slow path.
    return "static-fast";
  }
})();

function shouldUseDirectHostTextChild(): boolean {
  if (hostFastPathMode === "static-fast") {
    return true;
  }

  // Node dev/test environments keep the per-call env read so test harnesses
  // can flip NODE_ENV (vi.stubEnv) without re-importing this module.
  return process.env.NODE_ENV === "production";
}

function syncDirectHostTextChild(element: Element, text: string): Text {
  const firstChild = element.firstChild;

  if (firstChild instanceof Text && firstChild.nextSibling === null) {
    if (firstChild.data !== text) {
      firstChild.data = text;
    }
    return firstChild;
  }

  element.textContent = text;
  const nextFirstChild = element.firstChild;

  if (!(nextFirstChild instanceof Text)) {
    const textNode = document.createTextNode(text);
    element.replaceChildren(textNode);
    return textNode;
  }

  return nextFirstChild;
}

function subscribeReactiveHostTextBinding(props: Record<string, unknown>, text: Text): void {
  subscribeReactiveTextBinding(
    (props as Record<PropertyKey, unknown>)[REACTIVE_TEXT_BINDING_META],
    text,
  );
}

function shouldPreserveContentEditableChildren(
  element: Element,
  props: Record<string, unknown>,
  childNodes: readonly Node[],
): boolean {
  void childNodes;

  if (
    !element.hasAttribute("contenteditable") ||
    element.getAttribute("contenteditable") === "false"
  ) {
    return false;
  }

  const children = props.children;
  return (
    children === undefined ||
    children === null ||
    children === false ||
    (Array.isArray(children) && children.length === 0)
  );
}

function createSuspenseFiber(
  current: Fiber | undefined,
  element: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  const boundary = findReactSuspenseBoundary(options.previousNodes ?? []);
  if (boundary?.serverError !== undefined) {
    reportReactSuspenseServerError(
      options,
      path,
      boundary.serverError.message,
      boundary.serverError.componentStack,
    );
  }
  const { previousNodes: _previousNodes, ...optionsWithoutPreviousNodes } = options;
  const boundaryOptions =
    boundary === undefined
      ? options
      : boundary.serverError === undefined
        ? boundary.previousNodes === undefined
          ? optionsWithoutPreviousNodes
          : { ...options, previousNodes: boundary.previousNodes }
        : optionsWithoutPreviousNodes;
  const fiber =
    current?.tag === "suspense" && current.type === element.type
      ? createWorkInProgress(current, element.props)
      : createFiber("suspense", element.props, key);
  fiber.type = element.type;

  const snapshot = takeRuntimeSnapshot(runtime);

  try {
    suspensePrimaryRenderDepth += 1;
    let childResult: FiberReconcileResult;

    try {
      childResult = reconcileHostChild(
        fiber,
        current?.tag === "suspense" ? current.child : undefined,
        element.props.children as ReactCompatNode,
        runtime,
        `${path}.s`,
        boundaryOptions,
      );
    } finally {
      suspensePrimaryRenderDepth -= 1;
    }

    fiber.child = childResult.fiber;
    fiber.memoizedState = { didSuspend: false } satisfies SuspenseFiberState;
  } catch (error) {
    if (!isThenable(error)) {
      throw error;
    }

    restoreRuntimeSnapshot(runtime, snapshot);
    error.then(
      () => runtime.rerender(),
      () => runtime.rerender(),
    );
    const fallbackResult = reconcileHostChild(
      fiber,
      current?.tag === "suspense" ? current.child : undefined,
      element.props.fallback as ReactCompatNode,
      runtime,
      `${path}.fallback`,
      boundaryOptions,
    );
    fiber.child = fallbackResult.fiber;
    fiber.memoizedState = { didSuspend: true } satisfies SuspenseFiberState;
  }

  return {
    fiber,
    consumed: boundary?.consumed ?? options.previousNodes?.length ?? 0,
  };
}

function createStrictModeFiber(
  current: Fiber | undefined,
  element: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  const fiber =
    current?.tag === "strict-mode" && current.type === element.type
      ? createWorkInProgress(current, element.props)
      : createFiber("strict-mode", element.props, key);
  fiber.type = element.type;

  const {
    result: childResult,
    memoValues,
    memoValuesByHook,
  } = renderWithStrictModeMemoCapture(runtime, () =>
    reconcileHostChild(
      fiber,
      current?.tag === "strict-mode" ? current.child : undefined,
      element.props.children as ReactCompatNode,
      runtime,
      `${path}.strict`,
      options,
    ),
  );
  fiber.child = childResult.fiber;

  const snapshot = takeRuntimeSnapshot(runtime);
  try {
    renderStrictModeReplay(runtime, memoValues, memoValuesByHook, () =>
      reconcileHostChild(
        fiber,
        childResult.fiber,
        element.props.children as ReactCompatNode,
        runtime,
        `${path}.strict`,
        options.previousNodes === undefined ? options : { ...options, previousNodes: [] },
      ),
    );
  } finally {
    restoreRuntimeSnapshot(runtime, snapshot);
  }

  return { fiber, consumed: childResult.consumed };
}

function createSuspenseListFiber(
  current: Fiber | undefined,
  element: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  const fiber =
    current?.tag === "suspense-list" && current.type === element.type
      ? createWorkInProgress(current, element.props)
      : createFiber("suspense-list", element.props, key);
  fiber.type = element.type;
  const children = normalizeChildren(element.props.children as ReactCompatNode);
  const revealOrder = element.props.revealOrder;

  if (revealOrder === "forwards") {
    const childResult = reconcileSuspenseListForwards(
      fiber,
      current?.tag === "suspense-list" ? current.child : undefined,
      children,
      runtime,
      path,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      didSuspend: hasSuspendedChild(fiber.child),
    } satisfies SuspenseFiberState;
    return { fiber, consumed: childResult.consumed };
  } else if (revealOrder === "backwards") {
    const childResult = reconcileSuspenseListBackwards(
      fiber,
      current?.tag === "suspense-list" ? current.child : undefined,
      children,
      runtime,
      path,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      didSuspend: hasSuspendedChild(fiber.child),
    } satisfies SuspenseFiberState;
    return { fiber, consumed: childResult.consumed };
  } else {
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "suspense-list" ? current.child : undefined,
      children,
      runtime,
      `${path}.sl`,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      didSuspend: hasSuspendedChild(fiber.child),
    } satisfies SuspenseFiberState;
    return { fiber, consumed: childResult.consumed };
  }
}

function reconcileSuspenseListForwards(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let consumed = 0;
  const currentByKey = collectExistingKeyedFibers(currentFirstChild);
  let currentUnkeyed = currentFirstChild;

  for (const [index, child] of children.entries()) {
    const key = getNodeKey(child);
    const current = key === undefined ? currentUnkeyed : currentByKey.get(key);
    const childOptions =
      options.previousNodes === undefined
        ? options
        : { ...options, previousNodes: options.previousNodes.slice(consumed) };
    const result = createHostFiber(
      parent,
      current,
      child,
      key,
      runtime,
      `${path}.sl.${getNodePathSegment(child, index)}`,
      childOptions,
    );
    const fiber = result.fiber;

    if (key === undefined) {
      currentUnkeyed = currentUnkeyed?.sibling;
    }
    consumed += result.consumed;

    if (fiber === undefined) {
      continue;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    bubbleHostChild(parent, fiber);

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    previous = fiber;

    if (isSuspendedSuspenseFiber(fiber)) {
      break;
    }
  }

  return { fiber: first, consumed };
}

function reconcileSuspenseListBackwards(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  const fibers: Fiber[] = [];
  const currentByKey = collectExistingKeyedFibers(currentFirstChild);
  let consumed = 0;

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index] as ReactCompatNode;
    const key = getNodeKey(child);
    const result = createHostFiber(
      parent,
      key === undefined ? undefined : currentByKey.get(key),
      child,
      key,
      runtime,
      `${path}.sl.${getNodePathSegment(child, index)}`,
      options.previousNodes === undefined
        ? options
        : { ...options, previousNodes: options.previousNodes.slice(consumed) },
    );
    const fiber = result.fiber;
    consumed += result.consumed;

    if (fiber === undefined) {
      continue;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    bubbleHostChild(parent, fiber);
    fibers.unshift(fiber);

    if (isSuspendedSuspenseFiber(fiber)) {
      break;
    }
  }

  return { fiber: linkFiberSiblings(fibers), consumed };
}

function linkFiberSiblings(fibers: readonly Fiber[]): Fiber | undefined {
  let previous: Fiber | undefined;

  for (const fiber of fibers) {
    if (previous !== undefined) {
      previous.sibling = fiber;
    }
    previous = fiber;
  }

  return fibers[0];
}

function hasSuspendedChild(fiber: Fiber | undefined): boolean {
  let cursor = fiber;

  while (cursor !== undefined) {
    if (isSuspendedSuspenseFiber(cursor)) {
      return true;
    }

    cursor = cursor.sibling;
  }

  return false;
}

function hasPendingAsyncChild(fiber: Fiber | undefined): boolean {
  let cursor = fiber;

  while (cursor !== undefined) {
    if (isPendingLazyFiber(cursor) || isSuspendedSuspenseFiber(cursor)) {
      return true;
    }

    if (cursor.child !== undefined && hasPendingAsyncChild(cursor.child)) {
      return true;
    }

    cursor = cursor.sibling;
  }

  return false;
}

function tryReuseMemoBailout(
  current: Fiber | undefined,
  node: ReactCompatNode,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions,
  canReuseCurrentFiber = true,
): FiberReconcileResult | undefined {
  if (
    current?.tag !== "memo" ||
    runtime === undefined ||
    !isReactCompatElement(node) ||
    node.type !== current.type ||
    !isMemoType(node.type)
  ) {
    return undefined;
  }

  const previousMemoState = current.memoizedState as MemoFiberState | undefined;
  const memoPath = `${path}.memo`;
  const memoRuntimePath = getRuntimePath(memoPath, options);

  if (
    previousMemoState === undefined ||
    (memoStateNeedsDirtyInstanceCheck(previousMemoState) &&
      hasDirtyInstance(runtime, previousMemoState.instanceKeys, memoRuntimePath)) ||
    (memoStateNeedsEffectCheck(previousMemoState) &&
      hasUnflushedMountEffectInstance(runtime, previousMemoState.instanceKeys)) ||
    !areMemoPropsEqual(node.type, previousMemoState.props, node.props)
  ) {
    return undefined;
  }

  if (memoStateNeedsActiveInstanceMark(previousMemoState)) {
    markActiveInstanceKeys(runtime, previousMemoState.instanceKeys);
  }

  const fiber =
    canReuseCurrentFiber &&
    current.hasRefSubtree !== true &&
    current.hasDisposableResources !== true &&
    current.hydrateExisting !== true
      ? current
      : createWorkInProgress(current, node.props);

  if (fiber === current) {
    current.pendingProps = node.props;
    current.flags = NoFlags;
    current.subtreeFlags = NoFlags;
    current.childListChanged = false;
    current.subtreeChildListChanged = false;
    current.hostChildListChanged = false;
  }
  fiber.type = node.type;
  fiber.child = getSkippedChild(current);
  fiber.memoizedState = previousMemoState;
  return {
    fiber,
    consumed: options.previousNodes?.length ?? 0,
  };
}

function tryReuseDependencyFreeMemoBailout(
  current: Fiber | undefined,
  node: ReactCompatNode,
  runtime: RootRuntime | undefined,
  options: FiberHydrationOptions,
  canReuseCurrentFiber: boolean,
): FiberReconcileResult | undefined {
  if (
    options.previousNodes !== undefined ||
    current?.tag !== "memo" ||
    runtime === undefined ||
    !isReactCompatElement(node) ||
    node.type !== current.type ||
    !isMemoType(node.type)
  ) {
    return undefined;
  }

  const previousMemoState = current.memoizedState as MemoFiberState | undefined;

  if (
    previousMemoState === undefined ||
    previousMemoState.hasDirtyInstanceDependencies !== false ||
    previousMemoState.hasUnflushedEffectDependencies !== false ||
    previousMemoState.hasRetainedInstanceDependencies !== false ||
    !areMemoPropsEqual(node.type, previousMemoState.props, node.props)
  ) {
    return undefined;
  }

  const fiber = getMemoBailoutFiber(
    runtime,
    current,
    node.props,
    previousMemoState,
    canReuseCurrentFiber,
  );
  fiber.type = node.type;
  fiber.child = getSkippedChild(current);
  fiber.memoizedState = previousMemoState;
  return {
    fiber,
    consumed: 0,
  };
}

function isPendingLazyFiber(fiber: Fiber): boolean {
  if (fiber.tag !== "lazy" || !isLazyType(fiber.type)) {
    return false;
  }

  return fiber.type.status !== "resolved" || fiber.child === undefined;
}

function isSuspendedSuspenseFiber(fiber: Fiber): boolean {
  return (
    fiber.tag === "suspense" &&
    (fiber.memoizedState as SuspenseFiberState | undefined)?.didSuspend === true
  );
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
        const boundary: ReactSuspenseBoundary = {
          consumed: index - startIndex + 1,
          ...readReactSuspenseServerError(start, boundaryNodes),
        };

        if (!isReactSuspenseErrorStartComment(start)) {
          boundary.previousNodes = isReactSuspensePendingStartComment(start)
            ? removeReactSuspensePendingTemplate(boundaryNodes)
            : boundaryNodes;
        }

        return boundary;
      }
    }
  }

  return undefined;
}

function isReactSuspenseStartComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && reactSuspenseStartComments.has(node.data);
}

function isReactSuspensePendingStartComment(node: Comment): boolean {
  return node.data === "$?" || node.data === "$!";
}

function isReactSuspenseErrorStartComment(node: Comment): boolean {
  return node.data === "$!";
}

function isReactSuspenseEndComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && node.data === "/$";
}

function removeReactSuspensePendingTemplate(nodes: readonly Node[]): Node[] {
  const [firstNode, ...remainingNodes] = nodes;

  return firstNode instanceof HTMLTemplateElement ? remainingNodes : [...nodes];
}

const reactSuspenseStartComments = new Set(["$", "$?", "$!"]);

function readReactSuspenseServerError(
  start: Comment,
  boundaryNodes: readonly Node[],
): { serverError: { message: string; componentStack?: string } } | {} {
  if (start.data !== "$!") {
    return {};
  }

  const template = boundaryNodes[0];
  const message =
    template instanceof HTMLTemplateElement ? template.getAttribute("data-msg") : null;
  const componentStack =
    template instanceof HTMLTemplateElement ? template.getAttribute("data-stck") : null;

  return {
    serverError: {
      message: message ?? "React Suspense server rendering error.",
      ...(componentStack === null ? {} : { componentStack }),
    },
  };
}

function createPortalFiber(
  parent: Fiber,
  current: Fiber | undefined,
  portal: ReactCompatPortal,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  runtime.portalContainers.add(portal.container);
  const fiber =
    current?.tag === "portal" && current.stateNode === portal.container
      ? createWorkInProgress(current, portal.children)
      : createFiber("portal", portal.children, key);
  fiber.stateNode = portal.container;
  const childResult = reconcileHostChild(
    fiber,
    current?.tag === "portal" ? current.child : undefined,
    portal.children,
    runtime,
    `${path}.portal`,
    {
      ...options,
      documentRef: portal.container.ownerDocument,
      namespace: namespaceForPortalContainer(portal.container),
    },
  );
  fiber.child = childResult.fiber;
  fiber.return = parent;
  return { fiber, consumed: childResult.consumed };
}

function normalizeChildren(node: ReactCompatNode): ReactCompatNode[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  return Array.isArray(node) ? node : [node];
}

function getDocumentRef(options: FiberHydrationOptions): Document | CustomHostDocument {
  return options.documentRef ?? document;
}

function createHostTextNode(documentRef: Document | CustomHostDocument): Text {
  if ("createTextNode" in documentRef && typeof documentRef.createTextNode === "function") {
    return documentRef.createTextNode("");
  }

  return document.createTextNode("");
}

function collectExistingKeyedFibers(firstChild: Fiber | undefined): Map<string, Fiber> {
  const keyed = new Map<string, Fiber>();
  let cursor = firstChild;

  while (cursor !== undefined) {
    if (cursor.key !== undefined) {
      keyed.set(cursor.key, cursor);
    }

    cursor = cursor.sibling;
  }

  return keyed;
}

function getNodeKey(node: ReactCompatNode): string | undefined {
  return isReactCompatElement(node) && node.key !== null ? node.key : undefined;
}

function hasKeyedChild(children: readonly ReactCompatNode[]): boolean {
  for (const child of children) {
    if (getNodeKey(child) !== undefined) {
      return true;
    }
  }

  return false;
}

function getNodePathSegment(node: ReactCompatNode, index: number): string {
  const key = getNodeKey(node);
  return key === undefined ? String(index) : `k:${key}`;
}

function getReconcileChildPath(
  path: string,
  node: ReactCompatNode,
  index: number,
  options: FiberHydrationOptions,
): string {
  if (!shouldTrackReconcilePath(node, options)) {
    return "";
  }

  return joinPath(path, getNodePathSegment(node, index));
}

function shouldTrackReconcilePath(node: ReactCompatNode, options: FiberHydrationOptions): boolean {
  if (
    options.previousNodes !== undefined ||
    options.hydration?.onRecoverableError !== undefined ||
    options.resumeId !== undefined
  ) {
    return true;
  }

  return !isHostElementWithDirectTextChild(node);
}

function isHostElementWithDirectTextChild(node: ReactCompatNode): boolean {
  return (
    isReactCompatElement(node) &&
    typeof node.type === "string" &&
    getDirectHostTextChild(node.props.children) !== undefined
  );
}

function getRootCommitPath(options: RenderOptions): string {
  return options.hydration?.onRecoverableError === undefined ? SKIP_COMMIT_PATH : "0";
}

function joinCommitPath(path: string, segment: string): string {
  return path === SKIP_COMMIT_PATH ? "" : joinPath(path, segment);
}

function getHydrationChildOptions(
  options: FiberHydrationOptions,
  component: Function,
): FiberHydrationOptions {
  return options.hydration === undefined
    ? options
    : withHydrationComponentStack(options, getComponentName(component));
}

function getComponentName(component: Function): string {
  return component.name === "" ? "Anonymous" : component.name;
}

function getRuntimePath(path: string, options: FiberHydrationOptions): string {
  return options.runtimePathPrefix === undefined ? path : joinPath(options.runtimePathPrefix, path);
}

function joinPath(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
}

function isForwardRefType(value: unknown): value is {
  $$typeof: typeof FORWARD_REF_TYPE;
  render: (props: Record<string, unknown>, ref: unknown) => ReactCompatNode;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(value: unknown): value is {
  $$typeof: typeof MEMO_TYPE;
  type: ReactCompatElement["type"];
  compare?: (previous: Record<string, unknown>, next: Record<string, unknown>) => boolean;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

function isLazyType(value: unknown): value is {
  $$typeof: typeof LAZY_TYPE;
  load: () => Promise<{ default: ReactCompatElement["type"] }>;
  status: "uninitialized" | "pending" | "resolved" | "rejected";
  promise?: Promise<void>;
  resolved?: ReactCompatElement["type"];
  error?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === LAZY_TYPE
  );
}

function collectInstanceKeys(runtime: RootRuntime, prefix: string): string[] {
  return collectRuntimeInstanceKeys(runtime, prefix);
}

function collectMemoInstanceKeys(runtime: RootRuntime, prefix: string): string[] {
  return readDependencyFreeMemoInstanceKey(runtime, prefix) === undefined
    ? collectInstanceKeys(runtime, prefix)
    : emptyInstanceKeys;
}

function readDependencyFreeMemoInstanceKey(
  runtime: RootRuntime,
  prefix: string,
): string | undefined {
  const keys = runtime.instanceKeysByPrefix.get(prefix);

  if (keys === undefined || keys.size !== 1 || !keys.has(prefix)) {
    return undefined;
  }

  const instance = runtime.instances.get(prefix) as RuntimeInstanceLike | undefined;

  if (
    instance === undefined ||
    instance.contextDependencies !== undefined ||
    (instance.hooks !== undefined && instance.hooks.length > 0)
  ) {
    return undefined;
  }

  return prefix;
}

function markActiveInstanceKeys(runtime: RootRuntime, keys: readonly string[]): void {
  for (const key of keys) {
    runtime.activeInstanceKeys?.add(key);
  }
}

type RuntimeHookSlotLike = {
  kind?: string;
};

type RuntimeEffectHookSlotLike = RuntimeHookSlotLike & {
  mounted?: boolean;
  disposed?: boolean;
};

interface RuntimeInstanceLike {
  hooks?: readonly (RuntimeHookSlotLike | undefined)[];
  contextDependencies?: unknown;
}

function memoStateNeedsDirtyInstanceCheck(state: MemoFiberState): boolean {
  return state.hasDirtyInstanceDependencies !== false;
}

function memoStateNeedsEffectCheck(state: MemoFiberState): boolean {
  return state.hasUnflushedEffectDependencies !== false;
}

function memoStateNeedsActiveInstanceMark(state: MemoFiberState): boolean {
  return state.hasRetainedInstanceDependencies !== false;
}

function getMemoBailoutFiber(
  runtime: RootRuntime,
  current: Fiber,
  pendingProps: unknown,
  state: MemoFiberState,
  canReuseCurrentFiber: boolean,
): Fiber {
  if (memoStateNeedsActiveInstanceMark(state)) {
    markActiveInstanceKeys(runtime, state.instanceKeys);
  }

  if (canReuseCurrentFiber && canReuseMemoBailoutFiber(current, state)) {
    current.pendingProps = pendingProps;
    current.flags = NoFlags;
    current.subtreeFlags = NoFlags;
    current.childListChanged = false;
    current.subtreeChildListChanged = false;
    current.hostChildListChanged = false;
    return current;
  }

  const fiber = createWorkInProgress(current, pendingProps);
  return fiber;
}

function canReuseMemoBailoutFiber(current: Fiber, state: MemoFiberState): boolean {
  return (
    state.hasRetainedInstanceDependencies === false &&
    current.hasRefSubtree !== true &&
    current.hasDisposableResources !== true &&
    current.hydrateExisting !== true
  );
}

function hasDirtyInstanceDependencies(runtime: RootRuntime, keys: readonly string[]): boolean {
  for (const key of keys) {
    const instance = runtime.instances.get(key) as RuntimeInstanceLike | undefined;

    if (instance === undefined || instance.contextDependencies !== undefined) {
      return true;
    }

    if (instance.hooks?.some(isDirtyCapableHookSlot) === true) {
      return true;
    }
  }

  return false;
}

function hasRetainedInstanceDependencies(runtime: RootRuntime, keys: readonly string[]): boolean {
  for (const key of keys) {
    const instance = runtime.instances.get(key) as RuntimeInstanceLike | undefined;

    if (instance === undefined || instance.contextDependencies !== undefined) {
      return true;
    }

    if (instance.hooks !== undefined && instance.hooks.length > 0) {
      return true;
    }
  }

  return false;
}

function isDirtyCapableHookSlot(slot: RuntimeHookSlotLike | undefined): boolean {
  if (slot === undefined) {
    return false;
  }

  return (
    slot.kind !== "ref" && slot.kind !== "memo" && slot.kind !== "debug" && slot.kind !== "effect"
  );
}

function hasUnflushedEffectDependencies(runtime: RootRuntime, keys: readonly string[]): boolean {
  for (const key of keys) {
    const instance = runtime.instances.get(key) as RuntimeInstanceLike | undefined;

    if (instance === undefined) {
      return true;
    }

    if (instance.hooks?.some((slot) => slot?.kind === "effect") === true) {
      return true;
    }
  }

  return false;
}

function hasClassComponentDescendant(fiber: Fiber | undefined): boolean {
  let cursor = fiber;

  while (cursor !== undefined) {
    if (cursor.tag === "class-component") {
      return true;
    }

    if (hasClassComponentDescendant(cursor.child)) {
      return true;
    }

    cursor = cursor.sibling;
  }

  return false;
}

function hasDirtyInstance(
  runtime: RootRuntime | undefined,
  keys: readonly string[],
  prefix?: string,
): boolean {
  if (runtime === undefined) {
    return false;
  }

  if (hasDirtyClassUpdate(runtime, keys, prefix)) {
    return true;
  }

  if (keys.length === 0) {
    return false;
  }

  if (
    keys.some(
      (key) => (runtime.instances.get(key) as { dirty?: boolean } | undefined)?.dirty === true,
    )
  ) {
    return true;
  }

  if (prefix === undefined) {
    return false;
  }

  // Resolve dirty descendants through the prefix index instead of scanning
  // every runtime instance. The previous full-map scan made memo/function
  // bailout O(total instances) per node, i.e. O(n^2) for large keyed lists
  // (js-framework-benchmark update-every-10th / select). The index is the same
  // source of truth used by collectRuntimeInstanceKeys.
  const keysUnderPrefix = runtime.instanceKeysByPrefix.get(prefix);

  if (keysUnderPrefix !== undefined) {
    for (const key of keysUnderPrefix) {
      if ((runtime.instances.get(key) as { dirty?: boolean } | undefined)?.dirty === true) {
        return true;
      }
    }
  }

  return false;
}

function hasUnflushedMountEffectInstance(runtime: RootRuntime, keys: readonly string[]): boolean {
  return keys.some((key) => {
    const instance = runtime.instances.get(key) as
      | { hooks?: readonly (RuntimeEffectHookSlotLike | undefined)[] }
      | undefined;

    return (
      instance?.hooks?.some(
        (slot) => slot?.kind === "effect" && slot.disposed !== true && slot.mounted !== true,
      ) === true
    );
  });
}

function applyRef(ref: unknown, node: unknown): void {
  attachRef(ref, node);
}

function applyChangedRef(previousRef: unknown, nextRef: unknown, node: unknown): void {
  if (Object.is(previousRef, nextRef)) {
    return;
  }

  queueHostRefUpdate(previousRef, node, true);
  queueHostRefUpdate(nextRef, node, false);
}

function queueHostRefUpdate(ref: unknown, node: unknown, detach: boolean): void {
  if (ref === null || ref === undefined) {
    return;
  }

  pendingHostRefUpdates.push({ detach, ref, node });
}

function flushPendingHostRefUpdates(): void {
  const pending = pendingHostRefUpdates.splice(0);
  for (const { detach, ref, node } of pending) {
    if (detach) {
      detachRef(ref, node);
    } else {
      attachRef(ref, node);
    }
  }
}

function isPortalHostContainer(value: unknown): value is ParentNode {
  if (value instanceof Element) {
    return true;
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ParentNode> & {
    ownerDocument?: { createElement?: unknown };
  };
  return (
    typeof candidate.appendChild === "function" &&
    typeof candidate.insertBefore === "function" &&
    typeof candidate.removeChild === "function" &&
    typeof candidate.ownerDocument?.createElement === "function"
  );
}

function withPortalHostOptions(
  options: RenderOptions,
  container: ParentNode,
): RenderOptions & { documentRef?: Document | CustomHostDocument; namespace: HostNamespace } {
  const namespace = namespaceForPortalContainer(container);
  const ownerDocument = (container as { ownerDocument?: unknown }).ownerDocument;
  if (
    typeof ownerDocument === "object" &&
    ownerDocument !== null &&
    typeof (ownerDocument as { createElement?: unknown }).createElement === "function"
  ) {
    return {
      ...options,
      documentRef: ownerDocument as Document | CustomHostDocument,
      namespace,
    };
  }

  return { ...options, namespace };
}

function namespaceForPortalContainer(container: ParentNode): HostNamespace {
  if (container instanceof SVGElement && container.localName !== "foreignObject") {
    return "svg";
  }

  return "html";
}

function committedHostNodesFromState(state: unknown): Node[] {
  return Array.isArray(state) ? (state as Node[]) : [];
}
