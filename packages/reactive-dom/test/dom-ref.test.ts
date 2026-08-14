// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { bindDomRef, getDomRefBindings } from "../src/dom-ref.js";
import { createRoot } from "../src/root.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bindDomRef", () => {
  test("attaches after a synchronous DOM commit", async () => {
    const element = document.createElement("section");
    const attached: Element[] = [];

    const binding = bindDomRef(element, (target) => {
      attached.push(target);
    });

    expect(attached).toEqual([]);
    document.body.append(element);
    await Promise.resolve();

    expect(attached).toEqual([element]);
    binding.dispose();
    element.remove();
  });

  test("attaches after the element connects in a later task", async () => {
    const element = document.createElement("section");
    const events: string[] = [];
    const binding = bindDomRef(element, (target) => {
      events.push(target === element ? "attach" : "unexpected");
      return () => events.push("cleanup");
    });

    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    document.body.append(element);
    await Promise.resolve();

    expect(events).toEqual(["attach"]);
    binding.dispose();
    expect(events).toEqual(["attach", "cleanup"]);
    element.remove();
  });

  test("attaches each pending ref once after a shared late connection", async () => {
    const parent = document.createElement("div");
    const first = document.createElement("section");
    const second = document.createElement("section");
    const attached: Element[] = [];
    const firstBinding = bindDomRef(first, (target) => {
      attached.push(target);
    });
    const secondBinding = bindDomRef(second, (target) => {
      attached.push(target);
    });
    parent.append(first, second);

    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    document.body.append(parent);
    await Promise.resolve();
    parent.append(document.createElement("span"));
    await Promise.resolve();

    expect(attached).toEqual([first, second]);
    firstBinding.dispose();
    secondBinding.dispose();
    parent.remove();
  });

  test("does not attach after disposal while waiting for connection", async () => {
    const element = document.createElement("section");
    let attachCount = 0;
    const binding = bindDomRef(element, () => {
      attachCount += 1;
    });

    await Promise.resolve();
    binding.dispose();
    document.body.append(element);
    await Promise.resolve();

    expect(attachCount).toBe(0);
    expect(getDomRefBindings(element)).toEqual([]);
    element.remove();
  });

  test("moves a waiting ref to a connected retarget", async () => {
    const detached = document.createElement("section");
    const connected = document.createElement("section");
    document.body.append(connected);
    const attached: Element[] = [];
    const binding = bindDomRef(detached, (target) => {
      attached.push(target);
    });

    await Promise.resolve();
    binding.retarget(connected);
    await Promise.resolve();
    document.body.append(detached);
    await Promise.resolve();

    expect(attached).toEqual([connected]);
    expect(getDomRefBindings(detached)).toEqual([]);
    binding.dispose();
    detached.remove();
    connected.remove();
  });

  test("observes a template document ref adopted into the main document", async () => {
    const templateDocument = document.implementation.createHTMLDocument("template");
    const element = templateDocument.createElement("section");
    const attached: Element[] = [];
    const binding = bindDomRef(element, (target) => {
      attached.push(target);
    });

    await Promise.resolve();
    document.body.append(element);
    await Promise.resolve();

    expect(attached).toEqual([element]);
    binding.dispose();
    element.remove();
  });

  test("observes a detached ref adopted into a third document", async () => {
    const sourceDocument = document.implementation.createHTMLDocument("source");
    const targetDocument = document.implementation.createHTMLDocument("target");
    const element = sourceDocument.createElement("section");
    const attached: Element[] = [];
    const binding = bindDomRef(element, (target) => {
      attached.push(target);
    });

    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    targetDocument.body.append(element);
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(element.ownerDocument).toBe(targetDocument);
    expect(element.isConnected).toBe(true);
    expect(attached).toEqual([element]);
    binding.dispose();
    element.remove();
  });

  test("does not attach after its pending owner is disposed", async () => {
    const element = document.createElement("section");
    let attachCount = 0;
    const binding = bindDomRef(element, () => {
      attachCount += 1;
    });

    binding.dispose();
    document.body.append(element);
    await Promise.resolve();

    expect(attachCount).toBe(0);
    expect(getDomRefBindings(element)).toEqual([]);
    element.remove();
  });

  test("runs cleanup exactly once before discarding a committed binding", async () => {
    const element = document.createElement("section");
    document.body.append(element);
    let cleanupCount = 0;
    const binding = bindDomRef(element, () => () => {
      cleanupCount += 1;
    });

    await Promise.resolve();
    binding.dispose();
    binding.dispose();

    expect(cleanupCount).toBe(1);
    expect(getDomRefBindings(element)).toEqual([]);
    element.remove();
  });

  test("is disposed by its reactive cleanup owner", async () => {
    const element = document.createElement("section");
    document.body.append(element);
    let disposeOwner: (() => void) | undefined;
    let cleanupCount = 0;

    withCleanupScope(
      (dispose) => {
        disposeOwner = dispose;
      },
      () =>
        bindDomRef(element, () => () => {
          cleanupCount += 1;
        }),
    );

    await Promise.resolve();
    disposeOwner?.();

    expect(cleanupCount).toBe(1);
    expect(getDomRefBindings(element)).toEqual([]);
    element.remove();
  });

  test("is disposed when its reactive DOM root unmounts", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    let cleanupCount = 0;
    const disposeRoot = createRoot(container, () => {
      const element = document.createElement("section");
      bindDomRef(element, () => () => {
        cleanupCount += 1;
      });
      return element;
    });

    await Promise.resolve();
    disposeRoot();

    expect(cleanupCount).toBe(1);
    expect(container.childNodes).toHaveLength(0);
    container.remove();
  });

  test("removes root DOM after a domRef cleanup throws", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const disposeRoot = createRoot(container, () => {
      const element = document.createElement("section");
      bindDomRef(element, () => () => {
        throw new Error("cleanup failed");
      });
      return element;
    });

    await Promise.resolve();

    expect(() => disposeRoot()).toThrow("cleanup failed");
    expect(container.childNodes).toHaveLength(0);
    expect(container.isConnected).toBe(true);
    container.remove();
  });

  test("commits later bindings and reports the first callback error asynchronously", () => {
    const tasks: VoidFunction[] = [];
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((task) => tasks.push(task));
    const first = document.createElement("section");
    const second = document.createElement("section");
    const events: string[] = [];
    document.body.append(first, second);

    const firstBinding = bindDomRef(first, () => {
      events.push("first");
      throw new Error("attach failed");
    });
    const secondBinding = bindDomRef(second, () => {
      events.push("second");
    });

    expect(tasks).toHaveLength(1);
    expect(() => tasks.shift()?.()).not.toThrow();
    expect(events).toEqual(["first", "second"]);
    expect(tasks).toHaveLength(1);
    expect(() => tasks.shift()?.()).toThrow("attach failed");

    firstBinding.dispose();
    secondBinding.dispose();
    first.remove();
    second.remove();
    queueMicrotaskSpy.mockRestore();
  });

  test("ignores conflicting public expandos when storing binding metadata", () => {
    const element = document.createElement("section") as Element & {
      __mreactDomRefBindings?: unknown;
    };
    element.__mreactDomRefBindings = "application-owned";

    const binding = bindDomRef(element, () => {});

    expect(element.__mreactDomRefBindings).toBe("application-owned");
    expect(getDomRefBindings(element)).toEqual([binding]);
    binding.dispose();
  });

  test("retargets a pending binding to the connected SSR element", async () => {
    const detachedClone = document.createElement("section");
    const ssrElement = document.createElement("section");
    document.body.append(ssrElement);
    const attached: Element[] = [];
    const binding = bindDomRef(detachedClone, (target) => {
      attached.push(target);
    });

    binding.retarget(ssrElement);
    await Promise.resolve();

    expect(attached).toEqual([ssrElement]);
    expect(getDomRefBindings(detachedClone)).toEqual([]);
    expect(getDomRefBindings(ssrElement)).toEqual([binding]);
    binding.dispose();
    ssrElement.remove();
  });

  test("stays idempotently disposed when cleanup throws", async () => {
    const element = document.createElement("section");
    document.body.append(element);
    const binding = bindDomRef(element, () => () => {
      throw new Error("cleanup failed");
    });

    await Promise.resolve();

    expect(() => binding.dispose()).toThrow("cleanup failed");
    expect(() => binding.dispose()).not.toThrow();
    expect(getDomRefBindings(element)).toEqual([]);
    element.remove();
  });

  test("cleans up and recommits when a committed binding is retargeted", async () => {
    const first = document.createElement("section");
    const second = document.createElement("section");
    document.body.append(first, second);
    const events: string[] = [];
    const binding = bindDomRef(first, (target) => {
      events.push(`attach:${target === first ? "first" : "second"}`);
      return () => events.push(`cleanup:${target === first ? "first" : "second"}`);
    });

    await Promise.resolve();
    binding.retarget(second);
    await Promise.resolve();

    expect(events).toEqual(["attach:first", "cleanup:first", "attach:second"]);
    binding.dispose();
    expect(events).toEqual(["attach:first", "cleanup:first", "attach:second", "cleanup:second"]);
    first.remove();
    second.remove();
  });
});
