import { renderWithRootRuntime, scheduleRuntimeRerender, useLayoutEffect, useRef, type RootRuntime } from "./hooks.js";
import { isReactCompatElement, type ReactCompatElement, type ReactCompatNode } from "./element.js";
import { withHydrationComponentStack, type RenderOptions } from "./hydration.js";
import type { ReconcileNode, ReconcileResult } from "./reconcile-types.js";
import { isThenable } from "./thenable.js";
import { shallowEqual } from "./prop-comparison.js";

const CLASS_COMPONENT_RUNTIME_OWNER = Symbol.for("modular.react.class_component_runtime");

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
  getDerivedStateFromProps?: (
    nextProps: Record<string, unknown>,
    previousState: Record<string, unknown>,
  ) => Record<string, unknown> | null;
  getDerivedStateFromError?: (error: Error) => Record<string, unknown> | null;
}

/** Base class-style component contract with state updates and render lifecycle. */
export interface Component<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  props: P;
  state?: S;
  setState(
    partial:
      | Partial<S>
      | ((
          previousState: Readonly<S>,
          props: Readonly<P>,
        ) => Partial<S> | S | null),
    callback?: () => void,
  ): void;
  forceUpdate(callback?: () => void): void;
  render(): ReactCompatNode;
}

export interface ComponentConstructor {
  new <
    P extends Record<string, unknown> = Record<string, unknown>,
    S extends Record<string, unknown> = Record<string, unknown>,
  >(props: P): Component<P, S>;
  <
    P extends Record<string, unknown> = Record<string, unknown>,
    S extends Record<string, unknown> = Record<string, unknown>,
  >(this: Component<P, S>, props: P): void;
  prototype: Component<any, any>;
}

/** Base class-style component constructor for React-compatible class components. */
export const Component: ComponentConstructor = function Component<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
>(this: Component<P, S>, props: P): void {
  this.props = props;
} as ComponentConstructor;

Component.prototype.setState = function setState<
  P extends Record<string, unknown>,
  S extends Record<string, unknown>,
>(
  this: Component<P, S>,
  partial:
    | Partial<S>
    | ((
        previousState: Readonly<S>,
        props: Readonly<P>,
      ) => Partial<S> | S | null),
  callback?: () => void,
): void {
  enqueueClassSetState(
    this as unknown as ClassComponentInstance,
    partial as Parameters<NonNullable<ClassComponentInstance["setState"]>>[0],
    callback,
  );
};

Component.prototype.forceUpdate = function forceUpdate(
  this: Component,
  callback?: () => void,
): void {
  enqueueClassForceUpdate(this as unknown as ClassComponentInstance, callback);
};

Component.prototype.render = function render(): ReactCompatNode {
  return null;
};

/** Class-style component contract that skips updates for shallow-equal props and state. */
export interface PureComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
> extends Component<P, S> {
  shouldComponentUpdate(nextProps: P, nextState: S): boolean;
}

export interface PureComponentConstructor {
  new <
    P extends Record<string, unknown> = Record<string, unknown>,
    S extends Record<string, unknown> = Record<string, unknown>,
  >(props: P): PureComponent<P, S>;
  <
    P extends Record<string, unknown> = Record<string, unknown>,
    S extends Record<string, unknown> = Record<string, unknown>,
  >(this: PureComponent<P, S>, props: P): void;
  prototype: PureComponent<any, any>;
}

/** Class-style component constructor with shallow prop and state comparison. */
export const PureComponent: PureComponentConstructor = function PureComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
>(this: PureComponent<P, S>, props: P): void {
  (Component as unknown as (this: unknown, props: unknown) => void).call(
    this,
    props,
  );
} as PureComponentConstructor;

PureComponent.prototype = Object.create(Component.prototype) as PureComponent<any, any>;
PureComponent.prototype.constructor = PureComponent;
PureComponent.prototype.shouldComponentUpdate = function shouldComponentUpdate<
  P extends Record<string, unknown>,
  S extends Record<string, unknown>,
>(
  this: PureComponent<P, S>,
  nextProps: P,
  nextState: S,
): boolean {
  return !shallowEqual(this.props, nextProps) || !shallowEqual(this.state ?? {}, nextState ?? {});
};

interface ClassLifecycleSnapshot {
  previousState?: Record<string, unknown>;
  nextState?: Record<string, unknown>;
  force?: boolean;
  snapshot?: unknown;
  callbacks?: (() => void)[];
}

