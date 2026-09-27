import { describe, expect, test } from "vitest";
import { createDevtools, exportDevtoolsDiagnostics } from "../src/index.js";

describe("devtools diagnostics export", () => {
  test("exports a versioned JSON-safe report without event values or resource metadata", () => {
    const secret = "private-customer-value";
    const devtools = createDevtools({ maxResources: 1 });
    const resource = devtools.resources().register({
      kind: "subscription",
      label: secret,
      location: secret,
      ownerId: secret,
    });
    const custom = devtools.resources().register({ kind: `private:${secret}`, label: secret });
    const payload: { secret: string; self?: unknown } = { secret };
    payload.self = payload;
    devtools.emit({
      package: "@reckona/mreact-query",
      type: "query:update",
      timestamp: 42,
      payload,
      value: BigInt(1),
      queryKey: secret,
    });

    const report = exportDevtoolsDiagnostics(devtools);

    expect(report).toEqual({
      schemaVersion: 1,
      events: [{ package: "@reckona/mreact-query", type: "query:update", timestamp: 42 }],
      resources: {
        byKind: [
          { kind: "other", created: 1, disposed: 0, live: 1 },
          { kind: "subscription", created: 1, disposed: 0, live: 1 },
        ],
        live: 2,
        missingMetadata: 1,
        retainedMetadata: 1,
      },
    });
    expect(JSON.stringify(report)).not.toContain(secret);
    custom.dispose();
    resource.dispose();
    devtools.dispose();
  });

  test("keeps only retained events in emission order and normalizes invalid timestamps", () => {
    const devtools = createDevtools({ maxEvents: 2 });
    devtools.emit({ package: "test", type: "first", timestamp: 1 });
    devtools.emit({ package: "test", type: "second" });
    devtools.emit({ package: "test", type: "third", timestamp: Number.POSITIVE_INFINITY });

    expect(exportDevtoolsDiagnostics(devtools)).toMatchObject({
      events: [
        { package: "other", type: "other", timestamp: null },
        { package: "other", type: "other", timestamp: null },
      ],
    });
    devtools.dispose();
  });

  test("omits malformed event metadata instead of exporting application objects", () => {
    const devtools = createDevtools();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    (devtools as unknown as { emit(event: unknown): void }).emit(null);
    devtools.emit({ package: cyclic as unknown as string, type: "invalid" });
    devtools.emit({ package: "test", type: BigInt(7) as unknown as string });
    devtools.emit({ package: "test", type: "valid" });

    expect(exportDevtoolsDiagnostics(devtools).events).toEqual([
      { package: "other", type: "other", timestamp: null },
    ]);
    devtools.dispose();
  });

  test("sorts resource kinds and reports disposal counts", () => {
    const devtools = createDevtools();
    const subscription = devtools.resources().register({ kind: "subscription" });
    devtools.resources().register({ kind: "computed" });
    subscription.dispose();

    expect(exportDevtoolsDiagnostics(devtools)).toMatchObject({
      resources: {
        byKind: [
          { kind: "computed", created: 1, disposed: 0, live: 1 },
          { kind: "subscription", created: 1, disposed: 1, live: 0 },
        ],
        live: 1,
      },
    });
    devtools.dispose();
  });

  test("preserves every built-in resource kind in a stable order", () => {
    const devtools = createDevtools();
    for (const kind of [
      "computed",
      "subscription",
      "effect",
      "scope",
      "inactive-query",
      "pending-task",
    ] as const) {
      devtools.resources().register({ kind });
    }

    expect(exportDevtoolsDiagnostics(devtools).resources.byKind.map(({ kind }) => kind)).toEqual([
      "computed",
      "effect",
      "inactive-query",
      "pending-task",
      "scope",
      "subscription",
    ]);
    devtools.dispose();
  });

  test("returns an empty report after devtools disposal", () => {
    const devtools = createDevtools();
    devtools.emit({ package: "test", type: "before-dispose" });
    devtools.resources().register({ kind: "scope" });
    devtools.dispose();

    expect(exportDevtoolsDiagnostics(devtools)).toEqual({
      schemaVersion: 1,
      events: [],
      resources: {
        byKind: [],
        live: 0,
        missingMetadata: 0,
        retainedMetadata: 0,
      },
    });
  });

  test("redacts application values placed in event identifiers", () => {
    const secret = "private@example.com";
    const devtools = createDevtools();
    devtools.emit({ package: secret, type: `customer:${secret}`, timestamp: 7 });
    devtools.emit({ package: "@reckona/mreact-query", type: `query:${secret}`, timestamp: 8 });

    const report = exportDevtoolsDiagnostics(devtools);
    expect(report.events).toEqual([
      { package: "other", type: "other", timestamp: 7 },
      { package: "@reckona/mreact-query", type: "other", timestamp: 8 },
    ]);
    expect(JSON.stringify(report)).not.toContain(secret);
    devtools.dispose();
  });

  test("includes special property names in resource counts without exporting labels", () => {
    const devtools = createDevtools();
    const resource = devtools.resources().register({ kind: "__proto__", label: "secret" });
    expect(exportDevtoolsDiagnostics(devtools).resources).toMatchObject({
      byKind: [{ kind: "other", created: 1, disposed: 0, live: 1 }],
      live: 1,
    });
    resource.dispose();
    devtools.dispose();
  });
});
