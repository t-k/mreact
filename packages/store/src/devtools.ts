import { emitMreactDevtoolsEvent } from "@reckona/mreact-devtools";

export function emitStoreDevtoolsEvent(event: { type: string } & Record<string, unknown>): void {
  emitMreactDevtoolsEvent("@reckona/mreact-store", event);
}
