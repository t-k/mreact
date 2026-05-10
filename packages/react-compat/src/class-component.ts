import { renderWithRootRuntime, useLayoutEffect, useRef, type RootRuntime } from "./hooks.js";
import type { ReactCompatElement, ReactCompatNode } from "./element.js";
import type { RenderOptions } from "./hydration.js";
import type { ReconcileNode, ReconcileResult } from "./reconcile-types.js";
import { isThenable } from "./thenable.js";

export interface ClassComponentInstance {
  props: Record<string, unknown>;
  state?: Record<string, unknown>;
  setState?: (
    partial:
      | Record<string, unknown>
      | ((
          previousState: Record<string, unknown>,
          props: Record<string, unknown>,
        ) => Record<string, unknown> | null),
    callback?: () => void,
  ) => void;
  forceUpdate?: (callback?: () => void) => void;
  render(): ReactCompatNode;
  componentDidMount?: () => void;
  componentDidUpdate?: (
    previousProps: Record<string, unknown>,
    previousState: Record<string, unknown>,
    snapshot?: unknown,
  ) => void;
  componentWillUnmount?: () => void;
  shouldComponentUpdate?: (
    nextProps: Record<string, unknown>,
    nextState: Record<string, unknown>,
  ) => boolean;
  getSnapshotBeforeUpdate?: (
    previousProps: Record<string, unknown>,
    previousState: Record<string, unknown>,
  ) => unknown;
  componentDidCatch?: (error: Error, info: { componentStack: string }) => void;
}

export interface ClassComponentType {
  new (props: Record<string, unknown>): ClassComponentInstance;
  getDerivedStateFromError?: (error: Error) => Record<string, unknown> | null;
}

interface ClassLifecycleSnapshot {
  previousState?: Record<string, unknown>;
  force?: boolean;
  snapshot?: unknown;
}

const classLifecycleSnapshots = new WeakMap<
  ClassComponentInstance,
  ClassLifecycleSnapshot
>();

export type ClassComponentRenderResult =
  | {
      kind: "render";
      node: ReactCompatNode;
      instance: ClassComponentInstance;
      type: ClassComponentType;
    }
  | { kind: "skip" };

export function reconcileClassComponent(
  parent: ParentNode,
  previousNodes: readonly Node[],
  type: ClassComponentType,
  props: Record<string, unknown>,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions,
  reconcileNode: ReconcileNode,
): ReconcileResult {
  const rendered = renderClassComponentWithRuntime(type, props, runtime, path);

  if (rendered.kind === "skip") {
    return { nodes: previousNodes.slice(0, 1), consumed: previousNodes.length };
  }

  try {
    return reconcileNode(
      parent,
      previousNodes,
      rendered.node,
      runtime,
      `${path}.class`,
      options,
    );
  } catch (error) {
    const fallbackNode = recoverClassComponentError(
      rendered.type,
      rendered.instance,
      error,
    );

    if (fallbackNode === undefined) {
      throw error;
    }

    return reconcileNode(
      parent,
      previousNodes,
      fallbackNode,
      runtime,
      `${path}.class.fallback`,
      options,
    );
  }
}

export function renderClassComponentWithRuntime(
  type: ClassComponentType,
  props: Record<string, unknown>,
  runtime: RootRuntime,
  path: string,
): ClassComponentRenderResult {
  return renderWithRootRuntime(runtime, path, () => {
    const instanceRef = useRef<ClassComponentInstance | undefined>(undefined);
    const instance =
      instanceRef.current !== undefined && instanceRef.current instanceof type
        ? instanceRef.current
        : new type(props);
    const didCommitRef = useRef(false);
    const previousProps = instance.props;
    const snapshot = classLifecycleSnapshots.get(instance);
    const previousState = snapshot?.previousState ?? instance.state ?? {};
    const nextState = instance.state ?? {};

    instanceRef.current = instance;
    installClassUpdateMethods(instance, runtime);
    const shouldSkipUpdate =
      didCommitRef.current &&
      snapshot?.force !== true &&
      instance.shouldComponentUpdate?.(props, nextState) === false;

    instance.props = props;
    installClassLifecycleEffects(
      instance,
      didCommitRef,
      previousProps,
      previousState,
      shouldSkipUpdate,
    );

    if (shouldSkipUpdate) {
      return { kind: "skip" };
    }

    try {
      const node = instance.render();

      if (didCommitRef.current) {
        classLifecycleSnapshots.set(instance, {
          ...classLifecycleSnapshots.get(instance),
          snapshot: instance.getSnapshotBeforeUpdate?.(
            previousProps ?? {},
            previousState,
          ),
        });
      }

      return { kind: "render", node, instance, type };
    } catch (error) {
      const fallbackNode = recoverClassComponentError(type, instance, error);

      if (fallbackNode === undefined) {
        throw error;
      }

      return { kind: "render", node: fallbackNode, instance, type };
    }
  });
}

