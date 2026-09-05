import { describe, expect, it } from "vitest";
import { createCleanupScope, runWithCleanupScope } from "../src/index.js";

describe("createCleanupScope", () => {
  it("disposes resources in LIFO order and ignores repeated disposal", () => {
    const scope = createCleanupScope();
    const events: string[] = [];

    scope.register(() => events.push("first"));
    scope.register(() => events.push("second"));
    scope.dispose();
    scope.dispose();

    expect(events).toEqual(["second", "first"]);
    expect(scope.disposed).toBe(true);
  });

  it("runs resources registered after disposal immediately", () => {
    const scope = createCleanupScope();
    scope.dispose();
    const events: string[] = [];

    scope.register(() => events.push("late"));

    expect(events).toEqual(["late"]);
  });

  it("binds reactive registrations only for the synchronous run", () => {
    const scope = createCleanupScope();
    const events: string[] = [];

    runWithCleanupScope(scope, () => {
      scope.register(() => events.push("explicit"));
    });
    scope.dispose();

    expect(events).toEqual(["explicit"]);
  });

  it("supports nested scopes and unregistering a resource", () => {
    const parent = createCleanupScope();
    const child = createCleanupScope();
    const events: string[] = [];
    const removeParentResource = parent.register(() => events.push("parent"));

    runWithCleanupScope(parent, () => {
      runWithCleanupScope(child, () => {
        child.register(() => events.push("child"));
      });
    });
    removeParentResource();
    parent.dispose();
    child.dispose();

    expect(events).toEqual(["child"]);
  });

  it("runs all cleanups before rethrowing the first cleanup error", () => {
    const scope = createCleanupScope();
    const events: string[] = [];
    scope.register(() => {
      events.push("first");
      throw new Error("first error");
    });
    scope.register(() => events.push("second"));

    expect(() => scope.dispose()).toThrow("first error");
    expect(events).toEqual(["second", "first"]);
    expect(() => scope.dispose()).not.toThrow();
  });
});
