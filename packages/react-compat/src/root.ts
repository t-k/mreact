import type { ReactCompatNode } from "./element.js";
import {
  createRootRuntime,
  flushSyncUpdates,
  hasStableExternalStores,
  type RenderPriority,
  type RootRuntime,
} from "./hooks.js";
import { collectOwnedChildNodes, removeChildIfPresent } from "./dom-children.js";
import { commitDevToolsRoot, unmountDevToolsRoot } from "./devtools.js";
import {
  applyStreamingHydrationFragments,
  findContainingResumeBoundaryId,
  getHydrationScope,
  type HydrationRecoverableErrorInfo,
  type RenderOptions,
} from "./hydration.js";
import {
  enableEventHydrationManifestReplay,
  readEventHydrationManifest,
  replayQueuedHydrationEvents,
  type EventHydrationManifest,
} from "./event-replay.js";
import {
  ContinuousEventLane,
  SyncLane,
  TransitionLane,
  type Lane,
} from "./fiber-lanes.js";
import {
  createContainerFiberRoot,
  enqueueRootRender,
} from "./fiber-work-loop.js";
import { commitFiberRoot, detachFiberRefs } from "./fiber-commit.js";
import {
  withBatchedDelegatedRootReleases,
  withDeferredDelegatedEventPromotions,
} from "@reckona/mreact-reactive-dom";
import {
  canRenderHostFiber,
  commitHydratingHostFiberRoot,
  disposeHostFiberResources,
  renderHydratingHostFiberRoot,
  renderHostFiberRoot,
} from "./fiber-host.js";
import type { Fiber, FiberRoot } from "./fiber.js";

/** Root controller returned by createRoot and hydrateRoot. */
export interface Root {
  render(element: ReactCompatNode): void;
  unmount(): void;
}

/** Options used when creating a client render root. */
export interface RootOptions {
  identifierPrefix?: string;
}

/** Options used when hydrating server-rendered markup. */
export interface HydrateRootOptions {
  onRecoverableError?: (
    error: Error,
    info: HydrationRecoverableErrorInfo,
  ) => void;
  resumeId?: string;
  consumeResumeMarkers?: boolean;
  identifierPrefix?: string;
}

/** Controller for deferred or selective streaming hydration. */
export interface StreamingHydrationRoot {
  hydrate(element: ReactCompatNode, options?: HydrateRootOptions): Root;
  dispose(): void;
}

/** Options for creating a streaming hydration root. */
export interface StreamingHydrationRootOptions {
  manifest?: EventHydrationManifest;
  manifestRoot?: ParentNode;
  fragmentRoot?: ParentNode;
  applyOutOfOrderFragments?: boolean;
  observeOutOfOrderFragments?: boolean;
  selectiveHydration?: SelectiveHydrationOptions;
}

/** Rules that choose which boundary to hydrate after a captured event. */
export interface SelectiveHydrationOptions {
  element?: ReactCompatNode;
  options?: HydrateRootOptions | ((event: Event) => HydrateRootOptions);
  boundaries?: Record<string, SelectiveHydrationBoundary>;
}

/** Element and options used to hydrate one selective boundary. */
export interface SelectiveHydrationBoundary {
  element: ReactCompatNode;
  options?: HydrateRootOptions | ((event: Event) => HydrateRootOptions);
}

const legacyRoots = new WeakMap<Element, Root>();

/** Creates a root that renders React-compatible nodes into a DOM container. */
export function createRoot(
  container: Element,
  options: RootOptions = {},
): Root {
  const fiberRoot = createContainerFiberRoot(container);
  const runtime = createRootRuntime((priority = "sync") => {
    if (runtime.currentElement !== undefined) {
      enqueueRootRender(fiberRoot, runtime.currentElement, laneForRenderPriority(priority), () => {
        if (canRenderHostFiber(runtime.currentElement as ReactCompatNode)) {
          return renderHostFiberIntoContainer(
            container,
            fiberRoot,
            runtime,
            runtime.currentElement as ReactCompatNode,
          );
        }

        throwUnsupportedRootNode();
      });
    }
  }, options);

  return {
    render(element) {
      runtime.currentElement = element;
      enqueueRootRender(fiberRoot, element, SyncLane, () => {
        if (canRenderHostFiber(element)) {
          return renderHostFiberIntoContainer(container, fiberRoot, runtime, element);
        }

        throwUnsupportedRootNode();
      });
    },
    unmount() {
      withBatchedDelegatedRootReleases(() => {
        runtime.currentElement = undefined;
        runtime.dispose();
        detachFiberRefs(fiberRoot.current);
        disposeHostFiberResources(fiberRoot.current);
        runtime.instances.clear();
        unmountDevToolsRoot(container);
        clearElementChildren(container);
      });
    },
  };
}

