export interface DevtoolsEvent {
  package: string;
  timestamp?: number;
  type: string;
  [key: string]: unknown;
}

export type DevtoolsListener = (event: DevtoolsEvent) => void;

export interface Devtools {
  dispose(): void;
  emit(event: DevtoolsEvent): void;
  events(): DevtoolsEvent[];
  subscribe(listener: DevtoolsListener): () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __mreactDevtools: Devtools | undefined;
}

export function createDevtools(): Devtools {
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
      recorded.push(event);

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

export function installDevtools(devtools: Devtools = createDevtools()): Devtools {
  globalThis.__mreactDevtools = devtools;

  return devtools;
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
