import type { ReactCompatNode } from "./element.js";
import {
  createRootRuntime,
  flushSyncUpdates,
  hasStableExternalStores,
  type RenderPriority,
  type RootRuntime,
} from "./hooks.js";
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
import { commitFiberRoot } from "./fiber-commit.js";
import {
  canRenderHostFiber,
  commitHydratingHostFiberRoot,
  renderHydratingHostFiberRoot,
  renderHostFiberRoot,
} from "./fiber-host.js";
import type { Fiber, FiberRoot } from "./fiber.js";
import { renderIntoContainer } from "./reconciler.js";

export interface Root {
  render(element: ReactCompatNode): void;
  unmount(): void;
}

export interface RootOptions {
  identifierPrefix?: string;
}

export interface HydrateRootOptions {
  onRecoverableError?: (
    error: Error,
    info: HydrationRecoverableErrorInfo,
  ) => void;
  resumeId?: string;
  consumeResumeMarkers?: boolean;
  identifierPrefix?: string;
}

export interface StreamingHydrationRoot {
  hydrate(element: ReactCompatNode, options?: HydrateRootOptions): Root;
  dispose(): void;
}

export interface StreamingHydrationRootOptions {
  manifest?: EventHydrationManifest;
  manifestRoot?: ParentNode;
  fragmentRoot?: ParentNode;
  applyOutOfOrderFragments?: boolean;
  observeOutOfOrderFragments?: boolean;
  selectiveHydration?: SelectiveHydrationOptions;
}

export interface SelectiveHydrationOptions {
  element?: ReactCompatNode;
  options?: HydrateRootOptions | ((event: Event) => HydrateRootOptions);
  boundaries?: Record<string, SelectiveHydrationBoundary>;
}

export interface SelectiveHydrationBoundary {
  element: ReactCompatNode;
  options?: HydrateRootOptions | ((event: Event) => HydrateRootOptions);
}

const legacyRoots = new WeakMap<Element, Root>();

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

        renderIntoContainer(container, runtime.currentElement, runtime);
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

        renderIntoContainer(container, element, runtime);
      });
    },
    unmount() {
      runtime.currentElement = undefined;
      runtime.dispose();
      runtime.instances.clear();
      unmountDevToolsRoot(container);
      container.replaceChildren();
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
    runtime.beginRender();
    let committed = false;

    try {
      for (const portalContainer of runtime.portalContainers) {
        portalContainer.replaceChildren();
      }
      runtime.portalContainers.clear();

      const finishedWork = renderHostFiberRoot(fiberRoot, element, runtime);

      if (!hasStableExternalStores(runtime)) {
        continue;
      }

      fiberRoot.finishedWork = finishedWork;
      commitFiberRoot(fiberRoot);
      commitDevToolsRoot(container, fiberRoot);
      committed = true;
      return finishedWork;
    } finally {
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
    runtime.beginRender();
    let committed = false;

    try {
      for (const portalContainer of runtime.portalContainers) {
        portalContainer.replaceChildren();
      }
      runtime.portalContainers.clear();

      const scope = getHydrationScope(container, options.resumeId);
      const finishedWork = renderHydratingHostFiberRoot(
        fiberRoot,
        element,
        runtime,
        scope,
        options,
      );

      if (!hasStableExternalStores(runtime)) {
        continue;
      }

      commitHydratingHostFiberRoot(fiberRoot, finishedWork, scope, options);
      fiberRoot.current = finishedWork;
      fiberRoot.current.stateNode = fiberRoot;
      fiberRoot.finishedWork = undefined;
      fiberRoot.workInProgress = undefined;
      fiberRoot.workInProgressRootRenderLanes = 0;
      commitDevToolsRoot(container, fiberRoot);
      committed = true;
      return finishedWork;
    } finally {
      runtime.endRender(committed);
      if (committed) {
        runtime.flushEffects();
      }
    }
  }

  throw new Error("Store unstable.");
}

export function render(element: ReactCompatNode, container: Element): void {
  const root = legacyRoots.get(container) ?? createRoot(container);
  legacyRoots.set(container, root);
  root.render(element);
}

export function flushSync<T>(callback: () => T): T {
  return flushSyncUpdates(callback);
}

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
        if (canRenderHostFiber(runtime.currentElement as ReactCompatNode)) {
          return renderHydratingHostFiberIntoContainer(
            container,
            fiberRoot,
            runtime,
            runtime.currentElement as ReactCompatNode,
            renderOptions,
          );
        }

        renderIntoContainer(container, runtime.currentElement, runtime, renderOptions);
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

        renderIntoContainer(container, nextElement, runtime);
      });
    },
    unmount() {
      runtime.currentElement = undefined;
      runtime.dispose();
      runtime.instances.clear();
      unmountDevToolsRoot(container);
      container.replaceChildren();
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

    renderIntoContainer(container, element, runtime, renderOptions);
  });
  replayQueuedHydrationEvents(container);
  return root;
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

export function unmountComponentAtNode(container: Element): boolean {
  const root = legacyRoots.get(container);

  if (root !== undefined) {
    root.unmount();
    legacyRoots.delete(container);
    return true;
  }

  const hadChildren = container.childNodes.length > 0;
  container.replaceChildren();
  return hadChildren;
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
