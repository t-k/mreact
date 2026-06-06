import { emitMreactDevtoolsEvent, getInstalledDevtools } from "@reckona/mreact-devtools";

export function emitQueryDevtoolsEvent(event: { type: string } & Record<string, unknown>): void {
  if (getInstalledDevtools() === undefined) {
    return;
  }

  emitMreactDevtoolsEvent("@reckona/mreact-query", event);
}
