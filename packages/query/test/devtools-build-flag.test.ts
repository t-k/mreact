import { afterEach, expect, test, vi } from "vitest";
import { installDevtools } from "@reckona/mreact-devtools";

const runtime = globalThis as typeof globalThis & { __MREACT_CLIENT_DEVTOOLS__?: boolean };
const originalFlag = Object.getOwnPropertyDescriptor(runtime, "__MREACT_CLIENT_DEVTOOLS__");

afterEach(() => {
  if (originalFlag === undefined) delete runtime.__MREACT_CLIENT_DEVTOOLS__;
  else Object.defineProperty(runtime, "__MREACT_CLIENT_DEVTOOLS__", originalFlag);
  vi.resetModules();
});

test.each([undefined, true, false])(
  "query observation and resource disposal honor the build flag (%s)",
  async (enabled) => {
    if (enabled === undefined) delete runtime.__MREACT_CLIENT_DEVTOOLS__;
    else runtime.__MREACT_CLIENT_DEVTOOLS__ = enabled;
    vi.resetModules();
    const { createQueryClient } = await import("../src/index.js");
    const devtools = installDevtools();
    const client = createQueryClient();
    let unsubscribe: (() => void) | undefined;
    try {
      const received: unknown[] = [];
      unsubscribe = client.subscribe(["profile"], (entry) => received.push(entry.data));
      client.setQueryData(["profile"], "Ada");
      expect(received).toEqual(["Ada"]);
      expect(client.getQueryData(["profile"])).toBe("Ada");
      const activeResources = () =>
        devtools
          .resources()
          .snapshot()
          .filter((entry) => entry.status === "live");
      expect(activeResources().map((entry) => entry.kind)).toEqual(
        enabled === false ? [] : ["subscription"],
      );
      expect(devtools.events().some((event) => event.type === "query:update")).toBe(
        enabled !== false,
      );
      unsubscribe();
      expect(activeResources().map((entry) => entry.kind)).toEqual(
        enabled === false ? [] : ["inactive-query"],
      );
      client.removeQueries();
      expect(activeResources()).toEqual([]);
      expect(client.getQueryData(["profile"])).toBeUndefined();
    } finally {
      unsubscribe?.();
      client.removeQueries();
      devtools.dispose();
    }
  },
);
