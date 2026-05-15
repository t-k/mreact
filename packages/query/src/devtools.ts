import { emitMreactDevtoolsEvent } from "@reckona/mreact-devtools";

export function emitQueryDevtoolsEvent(event: { type: string } & Record<string, unknown>): void {
  emitMreactDevtoolsEvent("@reckona/mreact-query", event);
}