export function recoverClassComponentError(
  type: ClassComponentType,
  instance: ClassComponentInstance,
  error: unknown,
): ReactCompatNode | undefined {
  if (isThenable(error) || !isErrorBoundaryClass(type, instance)) {
    return undefined;
  }

  const normalizedError =
    error instanceof Error ? error : new Error(String(error));
  const derivedState = type.getDerivedStateFromError?.(normalizedError);

  if (derivedState !== undefined && derivedState !== null) {
    instance.state = {
      ...instance.state,
      ...derivedState,
    };
  }

  instance.componentDidCatch?.(normalizedError, { componentStack: "" });
  return instance.render();
}

export function isClassComponentType(value: unknown): value is ClassComponentType {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render ===
      "function"
  );
}

export function reconcileErrorBoundary(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions,
  reconcileNode: ReconcileNode,
): ReconcileResult {
  try {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.eb`,
      options,
    );
  } catch (error) {
    if (isThenable(error)) {
      throw error;
    }

    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    const onError = element.props.onError;

    if (typeof onError === "function") {
      (onError as (error: Error) => void)(normalizedError);
    }

    const fallback = element.props.fallback;
    const fallbackNode =
      typeof fallback === "function"
        ? (fallback as (error: Error) => ReactCompatNode)(normalizedError)
        : null;

    return reconcileNode(
      parent,
      previousNodes,
      fallbackNode,
      runtime,
      `${path}.eb.fallback`,
      options,
    );
  }
}

function installClassUpdateMethods(
  instance: ClassComponentInstance,
  runtime: RootRuntime,
): void {
  instance.setState = (partial, callback): void => {
    const previousState = instance.state ?? {};
    if (!classLifecycleSnapshots.has(instance)) {
      classLifecycleSnapshots.set(instance, { previousState });
    }
    const nextPartial =
      typeof partial === "function"
        ? partial(previousState, instance.props)
        : partial;

    if (nextPartial !== null) {
      instance.state = {
        ...previousState,
        ...nextPartial,
      };
    }

    runtime.rerender();
    callback?.call(instance);
  };
  instance.forceUpdate = (callback): void => {
    classLifecycleSnapshots.set(instance, {
      previousState: instance.state ?? {},
      force: true,
    });
    runtime.rerender();
    callback?.call(instance);
  };
}

function installClassLifecycleEffects(
  instance: ClassComponentInstance,
  didCommitRef: { current: boolean },
  previousProps: Record<string, unknown> | undefined,
  previousState: Record<string, unknown>,
  skipUpdate: boolean,
): void {
  useLayoutEffect(() => {
    if (skipUpdate) {
      classLifecycleSnapshots.delete(instance);
      return;
    }

    if (didCommitRef.current) {
      instance.componentDidUpdate?.(
        previousProps ?? {},
        previousState,
        classLifecycleSnapshots.get(instance)?.snapshot,
      );
    } else {
      didCommitRef.current = true;
      instance.componentDidMount?.();
    }

    classLifecycleSnapshots.delete(instance);
  });

  useLayoutEffect(() => {
    return () => {
      instance.componentWillUnmount?.();
      classLifecycleSnapshots.delete(instance);
    };
  }, []);
}

function isErrorBoundaryClass(
  type: ClassComponentType,
  instance: ClassComponentInstance,
): boolean {
  return (
    typeof type.getDerivedStateFromError === "function" ||
    typeof instance.componentDidCatch === "function"
  );
}
