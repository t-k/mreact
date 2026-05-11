import { scheduleCallback } from "./fiber-scheduler.js";
import {
  Fragment,
  FORWARD_REF_TYPE,
  MEMO_TYPE,
  isReactCompatElement,
  type ForwardRefType,
  type MemoType,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import {
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";

export interface RootRuntime {
  currentElement?: unknown;
  instances: Map<string, ComponentInstance>;
  activeInstanceKeys: Set<string> | undefined;
  pendingInsertionEffects: PendingEffect[];
  pendingLayoutEffects: PendingEffect[];
  pendingEffects: PendingEffect[];
  externalStoreChecks: ExternalStoreCheck[];
  portalContainers: Set<Element>;
  idCounter: number;
  identifierPrefix: string;
  idMode: "client" | "server";
  strictModeDepth: number;
  rerender(priority?: RenderPriority): void;
  beginRender(): void;
  endRender(committed?: boolean): void;
  flushEffects(): void;
  dispose(): void;
}

interface ComponentInstance {
  hooks: HookSlot[];
  hookIndex: number;
  dirty: boolean;
}

type EffectCallback = () => void | (() => void);

interface PendingEffect {
  slot: Extract<HookSlot, { kind: "effect" }>;
}

interface ExternalStoreCheck {
  getSnapshot: () => unknown;
  value: unknown;
}

type HookSlot =
  | { kind: "state"; value: unknown }
  | { kind: "store"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "memo"; value: unknown; deps?: readonly unknown[] }
  | {
      kind: "effect";
      effectKind: "insertion" | "layout" | "normal";
      callback: EffectCallback;
      deps?: readonly unknown[];
      cleanup?: () => void;
      disposed?: boolean;
      strictReplay?: boolean;
    };

let currentRuntime: RootRuntime | undefined;
let currentInstance: ComponentInstance | undefined;
let syncVersion = 0;
let transitionVersion = 0;
let transitionDepth = 0;
let currentTransitionContext: TransitionContext | undefined;
let transitionRerenderScheduled = false;
let eventBatchDepth = 0;
let currentEventPriority: EventPriority = "default";
let eventRerenderScheduled = false;
const queuedTransitionRerenders = new Map<RootRuntime, TransitionContext>();
const queuedEventRerenders = new Set<RootRuntime>();

export type EventPriority = "discrete" | "continuous" | "default";
export type RenderPriority = "sync" | "transition" | "continuous";

interface TransitionContext {
  syncVersion: number;
  transitionVersion: number;
}

export interface RootRuntimeOptions {
  identifierPrefix?: string;
  idMode?: "client" | "server";
}

export interface RuntimeSnapshot {
  instanceKeys: Set<string>;
  portalContainers: Set<Element>;
  pendingInsertionEffectsLength: number;
  pendingLayoutEffectsLength: number;
  pendingEffectsLength: number;
  idCounter: number;
  identifierPrefix: string;
  idMode: "client" | "server";
  strictModeDepth: number;
}

export function createRootRuntime(
  rerender: (priority?: RenderPriority) => void,
  options: RootRuntimeOptions = {},
): RootRuntime {
  return {
    instances: new Map(),
    activeInstanceKeys: undefined,
    pendingInsertionEffects: [],
    pendingLayoutEffects: [],
    pendingEffects: [],
    externalStoreChecks: [],
    portalContainers: new Set(),
    idCounter: 0,
    identifierPrefix: options.identifierPrefix ?? "",
    idMode: options.idMode ?? "client",
    strictModeDepth: 0,
    rerender,
    beginRender() {
      this.activeInstanceKeys = new Set();
      this.pendingInsertionEffects = [];
      this.pendingLayoutEffects = [];
      this.pendingEffects = [];
      this.externalStoreChecks = [];
    },
    endRender(committed = true) {
      if (committed) {
        cleanupInactiveInstances(this);
      }
      this.activeInstanceKeys = undefined;
      currentRuntime = undefined;
      currentInstance = undefined;
    },
    flushEffects() {
      flushPendingEffects(this.pendingInsertionEffects);
      const strictLayoutEffects = flushPendingEffects(this.pendingLayoutEffects);
      const strictEffects = flushPendingEffects(this.pendingEffects);
      const strictReplayEffects = [...strictLayoutEffects, ...strictEffects];
      cleanupStrictEffects(strictReplayEffects);
      replayStrictEffects(strictReplayEffects);
    },
    dispose() {
      for (const instance of this.instances.values()) {
        cleanupInstance(instance);
      }

      this.pendingLayoutEffects = [];
      this.pendingInsertionEffects = [];
      this.pendingEffects = [];
      for (const container of this.portalContainers) {
        container.replaceChildren();
      }
      this.portalContainers.clear();
    },
  };
}

export function renderWithRootRuntime<T>(
  runtime: RootRuntime,
  path: string,
  render: () => T,
): T {
  const previousRuntime = currentRuntime;
  const previousInstance = currentInstance;
  const instance = runtime.instances.get(path) ?? {
    hooks: [],
    hookIndex: 0,
    dirty: false,
  };
  runtime.instances.set(path, instance);
  runtime.activeInstanceKeys?.add(path);
  instance.hookIndex = 0;
  instance.dirty = false;
  currentRuntime = runtime;
  currentInstance = instance;

  try {
    return render();
  } finally {
    currentRuntime = previousRuntime;
    currentInstance = previousInstance;
  }
}

export function renderWithStrictMode<T>(
  runtime: RootRuntime,
  render: () => T,
): T {
  runtime.strictModeDepth += 1;

  try {
    return render();
  } finally {
    runtime.strictModeDepth -= 1;
  }
}

export function takeRuntimeSnapshot(runtime: RootRuntime): RuntimeSnapshot {
  return {
    instanceKeys: new Set(runtime.instances.keys()),
    portalContainers: new Set(runtime.portalContainers),
    pendingInsertionEffectsLength: runtime.pendingInsertionEffects.length,
    pendingLayoutEffectsLength: runtime.pendingLayoutEffects.length,
    pendingEffectsLength: runtime.pendingEffects.length,
    idCounter: runtime.idCounter,
    identifierPrefix: runtime.identifierPrefix,
    idMode: runtime.idMode,
    strictModeDepth: runtime.strictModeDepth,
  };
}

export function restoreRuntimeSnapshot(
  runtime: RootRuntime,
  snapshot: RuntimeSnapshot,
): void {
  runtime.pendingInsertionEffects.length = snapshot.pendingInsertionEffectsLength;
  runtime.pendingLayoutEffects.length = snapshot.pendingLayoutEffectsLength;
  runtime.pendingEffects.length = snapshot.pendingEffectsLength;
  runtime.idCounter = snapshot.idCounter;
  runtime.identifierPrefix = snapshot.identifierPrefix;
  runtime.idMode = snapshot.idMode;
  runtime.strictModeDepth = snapshot.strictModeDepth;

  for (const key of runtime.instances.keys()) {
    if (!snapshot.instanceKeys.has(key)) {
      runtime.instances.delete(key);
    }
  }

  for (const container of runtime.portalContainers) {
    if (!snapshot.portalContainers.has(container)) {
      container.replaceChildren();
    }
  }

  runtime.portalContainers.clear();
  for (const container of snapshot.portalContainers) {
    runtime.portalContainers.add(container);
  }
}

export function useState<T>(
  initial: T | (() => T),
): [T, (value: T | ((previous: T) => T)) => void] {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = {
      kind: "state",
      value: typeof initial === "function" ? (initial as () => T)() : initial,
    };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "state") {
    throw new Error("Hook order changed between renders.");
  }

  const setState = (value: T | ((previous: T) => T)): void => {
    const nextValue =
      typeof value === "function"
        ? (value as (previous: T) => T)(slot.value as T)
        : value;

    if (Object.is(slot.value, nextValue)) {
      return;
    }

    slot.value = nextValue;
    instance.dirty = true;
    if (transitionDepth === 0) {
      syncVersion += 1;
      if (eventBatchDepth > 0) {
        queueEventRerender(runtime);
        return;
      }
      runtime.rerender("sync");
      return;
    }

    if (currentTransitionContext !== undefined) {
      queueTransitionRerender(runtime, currentTransitionContext);
    }
  };

  return [slot.value as T, setState];
}

export function useReducer<TState, TAction, TInitial = TState>(
  reducer: (state: TState, action: TAction) => TState,
  initialArg: TInitial,
  init?: (initialArg: TInitial) => TState,
): [TState, (action: TAction) => void] {
  const [state, setState] = useState<TState>(() =>
    init === undefined ? (initialArg as unknown as TState) : init(initialArg),
  );
  const reducerRef = useRef(reducer);
  const dispatchRef = useRef<((action: TAction) => void) | undefined>(
    undefined,
  );
  reducerRef.current = reducer;

  if (dispatchRef.current === undefined) {
    dispatchRef.current = (action: TAction): void => {
      setState((previousState) => reducerRef.current(previousState, action));
    };
  }

  return [state, dispatchRef.current];
}

export function useRef<T>(initial: T): { current: T } {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = { kind: "ref", value: { current: initial } };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "ref") {
    throw new Error("Hook order changed between renders.");
  }

  return slot.value as { current: T };
}

