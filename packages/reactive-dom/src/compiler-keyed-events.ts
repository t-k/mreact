import type { CompilerKeyedRowContext } from "./bind-static-keyed-single-node-list.js";
import type { Dispose } from "./types.js";

/** Compiler-owned dispatcher for one delegated event type in a keyed row list. */
export type CompilerKeyedEventDispatcher<T> = (
  slot: number,
  context: CompilerKeyedRowContext<T>,
  event: Event,
  currentTarget: Element,
) => void;

/** Compiler-owned event program shared by every row in one keyed list. */
export interface CompilerKeyedEventProgram<T> {
  type: string;
  dispatch: CompilerKeyedEventDispatcher<T>;
}

type CompilerKeyedEventSlots = Map<string, number>;

const compilerKeyedEventSlots = new WeakMap<Element, CompilerKeyedEventSlots>();

/** Marks a row element with a compiler-owned event slot without adding a listener. */
export function markCompilerKeyedEventSlot(element: Element, type: string, slot: number): void {
  let slots = compilerKeyedEventSlots.get(element);

  if (slots === undefined) {
    slots = new Map();
    compilerKeyedEventSlots.set(element, slots);
  }

  slots.set(type, slot);
}

export function setupCompilerKeyedEvents<T>(
  parent: ParentNode,
  programs: readonly CompilerKeyedEventProgram<T>[],
  resolveContext: (node: Node) => CompilerKeyedRowContext<T> | undefined,
): Dispose {
  if (
    !("addEventListener" in parent) ||
    !("removeEventListener" in parent) ||
    programs.length === 0
  ) {
    return () => {};
  }

  const eventParent = parent as ParentNode & EventTarget;
  const listeners: Array<{ listener: EventListener; type: string }> = [];
  const programsByType = new Map(programs.map((program) => [program.type, program]));

  for (const [type, program] of programsByType) {
    const listener: EventListener = (event) => {
      dispatchCompilerKeyedEvent(parent, program, event, resolveContext);
    };
    eventParent.addEventListener(type, listener);
    listeners.push({ listener, type });
  }

  return () => {
    for (const { listener, type } of listeners) {
      eventParent.removeEventListener(type, listener);
    }
  };
}

function dispatchCompilerKeyedEvent<T>(
  parent: ParentNode,
  program: CompilerKeyedEventProgram<T>,
  event: Event,
  resolveContext: (node: Node) => CompilerKeyedRowContext<T> | undefined,
): void {
  const path = event.composedPath();

  for (let index = 0; index < path.length; index += 1) {
    const target = path[index];

    if (target === parent) {
      break;
    }
    if (!(target instanceof Element)) {
      continue;
    }

    const slot = compilerKeyedEventSlots.get(target)?.get(program.type);
    if (slot === undefined) {
      continue;
    }

    const context = findCompilerKeyedRowContext(path, index, parent, resolveContext);
    if (context === undefined) {
      continue;
    }

    callCompilerKeyedEvent(program, slot, context, event, target);
    if (event.cancelBubble) {
      break;
    }
  }
}

function findCompilerKeyedRowContext<T>(
  path: readonly EventTarget[],
  startIndex: number,
  parent: ParentNode,
  resolveContext: (node: Node) => CompilerKeyedRowContext<T> | undefined,
): CompilerKeyedRowContext<T> | undefined {
  for (let index = startIndex; index < path.length; index += 1) {
    const target = path[index];

    if (target === parent) {
      return undefined;
    }
    if (target instanceof Node) {
      const context = resolveContext(target);
      if (context !== undefined) {
        return context;
      }
    }
  }

  return undefined;
}

function callCompilerKeyedEvent<T>(
  program: CompilerKeyedEventProgram<T>,
  slot: number,
  context: CompilerKeyedRowContext<T>,
  event: Event,
  currentTarget: Element,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(event, "currentTarget");

  Object.defineProperty(event, "currentTarget", {
    configurable: true,
    value: currentTarget,
  });

  try {
    program.dispatch(slot, context, event, currentTarget);
  } finally {
    if (descriptor === undefined) {
      delete (event as { currentTarget?: EventTarget | null }).currentTarget;
    } else {
      Object.defineProperty(event, "currentTarget", descriptor);
    }
  }
}
