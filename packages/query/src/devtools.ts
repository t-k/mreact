interface InstalledDevtools {
  emit?:
    | ((event: { package: string; timestamp: number } & Record<string, unknown>) => void)
    | undefined;
  resources?:
    | (() => {
        register(input: Record<string, unknown>): {
          dispose(): void;
          update(patch: Record<string, unknown>): void;
        };
      })
    | undefined;
}

export interface QueryDevtoolsResourceHandle {
  dispose(): void;
  update(patch: Record<string, unknown>): void;
}

export function emitQueryDevtoolsEvent(event: { type: string } & Record<string, unknown>): void {
  const devtools = getInstalledDevtools();

  if (devtools === undefined) {
    return;
  }

  devtools.emit?.({
    package: "@reckona/mreact-query",
    timestamp: Date.now(),
    ...event,
  });
}

export function registerQueryDevtoolsResource(
  kind: "inactive-query" | "subscription",
  input: Record<string, unknown> = {},
): QueryDevtoolsResourceHandle {
  return (
    getInstalledDevtools()
      ?.resources?.()
      .register({ kind, ...input }) ?? {
      dispose() {},
      update() {},
    }
  );
}

function getInstalledDevtools(): InstalledDevtools | undefined {
  return (globalThis as { __mreactDevtools?: InstalledDevtools | undefined }).__mreactDevtools;
}
