// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  bindEvent,
  withBatchedDelegatedRootReleases,
  withEventBindingMetadata,
} from "../src/index.js";

describe("bindEvent", () => {
  test("uses native events and removes listener on dispose", () => {
    const button = document.createElement("button");
    document.body.append(button);
    let calls = 0;

    const dispose = bindEvent(button, "click", () => {
      calls += 1;
    });

    button.click();
    expect(calls).toBe(1);

    dispose();
    button.click();
    expect(calls).toBe(1);
  });

  test("delegates common bubbling events through one document listener", () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    document.body.append(first, second);

    let documentListeners = 0;
    let directListeners = 0;
    const documentAddEventListener = document.addEventListener.bind(document);
    const documentRemoveEventListener = document.removeEventListener.bind(document);
    const firstAddEventListener = first.addEventListener.bind(first);
    const secondAddEventListener = second.addEventListener.bind(second);

    document.addEventListener = ((type, listener, options) => {
      if (type === "click") {
        documentListeners += 1;
      }
      documentAddEventListener(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type, listener, options) => {
      if (type === "click") {
        documentListeners -= 1;
      }
      documentRemoveEventListener(type, listener, options);
    }) as typeof document.removeEventListener;
    first.addEventListener = ((type, listener, options) => {
      if (type === "click") {
        directListeners += 1;
      }
      firstAddEventListener(type, listener, options);
    }) as typeof first.addEventListener;
    second.addEventListener = ((type, listener, options) => {
      if (type === "click") {
        directListeners += 1;
      }
      secondAddEventListener(type, listener, options);
    }) as typeof second.addEventListener;

    let firstCalls = 0;
    let secondCalls = 0;
    let firstCurrentTarget: EventTarget | null = null;

    const disposeFirst = bindEvent(first, "click", (event) => {
      firstCalls += 1;
      firstCurrentTarget = event.currentTarget;
    });
    const disposeSecond = bindEvent(second, "click", () => {
      secondCalls += 1;
    });

    expect(documentListeners).toBe(1);
    expect(directListeners).toBe(0);

    first.click();
    second.click();

    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
    expect(firstCurrentTarget).toBe(first);

    disposeFirst();
    first.click();
    second.click();

    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(2);
    expect(documentListeners).toBe(1);

    disposeSecond();
    second.click();

    expect(secondCalls).toBe(2);
    expect(documentListeners).toBe(0);

    document.addEventListener = documentAddEventListener;
    document.removeEventListener = documentRemoveEventListener;
  });

  test("delegates adopted template nodes after they connect to the main document", async () => {
    const templateDocument = document.implementation.createHTMLDocument("template");
    const button = templateDocument.createElement("button");
    let calls = 0;

    const dispose = bindEvent(button, "click", () => {
      calls += 1;
    });

    document.body.append(button);
    await Promise.resolve();

    button.click();

    expect(calls).toBe(1);

    dispose();
  });

  test("keeps adopted template nodes interactive when connection is delayed", async () => {
    const templateDocument = document.implementation.createHTMLDocument("template");
    const button = templateDocument.createElement("button");
    const rootRetainer = document.createElement("button");
    let calls = 0;

    document.body.append(rootRetainer);
    const disposeRootRetainer = bindEvent(rootRetainer, "click", () => undefined);

    const dispose = bindEvent(button, "click", () => {
      calls += 1;
    });

    await Promise.resolve();
    button.click();
    expect(calls).toBe(1);

    document.body.append(button);
    button.click();
    expect(calls).toBe(2);

    await Promise.resolve();
    button.click();
    expect(calls).toBe(3);

    dispose();
    disposeRootRetainer();
    rootRetainer.remove();
  });

  test("batches disconnected delegated event promotion microtasks", async () => {
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const templateDocument = document.implementation.createHTMLDocument("template");
    const first = templateDocument.createElement("button");
    const second = templateDocument.createElement("button");
    let queuedMicrotasks = 0;
    let firstCalls = 0;
    let secondCalls = 0;

    try {
      globalThis.queueMicrotask = ((callback: VoidFunction) => {
        queuedMicrotasks += 1;
        originalQueueMicrotask(callback);
      }) as typeof queueMicrotask;

      const disposeFirst = bindEvent(first, "click", () => {
        firstCalls += 1;
      });
      const disposeSecond = bindEvent(second, "click", () => {
        secondCalls += 1;
      });

      expect(queuedMicrotasks).toBe(1);

      first.click();
      second.click();
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);

      document.body.append(first, second);
      await Promise.resolve();

      first.click();
      second.click();
      expect(firstCalls).toBe(2);
      expect(secondCalls).toBe(2);

      disposeFirst();
      disposeSecond();
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask;
    }
  });

  test("promotes delayed delegated events without queueMicrotask", async () => {
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const templateDocument = document.implementation.createHTMLDocument("template");
    const button = templateDocument.createElement("button");
    let calls = 0;

    try {
      (globalThis as { queueMicrotask?: typeof queueMicrotask }).queueMicrotask = undefined;
      const dispose = bindEvent(button, "click", () => {
        calls += 1;
      });

      document.body.append(button);
      await Promise.resolve();
      button.click();

      expect(calls).toBe(1);
      dispose();
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask;
    }
  });

  test("keeps a direct listener when requested", () => {
    const button = document.createElement("button");
    document.body.append(button);
    let directListeners = 0;
    let documentListeners = 0;
    const buttonAddEventListener = button.addEventListener.bind(button);
    const documentAddEventListener = document.addEventListener.bind(document);

    button.addEventListener = ((type, listener, options) => {
      if (type === "click") {
        directListeners += 1;
      }
      buttonAddEventListener(type, listener, options);
    }) as typeof button.addEventListener;
    document.addEventListener = ((type, listener, options) => {
      if (type === "click") {
        documentListeners += 1;
      }
      documentAddEventListener(type, listener, options);
    }) as typeof document.addEventListener;

    const dispose = bindEvent(button, "click", () => {}, { direct: true });

    expect(directListeners).toBe(1);
    expect(documentListeners).toBe(0);

    dispose();

    document.addEventListener = documentAddEventListener;
  });

  test("skips event binding metadata unless metadata capture is enabled", () => {
    const button = document.createElement("button");

    const dispose = bindEvent(button, "click", () => {});

    expect(
      (button as unknown as { __mreactEventBindings?: unknown }).__mreactEventBindings,
    ).toBeUndefined();
    expect((button as unknown as { __mreactHasEvents?: true }).__mreactHasEvents).toBeUndefined();

    dispose();
  });

  test("captures a single event binding without array metadata when requested", () => {
    const button = document.createElement("button");

    const dispose = withEventBindingMetadata(() => bindEvent(button, "click", () => {}));

    expect(
      Array.isArray(
        (button as unknown as { __mreactEventBindings?: unknown }).__mreactEventBindings,
      ),
    ).toBe(false);

    dispose();
  });

  test("promotes event binding metadata to an array for multiple captured bindings", () => {
    const button = document.createElement("button");

    const disposeFirst = withEventBindingMetadata(() => bindEvent(button, "click", () => {}));
    const firstBinding = (button as unknown as { __mreactEventBindings?: unknown })
      .__mreactEventBindings;

    const disposeSecond = withEventBindingMetadata(() => bindEvent(button, "input", () => {}));
    const bindings = (button as unknown as { __mreactEventBindings?: unknown[] })
      .__mreactEventBindings;

    expect(bindings).toEqual([firstBinding, expect.any(Object)]);
    expect(bindings).toHaveLength(2);

    disposeFirst();
    disposeSecond();
  });

  test("prunes captured event binding metadata on dispose", () => {
    const button = document.createElement("button");

    const disposeFirst = withEventBindingMetadata(() => bindEvent(button, "click", () => {}));
    const disposeSecond = withEventBindingMetadata(() => bindEvent(button, "input", () => {}));

    const eventElement = button as unknown as {
      __mreactEventBindings?: unknown[];
      __mreactHasEvents?: true;
    };
    expect(eventElement.__mreactHasEvents).toBe(true);
    expect(eventElement.__mreactEventBindings).toHaveLength(2);

    disposeFirst();
    expect(eventElement.__mreactHasEvents).toBe(true);
    expect(Array.isArray(eventElement.__mreactEventBindings)).toBe(false);
    expect(eventElement.__mreactEventBindings).toEqual(expect.any(Object));

    disposeSecond();
    expect(eventElement.__mreactHasEvents).toBeUndefined();
    expect(eventElement.__mreactEventBindings).toBeUndefined();
  });

  test("keeps delegated listeners independent when one element has multiple handlers", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const calls: string[] = [];

    const disposeFirst = bindEvent(button, "click", () => {
      calls.push("first");
    });
    const disposeSecond = bindEvent(button, "click", () => {
      calls.push("second");
    });

    button.click();
    disposeFirst();
    button.click();
    disposeSecond();
    button.click();

    expect(calls).toEqual(["first", "second", "second"]);
  });

  test("does not allocate a release batch map when no delegated roots are released", () => {
    const OriginalMap = globalThis.Map;
    let mapAllocations = 0;

    try {
      globalThis.Map = class CountingMap<K, V> extends OriginalMap<K, V> {
        constructor(entries?: readonly (readonly [K, V])[] | null) {
          mapAllocations += 1;
          super(entries);
        }
      } as MapConstructor;

      withBatchedDelegatedRootReleases(() => undefined);
    } finally {
      globalThis.Map = OriginalMap;
    }

    expect(mapAllocations).toBe(0);
  });

  test("flushes lazy delegated root releases after the outer batch scope", () => {
    const button = document.createElement("button");
    document.body.append(button);
    const documentRemoveEventListener = document.removeEventListener.bind(document);
    let documentListenerRemovals = 0;

    document.removeEventListener = ((type, listener, options) => {
      if (type === "click") {
        documentListenerRemovals += 1;
      }
      documentRemoveEventListener(type, listener, options);
    }) as typeof document.removeEventListener;

    try {
      const dispose = bindEvent(button, "click", () => {});

      withBatchedDelegatedRootReleases(() => {
        withBatchedDelegatedRootReleases(() => {
          dispose();
        });

        expect(documentListenerRemovals).toBe(0);
      });

      expect(documentListenerRemovals).toBe(1);
    } finally {
      document.removeEventListener = documentRemoveEventListener;
      button.remove();
    }
  });
});
