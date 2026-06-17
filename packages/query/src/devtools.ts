interface InstalledDevtools {
  emit?:
    | ((event: { package: string; timestamp: number } & Record<string, unknown>) => void)
    | undefined;
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

function getInstalledDevtools(): InstalledDevtools | undefined {
  return (globalThis as { __mreactDevtools?: InstalledDevtools | undefined }).__mreactDevtools;
}
