import {
  Activity,
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
  Fragment,
  HOST_CHILDREN_ONLY_PROPS_META,
  LAZY_TYPE,
  MEMO_TYPE,
  Profiler,
  REACTIVE_TEXT_BINDING_META,
  STRICT_MODE_TYPE,
  Suspense,
  SuspenseList,
  type ReactCompatElement,
  type ReactCompatPortal,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatNode,
} from "./element.js";
import {
  consumerContext,
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import { applyPostChildFormProps, applyProps } from "./dom-props.js";
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

interface MemoFiberState {
  props: Record<string, unknown>;
  instanceKeys: string[];
  hasDirtyInstanceDependencies: boolean;
  hasUnflushedEffectDependencies: boolean;
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
const pendingHostRefUpdates: { ref: unknown; node: unknown }[] = [];

interface FiberHydrationOptions extends RenderOptions {
  previousNodes?: readonly Node[];
  resumeId?: string;
  consumeResumeMarkers?: boolean;
  namespace?: HostNamespace;
  documentRef?: Document | CustomHostDocument;
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

  if (
    node.type === Fragment ||
    node.type === Profiler ||
    node.type === STRICT_MODE_TYPE
  ) {
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
    typeof node.type === "string" &&
    canRenderHostFiber(node.props.children as ReactCompatNode)
  ) || isFunctionComponentType(node.type);
}

export function renderHostFiberRoot(
  root: FiberRoot,
  element: ReactCompatNode,
  runtime?: RootRuntime,
  options: FiberHydrationOptions = {},
): Fiber {
  const workInProgress = createWorkInProgress(root.current, { children: element });
  const rootDocument = root.container.ownerDocument;
  const result = reconcileHostChild(
    workInProgress,
    root.current.child,
    element,
    runtime,
    options.previousNodes === undefined ? "0" : "",
    { ...options, documentRef: options.documentRef ?? rootDocument },
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
      const commitPath = getRootCommitPath(options);
      if (!hasChildListMutation(finishedWork)) {
        commitHostDirtyChildren(finishedWork.child, root.container, root.container, commitPath, options);
        committed = true;
        return;
      }

      if (
        !finishedWork.childListChanged &&
        finishedWork.subtreeChildListChanged &&
        commitHostKeyedChildListMutation(finishedWork.child, root.container, root.container, commitPath, options)
      ) {
        committed = true;
        return;
      }

      const nodes = commitHostChildren(finishedWork.child, root.container, root.container, commitPath, options);
      syncChildNodes(root.container, nodes);
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
      const eventRoot = root.container;
      const nodes = commitHostChildren(finishedWork.child, scope.parent, eventRoot, "", options);
      syncScopedChildNodes(scope.parent, scope.before, scope.after, nodes);
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

  if (options.consumeResumeMarkers === true) {
    scope.before?.parentNode?.removeChild(scope.before);
    scope.after?.parentNode?.removeChild(scope.after);
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
      : reconcileKeyedRowHostChildren(parent, currentFirstChild, children, options);
  if (rowResult !== undefined) {
    return rowResult;
  }

  const childCount = children === undefined ? 1 : children.length;
  const hasKeyedChildren = children !== undefined && hasKeyedChild(children);
  let existingByKey: Map<string, Fiber> | undefined;
  let currentKeyed: Fiber | undefined = currentFirstChild;
  let currentUnkeyed = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let consumed = 0;
  let skipRemainingKeyedLookup = false;
  const usedCurrentChildren =
    currentFirstChild === undefined ? undefined : new Set<Fiber>();

  for (let index = 0; index < childCount; index += 1) {
    const child = children === undefined ? node : children[index];
    const key = getNodeKey(child);
    let matchedCurrent: Fiber | undefined;

    if (key === undefined) {
      matchedCurrent = currentUnkeyed;
    } else if (skipRemainingKeyedLookup) {
      matchedCurrent = undefined;
    } else if (existingByKey !== undefined) {
      matchedCurrent = existingByKey.get(key);
    } else if (currentKeyed?.key === key) {
      matchedCurrent = currentKeyed;
      currentKeyed = currentKeyed.sibling;
    } else if (
      children !== undefined &&
      currentKeyed?.sibling?.key === key &&
      canSkipSingleDeletedKeyedFiber(children, index, currentKeyed.sibling)
    ) {
      matchedCurrent = currentKeyed.sibling;
      currentKeyed = currentKeyed.sibling.sibling;
    } else {
      if (
        children !== undefined &&
        hasKeyedChildren &&
        canSkipRemainingKeyedLookup(currentKeyed, children, index)
      ) {
        skipRemainingKeyedLookup = true;
        currentKeyed = undefined;
      } else if (hasKeyedChildren) {
        existingByKey = collectExistingKeyedFibers(currentKeyed);
        matchedCurrent = existingByKey.get(key);
      }
    }

    const previousNodes =
      options.previousNodes === undefined
        ? undefined
        : options.previousNodes.slice(consumed);
    const result = createHostFiber(
      parent,
      matchedCurrent,
      child,
      key,
      runtime,
      getReconcileChildPath(path, child, index, options),
      previousNodes === undefined ? options : { ...options, previousNodes },
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
      fiber.tag !== "suspense-list"
      && fiber.memoizedState === undefined
    ) {
      fiber.memoizedState = index;
    }
    previous = fiber;
  }

  markUnusedCurrentChildrenForDeletion(parent, currentFirstChild, usedCurrentChildren);
  parent.childListChanged = childFiberListShapeChanged(currentFirstChild, first);

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
        : (canReuseUnchangedRows ? getReusableKeyedRowHostFiber(matchedCurrent, row) : undefined) ??
          createKeyedRowHostFiber(parent, matchedCurrent, row, options);

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
    subtreeFlags |= fiber.flags | fiber.subtreeFlags;
    subtreeChildListChanged =
      subtreeChildListChanged ||
      fiber.childListChanged ||
      fiber.subtreeChildListChanged;
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
  parent.subtreeFlags = subtreeFlags;
  parent.subtreeChildListChanged = subtreeChildListChanged;
  parent.childListChanged = listShapeChanged;
  if (appendSuffix !== undefined && canStoreAppendSuffixCommitHint(parent)) {
    parent.memoizedState = appendSuffix;
  }
  return { fiber: first, consumed: 0 };
}

function canStoreAppendSuffixCommitHint(parent: Fiber): boolean {
  return (
    parent.tag === "fragment" ||
    parent.tag === "host-component" ||
    parent.tag === "host-root"
  );
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

function getReusableKeyedRowHostFiber(
  current: Fiber,
  row: KeyedRowHostElement,
): Fiber | undefined {
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

function readKeyedRowHostElement(
  node: ReactCompatNode,
  row: KeyedRowHostElement,
): boolean {
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

  return (
    currentRange.end < nextRange.start ||
    nextRange.end < currentRange.start
  );
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

  return start === undefined || previous === undefined
    ? undefined
    : { start, end: previous };
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

  return start === undefined || previous === undefined
    ? undefined
    : { start, end: previous };
}

function parseNumericKey(key: string | undefined): number | undefined {
  if (key === undefined || key.length === 0) {
    return undefined;
  }

  const value = Number(key);

  return Number.isSafeInteger(value) && String(value) === key ? value : undefined;
}

function childFiberListShapeChanged(
  current: Fiber | undefined,
  next: Fiber | undefined,
): boolean {
  let currentCursor = current;
  let nextCursor = next;

  while (currentCursor !== undefined && nextCursor !== undefined) {
    const isSameSlot =
      nextCursor === currentCursor ||
      nextCursor.alternate === currentCursor;

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
  parent.subtreeFlags |= child.flags | child.subtreeFlags;
  parent.subtreeChildListChanged =
    parent.subtreeChildListChanged ||
    child.childListChanged ||
    child.subtreeChildListChanged;
}

function resetFiberRefSubtree(fiber: Fiber): void {
  fiber.hasRefSubtree = false;
}

function includeNodeRef(fiber: Fiber, node: ReactCompatNode): void {
  fiber.hasRefSubtree =
    fiber.hasRefSubtree ||
    (isReactCompatElement(node) && node.ref !== null);
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

  if (!hostOwnPropsEqual(previousProps, nextProps) || hostDirectTextChildChanged(previousProps, nextProps)) {
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
): FiberReconcileResult {
  const result = createHostFiberImpl(parent, current, node, key, runtime, path, options);

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
): FiberReconcileResult {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { fiber: undefined, consumed: 0 };
  }

  if (typeof node === "string" || typeof node === "number") {
    const existing = options.previousNodes?.[0];
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
      reportRecoverable(
        options,
        "text",
        path,
        new Error("Hydration text mismatch."),
      );
    }

    return { fiber, consumed: existing instanceof Text ? 1 : 0 };
  }

  if (Array.isArray(node)) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node)
        : createFiber("fragment", node, key);
    const childResult = reconcileHostChild(
      fiber,
      current?.child,
      node,
      runtime,
      path,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  const memoBailout = tryReuseMemoBailout(current, node, runtime, path, options);
  if (memoBailout !== undefined) {
    return memoBailout;
  }

  if (!isReactCompatElement(node)) {
    if (isReactCompatPortal(node)) {
      return createPortalFiber(parent, current, node, key, runtime, path, options);
    }

    return { fiber: undefined, consumed: 0 };
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
      (node.props as { mode?: unknown }).mode === "hidden"
        ? null
        : node.props.children;
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
    const childResult = renderWithProfiler(
      runtime,
      `${path}.profiler`,
      node.props,
      () =>
        reconcileHostChild(
          fiber,
          current?.tag === "profiler" ? current.child : undefined,
          node.props.children as ReactCompatNode,
          runtime,
          `${path}.profiler`,
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

      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
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
    const rendered = renderWithRootRuntime(runtime, path, () =>
      forwardRefType.render(node.props, node.ref),
      forwardRefType,
    );
    fiber.memoizedState = getDevToolsHookState(runtime, path);
    const childOptions = withHydrationComponentStack(
      options,
      getComponentName(forwardRefType.render),
    );
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
    const previousMemoState =
      current?.tag === "memo"
        ? (current.memoizedState as MemoFiberState | undefined)
        : undefined;
    const fiber =
      current?.tag === "memo" && current.type === memoType
        ? createWorkInProgress(current, node.props)
        : createFiber("memo", node.props, key);
    fiber.type = memoType;

    if (
      previousMemoState !== undefined &&
      !(
        memoStateNeedsDirtyInstanceCheck(previousMemoState) &&
        hasDirtyInstance(runtime, previousMemoState.instanceKeys, memoPath)
      ) &&
      !(
        memoStateNeedsEffectCheck(previousMemoState) &&
        hasUnflushedMountEffectInstance(runtime, previousMemoState.instanceKeys)
      ) &&
      areMemoPropsEqual(memoType, previousMemoState.props, node.props)
    ) {
      markActiveInstanceKeys(runtime, previousMemoState.instanceKeys);
      fiber.child = getSkippedChild(current);
      fiber.memoizedState = previousMemoState;
      return {
        fiber,
        consumed: options.previousNodes?.length ?? 0,
      };
    }

    const renderedElement: ReactCompatElement = {
      ...node,
      type: memoType.type,
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
    const instanceKeys = collectInstanceKeys(runtime, memoPath);
    fiber.memoizedState = {
      props: { ...node.props },
      instanceKeys,
      hasDirtyInstanceDependencies:
        hasDirtyInstanceDependencies(runtime, instanceKeys) ||
        hasClassComponentDescendant(fiber.child),
      hasUnflushedEffectDependencies: hasUnflushedEffectDependencies(
        runtime,
        instanceKeys,
      ),
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
        ...node,
        type: lazyType.resolved,
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
    const fiber =
      current?.tag === "class-component" && current.type === classType
        ? createWorkInProgress(current, node.props)
        : createFiber("class-component", node.props, key);
    fiber.type = classType;
    const previousClassChildKeys = collectInstanceKeys(runtime, `${path}.class`);
    const currentClassInstance =
      current?.tag === "class-component" && current.type === classType
        ? (current.stateNode as ClassComponentInstance)
        : undefined;
    const hasCurrentClassFiber =
      current?.tag === "class-component" && current.type === classType;
    const rendered = renderClassComponentWithRuntime(
      classType,
      node.props,
      runtime,
      path,
      {
        ...(currentClassInstance === undefined
          ? {}
          : { currentInstance: currentClassInstance }),
        hasDirtyDescendant: hasDirtyInstance(
          runtime,
          previousClassChildKeys,
          `${path}.class`,
        ),
        allowSkip: hasCurrentClassFiber,
      },
    );
    applyRef(node.ref, rendered.kind === "skip" ? current?.stateNode : rendered.instance);

    if (rendered.kind === "skip") {
      fiber.child = getSkippedChild(current);
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const childOptions = withHydrationComponentStack(
      options,
      getComponentName(classType),
    );

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
      const fallbackNode = recoverClassComponentError(
        rendered.type,
        rendered.instance,
        error,
      );

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
      !hasDirtyInstance(runtime, previousFunctionState.instanceKeys, path) &&
      !hasUnflushedMountEffectInstance(runtime, previousFunctionState.instanceKeys) &&
      !hasPendingAsyncChild(current?.child)
    ) {
      markActiveInstanceKeys(runtime, previousFunctionState.instanceKeys);
      fiber.child = getSkippedChild(current);
      fiber.memoizedState = current?.memoizedState;
      fiber.stateNode = previousFunctionState;
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const rendered = renderWithRootRuntime(runtime, path, () =>
      (node.type as (props: Record<string, unknown>) => ReactCompatNode)(node.props),
      node.type,
    );
    fiber.memoizedState = getDevToolsHookState(runtime, path);
    const childOptions = withHydrationComponentStack(
      options,
      getComponentName(node.type as Function),
    );
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "function-component" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.0`,
      childOptions,
    );
    fiber.child = childResult.fiber;
    const instanceKeys = collectInstanceKeys(runtime, path);
    fiber.stateNode = {
      element: node,
      props: { ...node.props },
      instanceKeys,
      hasContextDependencies: hasContextDependency(runtime, instanceKeys),
    } satisfies FunctionFiberState;
    return { fiber, consumed: childResult.consumed };
  }

  if (typeof node.type !== "string") {
    return { fiber: undefined, consumed: 0 };
  }

  const elementNamespace = namespaceForHostElement(options.namespace ?? "html", node.type);
  const childNamespace = namespaceForHostChildren(elementNamespace, node.type);
  const fiber =
    current?.tag === "host-component" && current.type === node.type
      ? createWorkInProgress(current, node.props)
      : createFiber("host-component", node.props, key);
  const existing = options.previousNodes?.[0];
  const existingElement = isHostElement(existing) ? existing : undefined;
  const tagMatches =
    existingElement !== undefined &&
    hostElementMatches(existingElement, node.type, elementNamespace);

  if (existing === undefined && options.previousNodes !== undefined) {
    reportMissingHydrationNode(options, path);
  } else if (existing !== undefined && !isHostElement(existing)) {
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

  fiber.type = node.type;
  fiber.stateNode =
    tagMatches
      ? existingElement
      : current?.tag === "host-component" &&
          current.type === node.type &&
          isHostElement(current.stateNode) &&
          hostElementMatches(current.stateNode, node.type, elementNamespace)
        ? current.stateNode
        : createHostElement(getDocumentRef(options), node.type, options.namespace ?? "html");
  fiber.hydrateExisting = tagMatches && options.previousNodes !== undefined;
  const previousChildNodes =
    tagMatches && existingElement !== undefined
      ? Array.from(existingElement.childNodes)
      : undefined;
  const directTextChild =
    shouldUseDirectHostTextChild() && previousChildNodes === undefined
      ? getDirectHostTextChild(node.props.children)
      : undefined;
  if (
    previousChildNodes === undefined &&
    current?.tag === "host-component" &&
    current.type === node.type &&
    Object.is(hostFiberChildrenProp(current.memoizedProps), node.props.children) &&
    !hasDirtyInstance(runtime, [], `${path}.c`) &&
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
    {
      ...options,
      namespace: childNamespace,
      ...(previousChildNodes === undefined ? {} : { previousNodes: previousChildNodes }),
    },
  );
  fiber.child = childResult.fiber;
  if (previousChildNodes !== undefined) {
    reportExtraHydrationNodes(options, `${path}.c`, previousChildNodes, childResult.consumed);
  }
  parent.child ??= fiber;
  return { fiber, consumed: existing === undefined ? 0 : 1 };
}

function isFunctionComponentType(value: unknown): value is (
  props: Record<string, unknown>,
) => ReactCompatNode {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render !==
      "function"
  );
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
    for (const node of commitHostFiber(cursor, parent, eventRoot, joinCommitPath(path, String(index)), options)) {
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

    const props = fiber.pendingProps as Record<string, unknown>;
    const previousProps = fiber.memoizedProps as Record<string, unknown> | undefined;
    const directTextChild =
      fiber.child === undefined && fiber.hydrateExisting !== true
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

    if (isDomHostElement(element) && !propsAreUnchanged && !propsAreChildrenOnly && !textOnlyRowUpdate) {
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
        !(isDomHostElement(element) && childNodes.length === 0 && committedPortalContainers.has(element)) &&
        !(isDomHostElement(element) && shouldPreserveContentEditableChildren(element, props, childNodes))
      ) {
        syncChildNodes(element as ParentNode, childNodes);
      }
    } else if (fiber.subtreeFlags !== NoFlags) {
      commitHostDirtyChildren(fiber.child, element, eventRoot, `${path}.c`, options);
    }

    if (isDomHostElement(element)) {
      applyPostChildFormProps(element, props, previousProps);
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
      const portalOptions = withPortalDocumentRef(options, container);

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
        commitHostDirtyChildren(
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

  if (fiber.subtreeFlags !== NoFlags) {
    commitHostDirtyChildren(fiber.child, parent, eventRoot, path, options);
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

  if (fiber.childListChanged) {
    const mutationParent =
      fiber.tag === "host-component" && isHostElement(fiber.stateNode)
        ? fiber.stateNode
        : parent;

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

      if (!commitHostKeyedChildListMutation(fiber.child, element, eventRoot, `${path}.c`, options)) {
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
  const removed = getSingleRemovedFiber(fiber.alternate?.child, fiber.child);

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

    const props = fiber.pendingProps as Record<string, unknown>;
    const previousProps = fiber.memoizedProps as Record<string, unknown> | undefined;
    const directTextChild =
      fiber.child === undefined && fiber.hydrateExisting !== true
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

    if (isDomHostElement(element) && !propsAreUnchanged && !propsAreChildrenOnly && !textOnlyRowUpdate) {
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
        !(isDomHostElement(element) && childNodes.length === 0 && committedPortalContainers.has(element)) &&
        !(isDomHostElement(element) && shouldPreserveContentEditableChildren(element, props, childNodes))
      ) {
        syncChildNodes(element as ParentNode, childNodes);
      }
    } else if (fiber.subtreeFlags !== NoFlags) {
      commitHostChildren(fiber.child, element, eventRoot, `${path}.c`, options);
    }

    if (isDomHostElement(element)) {
      applyPostChildFormProps(element, props, previousProps);
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
    const portalOptions = withPortalDocumentRef(options, container);
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

  return (
    previous.length > 0 ||
    (Array.isArray(previous) && Array.isArray(next))
  );
}

function hostPropsAreChildrenOnly(props: unknown): boolean {
  if (typeof props !== "object" || props === null) {
    return false;
  }

  for (const key in props) {
    if (
      Object.prototype.hasOwnProperty.call(props, key) &&
      key !== "children"
    ) {
      return false;
    }
  }

  return true;
}

function hostPropsAreKnownChildrenOnly(props: unknown): boolean {
  return (
    typeof props === "object" &&
    props !== null &&
    (props as { [HOST_CHILDREN_ONLY_PROPS_META]?: true })[
      HOST_CHILDREN_ONLY_PROPS_META
    ] === true
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

function subscribeReactiveHostTextBinding(
  props: Record<string, unknown>,
  text: Text,
): void {
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

  const { result: childResult, memoValues, memoValuesByHook } = renderWithStrictModeMemoCapture(
    runtime,
    () =>
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
    renderStrictModeReplay(
      runtime,
      memoValues,
      memoValuesByHook,
      () =>
        reconcileHostChild(
          fiber,
          childResult.fiber,
          element.props.children as ReactCompatNode,
          runtime,
          `${path}.strict`,
          options.previousNodes === undefined
            ? options
            : { ...options, previousNodes: [] },
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

  if (
    previousMemoState === undefined ||
    (
      memoStateNeedsDirtyInstanceCheck(previousMemoState) &&
      hasDirtyInstance(runtime, previousMemoState.instanceKeys, memoPath)
    ) ||
    (
      memoStateNeedsEffectCheck(previousMemoState) &&
      hasUnflushedMountEffectInstance(runtime, previousMemoState.instanceKeys)
    ) ||
    !areMemoPropsEqual(node.type, previousMemoState.props, node.props)
  ) {
    return undefined;
  }

  const fiber = createWorkInProgress(current, node.props);
  fiber.type = node.type;
  markActiveInstanceKeys(runtime, previousMemoState.instanceKeys);
  fiber.child = getSkippedChild(current);
  fiber.memoizedState = previousMemoState;
  return {
    fiber,
    consumed: options.previousNodes?.length ?? 0,
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

  return firstNode instanceof HTMLTemplateElement
    ? remainingNodes
    : [...nodes];
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
    template instanceof HTMLTemplateElement
      ? template.getAttribute("data-msg")
      : null;
  const componentStack =
    template instanceof HTMLTemplateElement
      ? template.getAttribute("data-stck")
      : null;

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
    { ...options, documentRef: portal.container.ownerDocument },
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

function collectExistingKeyedFibers(
  firstChild: Fiber | undefined,
): Map<string, Fiber> {
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

function shouldTrackReconcilePath(
  node: ReactCompatNode,
  options: FiberHydrationOptions,
): boolean {
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

function getComponentName(component: Function): string {
  return component.name === "" ? "Anonymous" : component.name;
}

function joinPath(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
}

function isForwardRefType(
  value: unknown,
): value is {
  $$typeof: typeof FORWARD_REF_TYPE;
  render: (props: Record<string, unknown>, ref: unknown) => ReactCompatNode;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(
  value: unknown,
): value is {
  $$typeof: typeof MEMO_TYPE;
  type: ReactCompatElement["type"];
  compare?: (
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ) => boolean;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

function isLazyType(
  value: unknown,
): value is {
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

function hasDirtyInstanceDependencies(
  runtime: RootRuntime,
  keys: readonly string[],
): boolean {
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

function isDirtyCapableHookSlot(slot: RuntimeHookSlotLike | undefined): boolean {
  if (slot === undefined) {
    return false;
  }

  return (
    slot.kind !== "ref" &&
    slot.kind !== "memo" &&
    slot.kind !== "debug" &&
    slot.kind !== "effect"
  );
}

function hasUnflushedEffectDependencies(
  runtime: RootRuntime,
  keys: readonly string[],
): boolean {
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

  if (keys.some(
    (key) =>
      (runtime.instances.get(key) as { dirty?: boolean } | undefined)?.dirty === true,
  )) {
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
      if (
        (runtime.instances.get(key) as { dirty?: boolean } | undefined)?.dirty ===
        true
      ) {
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

    return instance?.hooks?.some(
      (slot) =>
        slot?.kind === "effect" &&
        slot.disposed !== true &&
        slot.mounted !== true,
    ) === true;
  });
}

function applyRef(ref: unknown, node: unknown): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: unknown }).current = node;
  }
}

function applyChangedRef(previousRef: unknown, nextRef: unknown, node: unknown): void {
  if (Object.is(previousRef, nextRef)) {
    return;
  }

  queueHostRefUpdate(previousRef, null);
  queueHostRefUpdate(nextRef, node);
}

function queueHostRefUpdate(ref: unknown, node: unknown): void {
  if (ref === null || ref === undefined) {
    return;
  }

  pendingHostRefUpdates.push({ ref, node });
}

function flushPendingHostRefUpdates(): void {
  const pending = pendingHostRefUpdates.splice(0);
  for (const { ref, node } of pending) {
    applyRef(ref, node);
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

function withPortalDocumentRef(
  options: RenderOptions,
  container: ParentNode,
): RenderOptions & { documentRef?: Document | CustomHostDocument } {
  const ownerDocument = (container as { ownerDocument?: unknown }).ownerDocument;
  if (
    typeof ownerDocument === "object" &&
    ownerDocument !== null &&
    typeof (ownerDocument as { createElement?: unknown }).createElement === "function"
  ) {
    return {
      ...options,
      documentRef: ownerDocument as Document | CustomHostDocument,
    };
  }

  return options;
}

function committedHostNodesFromState(state: unknown): Node[] {
  return Array.isArray(state) ? state as Node[] : [];
}
