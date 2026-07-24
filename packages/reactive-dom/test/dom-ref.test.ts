// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { bindDomRef, getDomRefBindings } from "../src/dom-ref.js";

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

    withCleanupScope((dispose) => {
      disposeOwner = dispose;
    }, () => bindDomRef(element, () => () => {
      cleanupCount += 1;
    }));

    await Promise.resolve();
    disposeOwner?.();

    expect(cleanupCount).toBe(1);
    expect(getDomRefBindings(element)).toEqual([]);
    element.remove();
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
    expect(events).toEqual([
      "attach:first",
      "cleanup:first",
      "attach:second",
      "cleanup:second",
    ]);
    first.remove();
    second.remove();
  });
});
