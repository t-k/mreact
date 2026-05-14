import { describe, expect, test } from "vitest";
import { createDevtools, installDevtools } from "../src/index.js";

describe("mreact devtools event bus", () => {
  test("records, publishes, and disposes opt-in devtools events", () => {
    const devtools = createDevtools();
    const seen: unknown[] = [];
    const unsubscribe = devtools.subscribe((event) => {
      seen.push(event);
    });

    devtools.emit({ package: "@reckona/mreact-test", type: "test:event" });
    unsubscribe();
    devtools.emit({ package: "@reckona/mreact-test", type: "test:ignored" });

    expect(seen).toEqual([{ package: "@reckona/mreact-test", type: "test:event" }]);
    expect(devtools.events()).toEqual([
      { package: "@reckona/mreact-test", type: "test:event" },
      { package: "@reckona/mreact-test", type: "test:ignored" },
    ]);
  });

  test("installs and removes the global hook used by runtime packages", () => {
    const devtools = installDevtools();

    globalThis.__mreactDevtools?.emit({ package: "@reckona/mreact-test", type: "global:event" });

    expect(devtools.events()).toEqual([{ package: "@reckona/mreact-test", type: "global:event" }]);

    devtools.dispose();
    expect(globalThis.__mreactDevtools).toBeUndefined();
  });
});
