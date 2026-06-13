import { afterEach, describe, expect, it } from "vitest";
import {
  createQueryClient,
  syncQueryClientAcrossTabs,
} from "../src/index.js";

describe("cross-tab query sync outside the browser", () => {
  const originalBroadcastChannelDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "BroadcastChannel",
  );

  afterEach(() => {
    if (originalBroadcastChannelDescriptor === undefined) {
      delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    } else {
      Object.defineProperty(globalThis, "BroadcastChannel", originalBroadcastChannelDescriptor);
    }
  });

  it("is a no-op when BroadcastChannel exists without a browser document", async () => {
    installMemoryBroadcastChannel();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      broadcastQueryData: true,
      channel: "mreact-query:v1:server-request",
      includeQuery: (queryKey) => queryKey[0] === "session",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      broadcastQueryData: true,
      channel: "mreact-query:v1:server-request",
      includeQuery: (queryKey) => queryKey[0] === "session",
    });

    try {
      first.setQueryData(["session"], { token: "request-a" });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(second.getQueryData(["session"])).toBeUndefined();
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });
});

function installMemoryBroadcastChannel(): void {
  const channels = new Map<string, Set<MemoryBroadcastChannel>>();

  class MemoryBroadcastChannel extends EventTarget {
    readonly name: string;

    constructor(name: string) {
      super();
      this.name = name;
      const current = channels.get(name) ?? new Set<MemoryBroadcastChannel>();
      current.add(this);
      channels.set(name, current);
    }

    close(): void {
      channels.get(this.name)?.delete(this);
    }

    postMessage(data: unknown): void {
      for (const channel of channels.get(this.name) ?? []) {
        if (channel === this) {
          continue;
        }
        queueMicrotask(() => {
          channel.dispatchEvent(new MessageEvent("message", { data }));
        });
      }
    }
  }

  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: MemoryBroadcastChannel,
  });
}