interface ClassUpdateContext {
  runtime: RootRuntime;
  path: string;
}

interface ClassComponentGlobalState {
  lifecycleSnapshots: WeakMap<ClassComponentInstance, ClassLifecycleSnapshot>;
  updateContexts: WeakMap<ClassComponentInstance, ClassUpdateContext>;
  pendingInstancesByRuntime: WeakMap<RootRuntime, Map<string, ClassComponentInstance>>;
  dirtyPathsByRuntime: WeakMap<RootRuntime, Set<string>>;
}

const CLASS_COMPONENT_STATE_KEY = Symbol.for("modular.react.class_component_state");
const classComponentGlobalState =
  ((globalThis as typeof globalThis & Record<symbol, ClassComponentGlobalState | undefined>)[
    CLASS_COMPONENT_STATE_KEY
  ] ??= {
    lifecycleSnapshots: new WeakMap(),
    updateContexts: new WeakMap(),
    pendingInstancesByRuntime: new WeakMap(),
    dirtyPathsByRuntime: new WeakMap(),
  });
const classLifecycleSnapshots = classComponentGlobalState.lifecycleSnapshots;
const classUpdateContexts = classComponentGlobalState.updateContexts;
const classPendingInstancesByRuntime = classComponentGlobalState.pendingInstancesByRuntime;
const classDirtyPathsByRuntime = classComponentGlobalState.dirtyPathsByRuntime;

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
  onInstance?: (instance: ClassComponentInstance) => void,
): ReconcileResult {
  const rendered = renderClassComponentWithRuntime(type, props, runtime, path);

  if (rendered.kind === "skip") {
    return { nodes: previousNodes.slice(0, 1), consumed: previousNodes.length };
  }

  onInstance?.(rendered.instance);
  const childOptions = withHydrationComponentStack(
    options,
    getClassComponentName(type),
  );

  try {
    return reconcileNode(
      parent,
      previousNodes,
      rendered.node,
      runtime,
      `${path}.class`,
      childOptions,
    );
  } catch (error) {
    const fallbackNode = recoverClassComponentError(
      rendered.type,
      rendered.instance,
      error,
      componentStackFromNode(rendered.node, getClassComponentName(rendered.type)),
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
      childOptions,
    );
  }
}

export function renderClassComponentWithRuntime(
  type: ClassComponentType,
  props: Record<string, unknown>,
  runtime: RootRuntime,
  path: string,
  options: {
    currentInstance?: ClassComponentInstance;
    hasDirtyDescendant?: boolean;
    allowSkip?: boolean;
  } = {},
): ClassComponentRenderResult {
  return renderWithRootRuntime(runtime, path, () => {
    const instanceRef = useRef<ClassComponentInstance | undefined>(undefined);
    const didCommitRef = useRef(false);
    const currentInstance =
      options.currentInstance instanceof type
        ? options.currentInstance
        : getPendingClassInstance(runtime, path, type);

    if (
      currentInstance !== undefined &&
      instanceRef.current !== currentInstance
    ) {
      instanceRef.current = currentInstance;
      didCommitRef.current = true;
    }

    const previousInstance = instanceRef.current;
    const hasDifferentType =
      previousInstance !== undefined && !(previousInstance instanceof type);
    const replacedInstance = hasDifferentType ? previousInstance : undefined;

    if (hasDifferentType) {
      classLifecycleSnapshots.delete(previousInstance);
      classUpdateContexts.delete(previousInstance);
      didCommitRef.current = false;
      instanceRef.current = undefined;
    }

    const instance =
      instanceRef.current !== undefined && instanceRef.current instanceof type
        ? instanceRef.current
        : new type(props);
    const previousProps = instance.props;
    const snapshot = classLifecycleSnapshots.get(instance);
    const previousState = snapshot?.previousState ?? instance.state ?? {};

    instanceRef.current = instance;
    installClassUpdateMethods(instance, runtime, path);
    clearPendingClassUpdate(runtime, path);
    const nextState = resolveDerivedStateFromProps(
      type,
      props,
      snapshot?.nextState ?? instance.state ?? {},
    );
    const shouldSkipUpdate =
      didCommitRef.current &&
      snapshot?.force !== true &&
      options.hasDirtyDescendant !== true &&
      options.allowSkip !== false &&
      instance.shouldComponentUpdate?.(props, nextState) === false;

    instance.props = props;
    instance.state = nextState;
    installClassLifecycleEffects(
      instance,
      didCommitRef,
      previousProps,
      previousState,
      shouldSkipUpdate,
      replacedInstance,
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
  }, CLASS_COMPONENT_RUNTIME_OWNER);
}

export function applyDerivedStateFromProps(
  type: ClassComponentType,
  instance: ClassComponentInstance,
  nextProps: Record<string, unknown>,
  previousState: Record<string, unknown>,
): void {
  instance.state = resolveDerivedStateFromProps(type, nextProps, previousState);
}

export function resolveDerivedStateFromProps(
  type: ClassComponentType,
  nextProps: Record<string, unknown>,
  previousState: Record<string, unknown>,
): Record<string, unknown> {
  const derivedState = type.getDerivedStateFromProps?.(nextProps, previousState);

  if (derivedState === undefined || derivedState === null) {
    return previousState;
  }

  return {
    ...previousState,
    ...derivedState,
  };
}

export function recoverClassComponentError(
  type: ClassComponentType,
  instance: ClassComponentInstance,
  error: unknown,
  componentStack = componentStackFromClassType(type),
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

  instance.componentDidCatch?.(normalizedError, {
    componentStack,
  });
  return instance.render();
}

export function isClassComponentType(value: unknown): value is ClassComponentType {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render ===
      "function"
  );
}