function renderHostFiberIntoContainer(
  container: Element,
  fiberRoot: FiberRoot,
  runtime: RootRuntime,
  element: ReactCompatNode,
): Fiber {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const portalSnapshot = beginPortalRender(runtime);
    runtime.beginRender();
    let committed = false;

    try {
      const deferred = withDeferredDelegatedEventPromotions(() =>
        renderHostFiberRoot(fiberRoot, element, runtime),
      );
      const finishedWork = deferred.value;

      if (runtime.renderPhaseUpdate) {
        runtime.renderPhaseUpdate = false;
        continue;
      }

      if (!hasStableExternalStores(runtime)) {
        continue;
      }

      fiberRoot.finishedWork = finishedWork;
      withBatchedDelegatedRootReleases(() => commitFiberRoot(fiberRoot));
      collectPortalNodes(fiberRoot.current, runtime, portalSnapshot);
      removeStalePortalNodes(portalSnapshot, runtime);
      deferred.promote?.();
      commitDevToolsRoot(container, fiberRoot);
      runtime.idMode = "client";
      committed = true;
      return finishedWork;
    } finally {
      if (!committed) {
        restorePortalRender(runtime, portalSnapshot);
      }
      runtime.endRender(committed);
      if (committed) {
        runtime.flushEffects();
      }
    }
  }

  throw new Error("Store unstable.");
}

function renderHydratingHostFiberIntoContainer(
  container: Element,
  fiberRoot: FiberRoot,
  runtime: RootRuntime,
  element: ReactCompatNode,
  options: RenderOptions & {
    resumeId?: string;
    consumeResumeMarkers?: boolean;
  },
): Fiber {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const portalSnapshot = beginPortalRender(runtime);
    runtime.beginRender();
    let committed = false;

    try {
      const scope = getHydrationScope(container, options.resumeId);
      const deferred = withDeferredDelegatedEventPromotions(() =>
        renderHydratingHostFiberRoot(
          fiberRoot,
          element,
          runtime,
          scope,
          options,
        ),
      );
      const finishedWork = deferred.value;

      if (runtime.renderPhaseUpdate) {
        runtime.renderPhaseUpdate = false;
        continue;
      }

      if (!hasStableExternalStores(runtime)) {
        continue;
      }

      withBatchedDelegatedRootReleases(() =>
        commitHydratingHostFiberRoot(fiberRoot, finishedWork, scope, options)
      );
      fiberRoot.current = finishedWork;
      fiberRoot.current.stateNode = fiberRoot;
      fiberRoot.finishedWork = undefined;
      fiberRoot.workInProgress = undefined;
      fiberRoot.workInProgressRootRenderLanes = 0;
      collectPortalNodes(fiberRoot.current, runtime, portalSnapshot);
      removeStalePortalNodes(portalSnapshot, runtime);
      deferred.promote?.();
      commitDevToolsRoot(container, fiberRoot);
      runtime.idMode = "client";
      committed = true;
      return finishedWork;
    } finally {
      if (!committed) {
        restorePortalRender(runtime, portalSnapshot);
      }
      runtime.endRender(committed);
      if (committed) {
        runtime.flushEffects();
      }
    }
  }

  throw new Error("Store unstable.");
}

/** Renders a React-compatible node into a legacy root container. */
export function render(element: ReactCompatNode, container: Element): void {
  const root = legacyRoots.get(container) ?? createRoot(container);
  legacyRoots.set(container, root);
  root.render(element);
}

/** Runs updates synchronously and flushes pending reactive work before returning. */
export function flushSync<T>(callback: () => T): T {
  return flushSyncUpdates(callback);
}

