import {
  createDevtoolsResourceInspector,
  type DevtoolsResourceInspector,
  type DevtoolsResourceRegistration,
} from "./resources.js";

export {
  compareDevtoolsResourceSnapshots,
  createDevtoolsResourceInspector,
  defaultDevtoolsMaxResources,
} from "./resources.js";
export type {
  DevtoolsResourceCensus,
  DevtoolsResourceHandle,
  DevtoolsResourceInspector,
  DevtoolsResourceKind,
  DevtoolsResourceOwnership,
  DevtoolsResourceRecord,
  DevtoolsResourceRegistration,
  DevtoolsResourceSnapshotDiff,
  DevtoolsResourceSnapshotOptions,
} from "./resources.js";

/** Describes one event emitted to the shared mreact devtools bus. */
export interface DevtoolsEvent {
  package: string;
  timestamp?: number;
  type: string;
  [key: string]: unknown;
}

/** Receives devtools events when subscribed to a devtools instance. */
export type DevtoolsListener = (event: DevtoolsEvent) => void;

/** Sets the default number of events retained by a devtools instance. */
export const defaultDevtoolsMaxEvents = 1_000;

/** Configures event retention for `createDevtools()`. */
export interface CreateDevtoolsOptions {
  maxEvents?: number | undefined;
  maxResources?: number | undefined;
}

/** Provides event emission, subscription, history reads, and disposal for mreact devtools. */
export interface Devtools {
  dispose(): void;
  emit(event: DevtoolsEvent): void;
  events(): DevtoolsEvent[];
  resources(): DevtoolsResourceInspector;
  subscribe(listener: DevtoolsListener): () => void;
}

/** Configures installation of a devtools instance on `globalThis`. */
export interface InstallDevtoolsOptions {
  force?: boolean | undefined;
}

declare global {
  // eslint-disable-next-line no-var
  var __mreactDevtools: Devtools | undefined;
}

/** Creates an in-memory devtools event bus. */
export function createDevtools(options: CreateDevtoolsOptions = {}): Devtools {
  const maxEvents = normalizeMaxEvents(options.maxEvents);
  const resources = createDevtoolsResourceInspector(options.maxResources);
  const recorded: DevtoolsEvent[] = [];
  const listeners = new Set<DevtoolsListener>();

  return {
    dispose() {
      listeners.clear();
      recorded.length = 0;
      resources.dispose();
      if (globalThis.__mreactDevtools === this) {
        globalThis.__mreactDevtools = undefined;
      }
    },
    emit(event) {
      if (maxEvents > 0) {
        recorded.push(event);
        if (recorded.length > maxEvents) {
          recorded.splice(0, recorded.length - maxEvents);
        }
      }

      for (const listener of Array.from(listeners)) {
        listener(event);
      }
    },
    events() {
      return [...recorded];
    },
    resources() {
      return resources;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Registers bounded resource metadata with the installed devtools instance when present. */
export function registerMreactDevtoolsResource(input: DevtoolsResourceRegistration): {
  dispose(): void;
  update(patch: Partial<DevtoolsResourceRegistration>): void;
} {
  const inspector = globalThis.__mreactDevtools?.resources?.();
  if (inspector === undefined) {
    return { dispose() {}, update() {} };
  }

  return inspector.register(input);
}

function normalizeMaxEvents(maxEvents: number | undefined): number {
  if (maxEvents === undefined) {
    return defaultDevtoolsMaxEvents;
  }

  return Math.max(0, Math.floor(maxEvents));
}

/** Installs a devtools instance on `globalThis` unless production mode blocks installation. */
export function installDevtools(
  devtools: Devtools = createDevtools(),
  options: InstallDevtoolsOptions = {},
): Devtools {
  if (options.force !== true && currentNodeEnv() === "production") {
    return devtools;
  }

  globalThis.__mreactDevtools = devtools;

  return devtools;
}

function currentNodeEnv(): string | undefined {
  return (
    globalThis as {
      process?: { env?: { NODE_ENV?: string | undefined } | undefined } | undefined;
    }
  ).process?.env?.NODE_ENV;
}

/** Returns the devtools instance installed on `globalThis`, if one exists. */
export function getInstalledDevtools(): Devtools | undefined {
  return globalThis.__mreactDevtools;
}

/** Emits a package-scoped devtools event to the installed global devtools instance. */
export function emitMreactDevtoolsEvent(
  packageName: string,
  event: { type: string } & Record<string, unknown>,
): void {
  globalThis.__mreactDevtools?.emit?.({
    package: packageName,
    timestamp: Date.now(),
    ...event,
  });
}