function getClassComponentName(type: ClassComponentType): string {
  return type.name === "" ? "Anonymous" : type.name;
}

function componentStackFromClassType(type: ClassComponentType): string {
  return `\n    at ${getClassComponentName(type)}`;
}

function componentStackFromNode(node: ReactCompatNode, boundaryName: string): string {
  const childName = componentNameFromNode(node);
  return childName === undefined || childName === boundaryName
    ? `\n    at ${boundaryName}`
    : `\n    at ${childName}\n    at ${boundaryName}`;
}

function componentNameFromNode(node: ReactCompatNode): string | undefined {
  if (!isReactCompatElement(node)) {
    return undefined;
  }

  if (typeof node.type === "string") {
    return node.type;
  }

  const displayName = (node.type as { displayName?: unknown }).displayName;
  if (typeof displayName === "string" && displayName !== "") {
    return displayName;
  }

  const name = (node.type as { name?: unknown }).name;
  return typeof name === "string" && name !== "" ? name : "Anonymous";
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
  path: string,
): void {
  classUpdateContexts.set(instance, { runtime, path });
  instance.setState = Component.prototype.setState;
  instance.forceUpdate = Component.prototype.forceUpdate;
}

function enqueueClassSetState(
  instance: ClassComponentInstance,
  partial: Parameters<NonNullable<ClassComponentInstance["setState"]>>[0],
  callback?: () => void,
): void {
  const updateContext = classUpdateContexts.get(instance);

  if (updateContext === undefined) {
    callback?.call(instance);
    return;
  }

  const snapshot = classLifecycleSnapshots.get(instance);
  const previousState = snapshot?.previousState ?? instance.state ?? {};
  const baseState = snapshot?.nextState ?? instance.state ?? {};
  const nextPartial =
    typeof partial === "function"
      ? partial(baseState, instance.props)
      : partial;

  const nextState =
    nextPartial === null
      ? baseState
      : {
          ...baseState,
          ...nextPartial,
        };

  const nextSnapshot: ClassLifecycleSnapshot = {
    ...snapshot,
    previousState,
    nextState,
  };
  if (callback !== undefined) {
    nextSnapshot.callbacks = [...(snapshot?.callbacks ?? []), callback.bind(instance)];
  }
  classLifecycleSnapshots.set(instance, nextSnapshot);

  markClassInstanceDirty(instance, updateContext);
}

function enqueueClassForceUpdate(
  instance: ClassComponentInstance,
  callback?: () => void,
): void {
  const updateContext = classUpdateContexts.get(instance);

  if (updateContext === undefined) {
    callback?.call(instance);
    return;
  }

  const snapshot = classLifecycleSnapshots.get(instance);
  const nextSnapshot: ClassLifecycleSnapshot = {
    ...snapshot,
    previousState: instance.state ?? {},
    force: true,
  };
  if (callback !== undefined) {
    nextSnapshot.callbacks = [...(snapshot?.callbacks ?? []), callback.bind(instance)];
  }
  classLifecycleSnapshots.set(instance, nextSnapshot);
  markClassInstanceDirty(instance, updateContext);
}

