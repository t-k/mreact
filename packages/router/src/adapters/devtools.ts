import { emitMreactDevtoolsEvent } from "@reckona/mreact-devtools";

export function emitRouterDevtoolsEvent(event: { type: string } & Record<string, unknown>): void {
  emitMreactDevtoolsEvent("@reckona/mreact-router", event);
}
