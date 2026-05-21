// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { bindEvent } from "../src/index.js";

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
    let calls = 0;

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
});