export function useId(): string {
  const runtime = requireRuntime();
  const idRef = useRef<string | undefined>(undefined);

  if (idRef.current === undefined) {
    const mode = runtime.idMode === "server" ? "R" : "r";
    idRef.current = `_${runtime.identifierPrefix}${mode}_${runtime.idCounter}_`;
    runtime.idCounter += 1;
  }

  return idRef.current;
}

export function useImperativeHandle<T>(
  ref: unknown,
  create: () => T,
  deps?: readonly unknown[],
): void {
  const handle = useMemo(create, deps);

  useInsertionEffect(() => {
    assignRef(ref, handle);
    return () => {
      assignRef(ref, null);
    };
  }, [ref, handle]);
}

export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "memo") {
    throw new Error("Hook order changed between renders.");
  }

  if (
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps)
  ) {
    const value = factory();
    slot =
      deps === undefined
        ? { kind: "memo", value }
        : { kind: "memo", value, deps };
    instance.hooks[index] = slot;
  }

  return slot.value as T;
}

function assignRef<T>(ref: unknown, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: T | null }).current = value;
  }
}

export function useCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps?: readonly unknown[],
): T {
  return useMemo(() => callback, deps);
}

export function useEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("normal", callback, deps);
}

export function useInsertionEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("insertion", callback, deps);
}

