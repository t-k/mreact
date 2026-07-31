import type { CompilerKeyedRowContext } from "./bind-static-keyed-single-node-list.js";
import { bindEvent } from "./bind-event.js";
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

const compilerKeyedEventType = Symbol("compilerKeyedEventType");
const compilerKeyedEventSlot = Symbol("compilerKeyedEventSlot");
const compilerKeyedExtraEventSlots = Symbol("compilerKeyedExtraEventSlots");
type CompilerKeyedEventElement = Element & {
  [compilerKeyedEventType]?: string;
  [compilerKeyedEventSlot]?: number;
  [compilerKeyedExtraEventSlots]?: Map<string, number>;
};

/** Marks a row element with a compiler-owned event slot without adding a listener. */
export function markCompilerKeyedEventSlot(element: Element, type: string, slot: number): void {
  const target = element as CompilerKeyedEventElement;

  if (target[compilerKeyedEventType] === undefined || target[compilerKeyedEventType] === type) {
    target[compilerKeyedEventType] = type;
    target[compilerKeyedEventSlot] = slot;
    return;
  }

  (target[compilerKeyedExtraEventSlots] ??= new Map()).set(type, slot);
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
  const disposers: Dispose[] = [];
  const programsByType = new Map(programs.map((program) => [program.type, program]));

  for (const [type, program] of programsByType) {
    const listener: EventListener = (event) => {
      dispatchCompilerKeyedEvent(parent, program, event, resolveContext);
    };
    disposers.push(
      bindEvent(eventParent as HTMLElement, type as keyof HTMLElementEventMap, listener, {
        direct: true,
      }),
    );
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
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

    const slot = readCompilerKeyedEventSlot(target, program.type);
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

function readCompilerKeyedEventSlot(element: Element, type: string): number | undefined {
  const target = element as CompilerKeyedEventElement;
  return target[compilerKeyedEventType] === type
    ? target[compilerKeyedEventSlot]
    : target[compilerKeyedExtraEventSlots]?.get(type);
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