function markClassInstanceDirty(
  instance: ClassComponentInstance,
  updateContext: ClassUpdateContext,
): void {
  markPendingClassUpdate(instance, updateContext);
  const runtimeInstance = updateContext.runtime.instances.get(updateContext.path) as
    | { dirty?: boolean }
    | undefined;
  if (runtimeInstance !== undefined) {
    runtimeInstance.dirty = true;
  }
  scheduleRuntimeRerender(updateContext.runtime);
}

export function hasDirtyClassUpdate(
  runtime: RootRuntime | undefined,
  keys: readonly string[],
  prefix?: string,
): boolean {
  if (runtime === undefined) {
    return false;
  }

  const dirtyPaths = classDirtyPathsByRuntime.get(runtime);
  if (dirtyPaths === undefined) {
    return false;
  }

  for (const key of keys) {
    if (dirtyPaths.has(key)) {
      return true;
    }
  }

  if (prefix === undefined) {
    return false;
  }

  for (const dirtyPath of dirtyPaths) {
    if (dirtyPath === prefix || dirtyPath.startsWith(`${prefix}.`)) {
      return true;
    }
  }

  return false;
}

function markPendingClassUpdate(
  instance: ClassComponentInstance,
  updateContext: ClassUpdateContext,
): void {
  let pendingInstances = classPendingInstancesByRuntime.get(updateContext.runtime);
  if (pendingInstances === undefined) {
    pendingInstances = new Map();
    classPendingInstancesByRuntime.set(updateContext.runtime, pendingInstances);
  }
  let dirtyPaths = classDirtyPathsByRuntime.get(updateContext.runtime);
  if (dirtyPaths === undefined) {
    dirtyPaths = new Set();
    classDirtyPathsByRuntime.set(updateContext.runtime, dirtyPaths);
  }
  pendingInstances.set(updateContext.path, instance);
  dirtyPaths.add(updateContext.path);
}

function getPendingClassInstance(
  runtime: RootRuntime,
  path: string,
  type: ClassComponentType,
): ClassComponentInstance | undefined {
  const dirtyPaths = classDirtyPathsByRuntime.get(runtime);
  if (dirtyPaths?.has(path) !== true) {
    return undefined;
  }

  const instance = classPendingInstancesByRuntime.get(runtime)?.get(path);
  return instance instanceof type ? instance : undefined;
}

function clearPendingClassUpdate(runtime: RootRuntime, path: string): void {
  classDirtyPathsByRuntime.get(runtime)?.delete(path);
  classPendingInstancesByRuntime.get(runtime)?.delete(path);
}

function installClassLifecycleEffects(
  instance: ClassComponentInstance,
  didCommitRef: { current: boolean },
  previousProps: Record<string, unknown> | undefined,
  previousState: Record<string, unknown>,
  skipUpdate: boolean,
  replacedInstance?: ClassComponentInstance,
): void {
  useLayoutEffect(() => {
    const lifecycleSnapshot = classLifecycleSnapshots.get(instance);

    if (replacedInstance !== undefined) {
      replacedInstance.componentWillUnmount?.();
      classUpdateContexts.delete(replacedInstance);
    }

    if (skipUpdate) {
      runClassUpdateCallbacks(lifecycleSnapshot);
      deleteClassLifecycleSnapshotIfCurrent(instance, lifecycleSnapshot);
      return;
    }

    if (didCommitRef.current) {
      instance.componentDidUpdate?.(
        previousProps ?? {},
        previousState,
        lifecycleSnapshot?.snapshot,
      );
    } else {
      didCommitRef.current = true;
      instance.componentDidMount?.();
    }

    runClassUpdateCallbacks(lifecycleSnapshot);
    deleteClassLifecycleSnapshotIfCurrent(instance, lifecycleSnapshot);
  });

  useLayoutEffect(() => {
    return () => {
      didCommitRef.current = false;
      instance.componentWillUnmount?.();
      classLifecycleSnapshots.delete(instance);
      classUpdateContexts.delete(instance);
    };
  }, []);
}

function runClassUpdateCallbacks(snapshot: ClassLifecycleSnapshot | undefined): void {
  const callbacks = snapshot?.callbacks ?? [];

  for (const callback of callbacks) {
    callback();
  }
}

function deleteClassLifecycleSnapshotIfCurrent(
  instance: ClassComponentInstance,
  snapshot: ClassLifecycleSnapshot | undefined,
): void {
  if (classLifecycleSnapshots.get(instance) === snapshot) {
    classLifecycleSnapshots.delete(instance);
  }
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
