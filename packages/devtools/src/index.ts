export interface DevtoolsEvent {
  package: string;
  timestamp?: number;
  type: string;
  [key: string]: unknown;
}

export type DevtoolsListener = (event: DevtoolsEvent) => void;

export const defaultDevtoolsMaxEvents = 1_000;

export interface CreateDevtoolsOptions {
  maxEvents?: number | undefined;
}

export interface Devtools {
  dispose(): void;
  emit(event: DevtoolsEvent): void;
  events(): DevtoolsEvent[];
  subscribe(listener: DevtoolsListener): () => void;
}

export interface InstallDevtoolsOptions {
  force?: boolean | undefined;
}

declare global {
  // eslint-disable-next-line no-var
  var __mreactDevtools: Devtools | undefined;
}

export function createDevtools(options: CreateDevtoolsOptions = {}): Devtools {
  const maxEvents = normalizeMaxEvents(options.maxEvents);
  const recorded: DevtoolsEvent[] = [];
  const listeners = new Set<DevtoolsListener>();

  return {
    dispose() {
      listeners.clear();
      recorded.length = 0;
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
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function normalizeMaxEvents(maxEvents: number | undefined): number {
  if (maxEvents === undefined) {
    return defaultDevtoolsMaxEvents;
  }

  return Math.max(0, Math.floor(maxEvents));
}

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
  return (globalThis as {
    process?: { env?: { NODE_ENV?: string | undefined } | undefined } | undefined;
  }).process?.env?.NODE_ENV;
}

export function getInstalledDevtools(): Devtools | undefined {
  return globalThis.__mreactDevtools;
}

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
