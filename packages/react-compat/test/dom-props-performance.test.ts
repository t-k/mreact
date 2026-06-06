// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import { applyProps } from "../src/dom-props.js";

type FormConstructors = Pick<
  typeof globalThis,
  "HTMLInputElement" | "HTMLSelectElement" | "HTMLTextAreaElement"
>;

const originalFormConstructors: FormConstructors = {
  HTMLInputElement: globalThis.HTMLInputElement,
  HTMLSelectElement: globalThis.HTMLSelectElement,
  HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
};

describe("react-compat DOM prop performance", () => {
  afterEach(() => {
    Object.assign(globalThis, originalFormConstructors);
  });

  test("does not test form element classes for ordinary initial props", () => {
    let formElementChecks = 0;

    installCountingFormConstructors(() => {
      formElementChecks += 1;
      return false;
    });

    const root = document.createElement("div");
    const button = document.createElement("button");

    applyProps(
      button,
      {
        "data-index": 1,
        children: "1",
        onClick: () => undefined,
        type: "button",
      },
      "0",
      { eventRoot: root },
    );

    expect(formElementChecks).toBe(0);
  });

  test("does not test form element classes for ordinary updated props", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");

    applyProps(
      button,
      {
        "data-index": 1,
        children: "1",
        onClick: () => undefined,
        type: "button",
      },
      "0",
      { eventRoot: root },
    );

    let formElementChecks = 0;

    installCountingFormConstructors(() => {
      formElementChecks += 1;
      return false;
    });

    applyProps(
      button,
      {
        "data-index": 2,
        children: "2",
        onClick: () => undefined,
        type: "button",
      },
      "0",
      { eventRoot: root },
    );

    expect(formElementChecks).toBe(0);
  });

  test("does not read existing attributes for ordinary initial attributes", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");
    const baselineButton = document.createElement("button");
    let baselineAttributeReads = 0;
    let attributeReads = 0;

    baselineButton.getAttribute = (() => {
      baselineAttributeReads += 1;
      return null;
    }) as typeof baselineButton.getAttribute;
    baselineButton.hasAttribute = (() => {
      baselineAttributeReads += 1;
      return false;
    }) as typeof baselineButton.hasAttribute;
    baselineButton.setAttribute("data-index", "1");
    baselineButton.setAttribute("type", "button");

    button.getAttribute = (() => {
      attributeReads += 1;
      return null;
    }) as typeof button.getAttribute;
    button.hasAttribute = (() => {
      attributeReads += 1;
      return false;
    }) as typeof button.hasAttribute;

    applyProps(
      button,
      {
        "data-index": 1,
        children: "1",
        type: "button",
      },
      "0",
      { eventRoot: root },
    );

    expect(attributeReads).toBe(baselineAttributeReads);
    expect(button.outerHTML).toBe('<button data-index="1" type="button"></button>');
  });

  test("does not allocate iterable event-name arrays for ordinary click props", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");
    const originalIterator = Array.prototype[Symbol.iterator];
    let arrayIteratorCalls = 0;

    Object.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      value(this: unknown[]) {
        arrayIteratorCalls += 1;
        return originalIterator.call(this);
      },
    });

    try {
      applyProps(
        button,
        {
          children: "Click",
          onClick: () => undefined,
        },
        "0",
        { eventRoot: root },
      );
    } finally {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        value: originalIterator,
      });
    }

    expect(arrayIteratorCalls).toBe(0);
  });
});

function installCountingFormConstructors(hasInstance: () => boolean): void {
  class CountingInputElement {
    static [Symbol.hasInstance]() {
      return hasInstance();
    }
  }

  class CountingSelectElement {
    static [Symbol.hasInstance]() {
      return hasInstance();
    }
  }

  class CountingTextAreaElement {
    static [Symbol.hasInstance]() {
      return hasInstance();
    }
  }

  Object.assign(globalThis, {
    HTMLInputElement: CountingInputElement,
    HTMLSelectElement: CountingSelectElement,
    HTMLTextAreaElement: CountingTextAreaElement,
  });
}