export function useLayoutEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("layout", callback, deps);
}

export function useSyncExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot: () => T = getSnapshot,
): T {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;
  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = { kind: "store", value: getServerSnapshot() };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "store") {
    throw new Error("Hook order changed between renders.");
  }

  const currentSnapshot = getSnapshot();

  if (!Object.is(slot.value, currentSnapshot)) {
    slot.value = currentSnapshot;
  }

  recordExternalStoreCheck(getSnapshot, currentSnapshot);

  useEffect(() => {
    const checkForUpdates = (): void => {
      const nextSnapshot = getSnapshot();

      if (!Object.is(slot.value, nextSnapshot)) {
        slot.value = nextSnapshot;
        runtime.rerender("sync");
      }
    };

    checkForUpdates();
    return subscribe(checkForUpdates);
  }, [subscribe, getSnapshot]);

  return slot.value as T;
}

export function hasStableExternalStores(
  runtime: RootRuntime,
): boolean {
  return runtime.externalStoreChecks.every((check) =>
    Object.is(check.getSnapshot(), check.value),
  );
}

export function renderToString<TProps>(
  component: (props: TProps) => ReactCompatNode,
  props?: TProps,
  options: RootRuntimeOptions = {},
): string {
  const runtime = createRootRuntime(() => undefined, {
    ...options,
    idMode: "server",
  });

  try {
    const rendered = renderWithRootRuntime(runtime, "0", () => component(props as TProps));
    return typeof rendered === "string"
      ? rendered
      : renderNodeToString(rendered, runtime, "0");
  } finally {
    runtime.dispose();
  }
}

function renderNodeToString(
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return escapeHtml(node);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => renderNodeToString(child, runtime, `${path}.${index}`)).join("");
  }

  if (!isReactCompatElement(node)) {
    return "";
  }

  return renderElementToString(node, runtime, path);
}

function renderElementToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  if (typeof element.type === "string") {
    if (element.type === "textarea") {
      return renderTextareaToString(element, runtime, path);
    }

    if (element.type === "select") {
      return renderSelectToString(element, runtime, path);
    }

    const attributes = Object.entries(element.props)
      .sort(([leftName], [rightName]) =>
        element.type === "input"
          ? Number(isInputValueAttribute(leftName)) - Number(isInputValueAttribute(rightName))
          : 0,
      )
      .map(([name, value]) => renderHtmlAttribute(name, value))
      .filter((attribute) => attribute !== "")
      .join("");
    if (voidHtmlElements.has(element.type)) {
      return `<${element.type}${attributes}/>`;
    }

    return `<${element.type}${attributes}>${renderNodeToString(element.props.children, runtime, `${path}.children`)}</${element.type}>`;
  }

  if (element.type === Fragment) {
    return renderNodeToString(element.props.children, runtime, `${path}.fragment`);
  }

  if (isReactCompatProvider(element.type)) {
    return renderWithContextProvider(
      element.type,
      (element.props as { value?: unknown }).value,
      () => renderNodeToString(element.props.children, runtime, `${path}.provider`),
    );
  }

  if (isReactCompatConsumer(element.type)) {
    const children = element.props.children;

    if (typeof children === "function") {
      return renderNodeToString(
        (children as (value: unknown) => ReactCompatNode)(useContext(element.type.context)),
        runtime,
        `${path}.consumer`,
      );
    }

    return "";
  }

  if (isForwardRefType(element.type)) {
    const forwardRefType = element.type;
    return renderNodeToString(
      renderWithRootRuntime(runtime, `${path}.forwardRef`, () =>
        forwardRefType.render(element.props, element.ref),
      ),
      runtime,
      `${path}.forwardRef`,
    );
  }

  if (isMemoType(element.type)) {
    return renderNodeToString(
      {
        ...element,
        type: element.type.type,
      },
      runtime,
      `${path}.memo`,
    );
  }

  if (typeof element.type === "function") {
    const component = element.type as (props: typeof element.props) => ReactCompatNode;
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () => component(element.props)),
      runtime,
      path,
    );
  }

  return "";
}

function renderTextareaToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const value =
    (element.props as { value?: unknown; defaultValue?: unknown }).value ??
    (element.props as { value?: unknown; defaultValue?: unknown }).defaultValue ??
    element.props.children;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<textarea${attributes}>${renderNodeToString(value as ReactCompatNode, runtime, `${path}.textarea`)}</textarea>`;
}

function renderSelectToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const selectedValue =
    (element.props as { value?: unknown; defaultValue?: unknown }).value ??
    (element.props as { value?: unknown; defaultValue?: unknown }).defaultValue;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<select${attributes}>${renderSelectChildrenToString(
    element.props.children,
    selectedValue,
    runtime,
    `${path}.select`,
  )}</select>`;
}

function renderSelectChildrenToString(
  children: ReactCompatNode,
  selectedValue: unknown,
  runtime: RootRuntime,
  path: string,
): string {
  const childArray = Array.isArray(children) ? children : [children];

  return childArray.map((child, index) => {
    if (!isReactCompatElement(child) || child.type !== "option") {
      return renderNodeToString(child, runtime, `${path}.${index}`);
    }

    const optionValue =
      (child.props as { value?: unknown }).value ?? child.props.children;
    const selected =
      selectedValue !== undefined && String(optionValue) === String(selectedValue);
    const props = selected
      ? { ...child.props, selected: true }
      : child.props;

    return renderElementToString({ ...child, props }, runtime, `${path}.${index}`);
  }).join("");
}

function renderHtmlAttribute(name: string, value: unknown): string {
  if (
    name === "children" ||
    name === "key" ||
    name === "ref" ||
    /^on[A-Z]/.test(name) ||
    value === null ||
    value === undefined ||
    value === false ||
    typeof value === "function"
  ) {
    return "";
  }

  if (name === "style") {
    const style = renderStyleAttribute(value);
    return style === "" ? "" : ` style="${escapeHtml(style)}"`;
  }

  if (typeof value === "object") {
    return "";
  }

  const attributeName = toHtmlAttributeName(name);
  if (value === true) {
    return ` ${attributeName}=""`;
  }

  return ` ${attributeName}="${escapeHtml(value)}"`;
}

function isInputValueAttribute(name: string): boolean {
  return name === "value" || name === "defaultValue";
}

function toHtmlAttributeName(name: string): string {
  if (name === "className") {
    return "class";
  }

  if (name === "htmlFor") {
    return "for";
  }

  return name;
}

