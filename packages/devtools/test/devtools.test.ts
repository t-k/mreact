import { describe, expect, test } from "vitest";
import { createDevtools, emitMreactDevtoolsEvent, installDevtools } from "../src/index.js";

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

  test("retains only the configured event history while delivering every live event", () => {
    const devtools = createDevtools({ maxEvents: 3 });
    const seen: string[] = [];
    devtools.subscribe((event) => {
      seen.push(event.type);
    });

    for (let index = 0; index < 5; index += 1) {
      devtools.emit({ package: "@reckona/mreact-test", type: `test:${index}` });
    }

    expect(seen).toEqual(["test:0", "test:1", "test:2", "test:3", "test:4"]);
    expect(devtools.events().map((event) => event.type)).toEqual(["test:2", "test:3", "test:4"]);
  });

  test("dispose clears retained events even when event history is capped", () => {
    const devtools = createDevtools({ maxEvents: 1 });

    devtools.emit({ package: "@reckona/mreact-test", type: "test:first" });
    devtools.emit({ package: "@reckona/mreact-test", type: "test:second" });
    devtools.dispose();

    expect(devtools.events()).toEqual([]);
  });

  test("installs and removes the global hook used by runtime packages", () => {
    const devtools = installDevtools();

    globalThis.__mreactDevtools?.emit({ package: "@reckona/mreact-test", type: "global:event" });

    expect(devtools.events()).toEqual([{ package: "@reckona/mreact-test", type: "global:event" }]);

    devtools.dispose();
    expect(globalThis.__mreactDevtools).toBeUndefined();
  });

  test("emits timestamped package events through one shared helper", () => {
    const devtools = installDevtools();

    emitMreactDevtoolsEvent("@reckona/mreact-test", {
      id: 1,
      type: "test:shared-helper",
    });

    expect(devtools.events()).toEqual([
      expect.objectContaining({
        id: 1,
        package: "@reckona/mreact-test",
        timestamp: expect.any(Number),
        type: "test:shared-helper",
      }),
    ]);
    devtools.dispose();
  });

  test("production install is a no-op unless explicitly forced", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const devtools = installDevtools();
      emitMreactDevtoolsEvent("@reckona/mreact-test", {
        secret: "pii",
        type: "test:prod",
      });

      expect(globalThis.__mreactDevtools).toBeUndefined();
      expect(devtools.events()).toEqual([]);

      const forced = installDevtools(createDevtools(), { force: true });
      emitMreactDevtoolsEvent("@reckona/mreact-test", { type: "test:forced" });
      expect(forced.events().map((event) => event.type)).toEqual(["test:forced"]);
      forced.dispose();
    } finally {
      process.env.NODE_ENV = previous;
      globalThis.__mreactDevtools?.dispose();
      globalThis.__mreactDevtools = undefined;
    }
  });
});