/** Hydrates server-rendered markup with a React-compatible element tree. */
export function hydrateRoot(
  container: Element,
  element: ReactCompatNode,
  options: HydrateRootOptions = {},
): Root {
  const fiberRoot = createContainerFiberRoot(container);
  const renderOptions: RenderOptions & {
    resumeId?: string;
    consumeResumeMarkers?: boolean;
  } = {
    hydration:
      options.onRecoverableError === undefined
        ? {}
        : { onRecoverableError: options.onRecoverableError },
    ...(options.resumeId === undefined ? {} : { resumeId: options.resumeId }),
    ...(options.consumeResumeMarkers === undefined
      ? {}
      : { consumeResumeMarkers: options.consumeResumeMarkers }),
  };
  const runtime = createRootRuntime((priority = "sync") => {
    if (runtime.currentElement !== undefined) {
      enqueueRootRender(fiberRoot, runtime.currentElement, laneForRenderPriority(priority), () => {
        const useHydratingRerender =
          runtime.idMode === "server" ||
          renderOptions.resumeId !== undefined ||
          renderOptions.consumeResumeMarkers !== undefined;
        if (canRenderHostFiber(runtime.currentElement as ReactCompatNode)) {
          return useHydratingRerender
            ? renderHydratingHostFiberIntoContainer(
                container,
                fiberRoot,
                runtime,
                runtime.currentElement as ReactCompatNode,
                renderOptions,
              )
            : renderHostFiberIntoContainer(
                container,
                fiberRoot,
                runtime,
                runtime.currentElement as ReactCompatNode,
              );
        }

        throwUnsupportedRootNode();
      });
    }
  }, {
    ...(options.identifierPrefix === undefined
      ? {}
      : { identifierPrefix: options.identifierPrefix }),
    idMode: "server",
  });

  const root: Root = {
    render(nextElement) {
      runtime.currentElement = nextElement;
      enqueueRootRender(fiberRoot, nextElement, SyncLane, () => {
        if (canRenderHostFiber(nextElement)) {
          return renderHostFiberIntoContainer(container, fiberRoot, runtime, nextElement);
        }

        throwUnsupportedRootNode();
      });
    },
    unmount() {
      withBatchedDelegatedRootReleases(() => {
        runtime.currentElement = undefined;
        runtime.dispose();
        detachFiberRefs(fiberRoot.current);
        disposeHostFiberResources(fiberRoot.current);
        runtime.instances.clear();
        unmountDevToolsRoot(container);
        clearElementChildren(container);
      });
    },
  };

  runtime.currentElement = element;
  enqueueRootRender(fiberRoot, element, SyncLane, () => {
    if (canRenderHostFiber(element)) {
      return renderHydratingHostFiberIntoContainer(
        container,
        fiberRoot,
        runtime,
        element,
        renderOptions,
    );
  }

  throwUnsupportedRootNode();
  });
  replayQueuedHydrationEvents(container);
  return root;
}

function throwUnsupportedRootNode(): never {
  throw new Error("Unsupported react-compat root node. Pass a valid React-compatible element, portal, fragment, primitive, array, or nullish value.");
}

function laneForRenderPriority(priority: RenderPriority): Lane {
  if (priority === "transition") {
    return TransitionLane;
  }

  if (priority === "continuous") {
    return ContinuousEventLane;
  }

  return SyncLane;
}

/** Creates a root that can hydrate streamed or selectively revealed markup. */
export function createStreamingHydrationRoot(
  container: Element,
  options: StreamingHydrationRootOptions = {},
): StreamingHydrationRoot {
  const fragmentRoot = options.fragmentRoot ?? container.ownerDocument;
  const manifestRoot = options.manifestRoot ?? container;
  const manifest = options.manifest ?? readEventHydrationManifest(manifestRoot);

  if (options.applyOutOfOrderFragments !== false) {
    applyStreamingHydrationFragments(fragmentRoot);
  }

  let hydratedRoot: Root | undefined;
  const hydrate = (
    element: ReactCompatNode,
    hydrateOptions: HydrateRootOptions = {},
  ): Root => {
    if (options.applyOutOfOrderFragments !== false) {
      applyStreamingHydrationFragments(fragmentRoot);
    }

    const root = hydrateRoot(container, element, hydrateOptions);
    hydratedRoot = root;
    disposeReplayCaptureOnce();
    return root;
  };
  const disposeReplayCapture = enableEventHydrationManifestReplay(
    container,
    manifest,
    {
      onCapturedEvent(event, target) {
        const selectiveHydration = options.selectiveHydration;
        const selectiveBoundary = resolveSelectiveHydrationBoundary(
          container,
          event,
          target,
          manifest,
          selectiveHydration,
        );

        if (selectiveBoundary === undefined || hydratedRoot !== undefined) {
          return;
        }

        hydrate(
          selectiveBoundary.element,
          resolveSelectiveHydrationOptions(event, selectiveBoundary),
        );
      },
    },
  );
  const observer =
    options.observeOutOfOrderFragments === true &&
    typeof MutationObserver !== "undefined" &&
    fragmentRoot instanceof Node
      ? new MutationObserver(() => {
          applyStreamingHydrationFragments(fragmentRoot);
        })
      : undefined;
  let replayDisposed = false;

  observer?.observe(fragmentRoot as Node, { childList: true, subtree: true });

  const disposeReplayCaptureOnce = (): void => {
    if (!replayDisposed) {
      disposeReplayCapture();
      replayDisposed = true;
    }
  };

  return {
    hydrate,
    dispose() {
      disposeReplayCaptureOnce();
      observer?.disconnect();
    },
  };
}

/** Unmounts a legacy root from a container and reports whether anything was removed. */
export function unmountComponentAtNode(container: Element): boolean {
  const root = legacyRoots.get(container);

  if (root !== undefined) {
    root.unmount();
    legacyRoots.delete(container);
    return true;
  }

  const hadChildren = container.childNodes.length > 0;
  clearElementChildren(container);
  return hadChildren;
}