function renderStyleAttribute(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  return Object.entries(value)
    .filter(([, propertyValue]) =>
      propertyValue !== null &&
      propertyValue !== undefined &&
      typeof propertyValue !== "boolean" &&
      propertyValue !== "",
    )
    .map(([name, propertyValue]) =>
      `${toKebabCase(name)}:${renderCssValue(name, propertyValue)}`,
    )
    .join(";");
}

function renderCssValue(name: string, value: unknown): string {
  if (typeof value !== "number" || value === 0 || isUnitlessCssProperty(name)) {
    return String(value);
  }

  return `${value}px`;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function isUnitlessCssProperty(name: string): boolean {
  return (
    name === "flex" ||
    name === "fontWeight" ||
    name === "lineHeight" ||
    name === "opacity" ||
    name === "order" ||
    name === "zIndex" ||
    name === "zoom"
  );
}

const voidHtmlElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function isForwardRefType(value: unknown): value is ForwardRefType {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(value: unknown): value is MemoType {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

export type TransitionScope = () => void;
export type StartTransition = (scope: TransitionScope) => void;

export function startTransition(scope: TransitionScope): void {
  const context = {
    syncVersion,
    transitionVersion: ++transitionVersion,
  };
  scheduleCallback("low", () => {
    if (!isTransitionContextCurrent(context)) {
      return;
    }

    runTransitionScope(scope, context);
  });
}

export function runWithEventPriority<T>(
  priority: EventPriority,
  callback: () => T,
): T {
  const previousPriority = currentEventPriority;
  currentEventPriority = priority;
  eventBatchDepth += 1;

  try {
    return callback();
  } finally {
    eventBatchDepth -= 1;
    currentEventPriority = previousPriority;

    if (eventBatchDepth === 0) {
      flushEventRerendersForPriority(priority);
    }
  }
}

export function flushSyncUpdates<T>(callback: () => T): T {
  const previousEventBatchDepth = eventBatchDepth;
  const previousEventPriority = currentEventPriority;
  eventBatchDepth = 0;
  currentEventPriority = "discrete";

  try {
    const value = callback();
    flushQueuedEventRerenders();
    return value;
  } finally {
    eventBatchDepth = previousEventBatchDepth;
    currentEventPriority = previousEventPriority;
  }
}

export function useTransition(): [boolean, StartTransition] {
  const [pending, setPending] = useState(false);

  return [
    pending,
    (scope) => {
      setPending(true);
      const context = {
        syncVersion,
        transitionVersion: ++transitionVersion,
      };
      scheduleCallback("low", () => {
        if (!isTransitionContextCurrent(context)) {
          setPending(false);
          return;
        }

        runTransitionScope(() => {
          scope();
          setPending(false);
        }, context);
      });
    },
  ];
}

export function useDeferredValue<T>(value: T): T {
  const [deferredValue, setDeferredValue] = useState(value);

  useEffect(() => {
    if (Object.is(deferredValue, value)) {
      return;
    }

    startTransition(() => {
      setDeferredValue(value);
    });
  }, [value, deferredValue]);

  return Object.is(deferredValue, value) ? value : deferredValue;
}

function runTransitionScope(
  scope: TransitionScope,
  context: TransitionContext,
): void {
  transitionDepth += 1;
  const previousContext = currentTransitionContext;
  currentTransitionContext = context;

  try {
    scope();
  } finally {
    currentTransitionContext = previousContext;
    transitionDepth -= 1;
  }
}

function queueTransitionRerender(
  runtime: RootRuntime,
  context: TransitionContext,
): void {
  queuedTransitionRerenders.set(runtime, context);

  if (transitionRerenderScheduled) {
    return;
  }

  transitionRerenderScheduled = true;
  scheduleCallback("low", flushQueuedTransitionRerenders);
}

function queueEventRerender(runtime: RootRuntime): void {
  queuedEventRerenders.add(runtime);
}

function flushEventRerendersForPriority(priority: EventPriority): void {
  if (priority === "discrete") {
    flushQueuedEventRerenders("sync");
    return;
  }

  if (eventRerenderScheduled || queuedEventRerenders.size === 0) {
    return;
  }

  eventRerenderScheduled = true;
  scheduleCallback(priority === "continuous" ? "normal" : "low", () => {
    eventRerenderScheduled = false;
    flushQueuedEventRerenders(
      priority === "continuous" ? "continuous" : "sync",
    );
  });
}

function flushQueuedEventRerenders(priority: RenderPriority = "sync"): void {
  const runtimes = Array.from(queuedEventRerenders);
  queuedEventRerenders.clear();

  for (const runtime of runtimes) {
    runtime.rerender(priority);
  }
}

function flushQueuedTransitionRerenders(): void {
  transitionRerenderScheduled = false;
  const entries = Array.from(queuedTransitionRerenders.entries());
  queuedTransitionRerenders.clear();

  for (const [runtime, context] of entries) {
    if (isTransitionContextCurrent(context)) {
      runtime.rerender("transition");
    }
  }
}

function isTransitionContextCurrent(context: TransitionContext): boolean {
  return (
    context.syncVersion === syncVersion &&
    context.transitionVersion === transitionVersion
  );
}

function useEffectImpl(
  effectKind: "insertion" | "layout" | "normal",
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "effect") {
    throw new Error("Hook order changed between renders.");
  }

  const shouldRun =
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps);

  if (slot === undefined) {
    slot =
      deps === undefined
        ? { kind: "effect", effectKind, callback }
        : { kind: "effect", effectKind, callback, deps };
    instance.hooks[index] = slot;
  } else {
    slot.effectKind = effectKind;
    slot.callback = callback;
    slot.disposed = false;

    if (deps === undefined) {
      delete slot.deps;
    } else {
      slot.deps = deps;
    }
  }

  slot.strictReplay =
    runtime.strictModeDepth > 0 && effectKind !== "insertion";

  if (shouldRun) {
    const queue =
      effectKind === "insertion"
        ? runtime.pendingInsertionEffects
        : effectKind === "layout"
        ? runtime.pendingLayoutEffects
        : runtime.pendingEffects;
    queue.push({ slot });
  }
}

function recordExternalStoreCheck<T>(
  getSnapshot: () => T,
  value: T,
): void {
  currentRuntime?.externalStoreChecks.push({ getSnapshot, value });
}

function flushPendingEffects(queue: PendingEffect[]): PendingEffect[] {
  const pending = queue.splice(0);
  const strictReplay: PendingEffect[] = [];

  for (const { slot } of pending) {
    if (slot.disposed === true) {
      continue;
    }

    slot.cleanup?.();
    const shouldReplay = slot.strictReplay === true && slot.cleanup === undefined;
    const cleanup = slot.callback();

    if (typeof cleanup === "function") {
      slot.cleanup = cleanup;
    } else {
      delete slot.cleanup;
    }

    if (shouldReplay) {
      strictReplay.push({ slot });
    }
  }

  return strictReplay;
}

function replayStrictEffects(effects: PendingEffect[]): void {
  for (const { slot } of effects) {
    if (slot.disposed === true) {
      continue;
    }

    const cleanup = slot.callback();

    if (typeof cleanup === "function") {
      slot.cleanup = cleanup;
    } else {
      delete slot.cleanup;
    }
  }
}

function cleanupStrictEffects(effects: PendingEffect[]): void {
  for (const { slot } of effects) {
    if (slot.disposed !== true) {
      slot.cleanup?.();
    }
  }
}

function cleanupInactiveInstances(runtime: RootRuntime): void {
  const activeInstanceKeys = runtime.activeInstanceKeys;

  if (activeInstanceKeys === undefined) {
    return;
  }

  for (const [key, instance] of runtime.instances) {
    if (!activeInstanceKeys.has(key)) {
      cleanupInstance(instance);
      runtime.instances.delete(key);
    }
  }
}

function cleanupInstance(instance: ComponentInstance): void {
  for (const slot of instance.hooks) {
    if (slot?.kind === "effect") {
      slot.disposed = true;
      slot.cleanup?.();
      delete slot.cleanup;
    }
  }
}

function requireRuntime(): RootRuntime {
  if (currentRuntime === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return currentRuntime;
}

function requireInstance(): ComponentInstance {
  if (currentInstance === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return currentInstance;
}

function areHookInputsEqual(
  nextDeps: readonly unknown[],
  previousDeps: readonly unknown[],
): boolean {
  if (nextDeps.length !== previousDeps.length) {
    return false;
  }

  for (let index = 0; index < nextDeps.length; index += 1) {
    if (!Object.is(nextDeps[index], previousDeps[index])) {
      return false;
    }
  }

  return true;
}