function clearElementChildren(element: Element): void {
  if (typeof element.replaceChildren === "function") {
    element.replaceChildren();
    return;
  }

  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
}

function collectPortalNodes(
  fiber: Fiber | undefined,
  runtime: RootRuntime,
  snapshot: PortalRenderSnapshot,
): void {
  if (
    fiber === undefined ||
    (runtime.portalContainers.size === 0 && snapshot.containers.size === 0)
  ) {
    return;
  }

  const deferredSiblings: Fiber[] = [];
  let cursor: Fiber | undefined = fiber;

  while (cursor !== undefined) {
    if (cursor.tag === "portal" && cursor.stateNode instanceof Element) {
      const nodes = Array.isArray(cursor.memoizedState)
        ? cursor.memoizedState.filter((node): node is Node => node instanceof Node)
        : [];
      runtime.portalContainers.add(cursor.stateNode);
      const ownedNodes = runtime.portalNodes.get(cursor.stateNode) ?? new Set<Node>();
      for (const node of nodes) {
        ownedNodes.add(node);
      }
      runtime.portalNodes.set(cursor.stateNode, ownedNodes);
    }

    if (cursor.child !== undefined) {
      if (cursor.sibling !== undefined) {
        deferredSiblings.push(cursor.sibling);
      }
      cursor = cursor.child;
      continue;
    }

    cursor = cursor.sibling ?? deferredSiblings.pop();
  }
}

interface PortalRenderSnapshot {
  containers: Set<Element>;
  nodes: Map<Element, Set<Node>>;
}

function beginPortalRender(runtime: RootRuntime): PortalRenderSnapshot {
  const snapshot = {
    containers: new Set(runtime.portalContainers),
    nodes: clonePortalNodes(runtime.portalNodes),
  };
  runtime.portalContainers.clear();
  runtime.portalNodes.clear();
  return snapshot;
}

function restorePortalRender(
  runtime: RootRuntime,
  snapshot: PortalRenderSnapshot,
): void {
  runtime.portalContainers = snapshot.containers;
  runtime.portalNodes = snapshot.nodes;
}

function removeStalePortalNodes(
  snapshot: PortalRenderSnapshot,
  runtime: RootRuntime,
): void {
  for (const container of snapshot.containers) {
    const nodes = snapshot.nodes.get(container) ?? new Set(collectOwnedChildNodes(container));
    const currentNodes = runtime.portalNodes.get(container);

    for (const node of nodes) {
      if (currentNodes?.has(node) !== true) {
        removeChildIfPresent(container, node);
      }
    }
  }
}

function clonePortalNodes(source: Map<Element, Set<Node>>): Map<Element, Set<Node>> {
  const clone = new Map<Element, Set<Node>>();

  for (const [container, nodes] of source) {
    clone.set(container, new Set(nodes));
  }

  return clone;
}

function resolveSelectiveHydrationBoundary(
  container: Element,
  event: Event,
  target: EventTarget,
  manifest: EventHydrationManifest | undefined,
  selectiveHydration: SelectiveHydrationOptions | undefined,
): SelectiveHydrationBoundary | undefined {
  if (selectiveHydration === undefined) {
    return undefined;
  }

  const resumeId = resolveSelectiveHydrationResumeId(
    container,
    event,
    target,
    manifest,
  );
  const boundary =
    resumeId === undefined ? undefined : selectiveHydration.boundaries?.[resumeId];

  if (boundary !== undefined && resumeId !== undefined) {
    return {
      element: boundary.element,
      options: boundary.options ?? { resumeId, consumeResumeMarkers: true },
    };
  }

  if (selectiveHydration.element === undefined) {
    return undefined;
  }

  return {
    element: selectiveHydration.element,
    ...(selectiveHydration.options === undefined
      ? {}
      : { options: selectiveHydration.options }),
  };
}

function resolveSelectiveHydrationOptions(
  event: Event,
  boundary: SelectiveHydrationBoundary,
): HydrateRootOptions {
  return typeof boundary.options === "function"
    ? boundary.options(event)
    : boundary.options ?? {};
}

function resolveSelectiveHydrationResumeId(
  container: Element,
  event: Event,
  target: EventTarget,
  manifest: EventHydrationManifest | undefined,
): string | undefined {
  if (!(target instanceof Node) || manifest === undefined) {
    return undefined;
  }

  const containingResumeId = findContainingResumeBoundaryId(container, target);

  if (containingResumeId === undefined) {
    return undefined;
  }

  return manifest.events.some(
    (entry) =>
      entry.event === event.type &&
      getManifestResumeId(entry.id) === containingResumeId,
  )
    ? containingResumeId
    : undefined;
}

function getManifestResumeId(id: string): string {
  return id.split(":")[0] ?? id;
}
