// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __domPropsAttributeNameCacheForTesting,
  applyPostChildFormProps,
  applyProps,
} from "../src/dom-props.js";

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

  test("does not lowercase ordinary click event props while mounting event targets", () => {
    const root = document.createElement("div");
    const originalToLowerCase = String.prototype.toLowerCase;
    let toLowerCaseCalls = 0;

    String.prototype.toLowerCase = function toLowerCaseSpy() {
      toLowerCaseCalls += 1;
      return originalToLowerCase.call(this);
    };

    try {
      for (let index = 0; index < 100; index += 1) {
        const button = document.createElement("button");
        applyProps(
          button,
          {
            children: String(index),
            onClick: () => undefined,
          },
          String(index),
          { eventRoot: root },
        );
      }
    } finally {
      String.prototype.toLowerCase = originalToLowerCase;
    }

    expect(toLowerCaseCalls).toBe(0);
  });

  test("post-child form props do not inspect ordinary element props", () => {
    const div = document.createElement("div");
    let propDescriptorReads = 0;
    const props = new Proxy(
      {
        children: "row",
        "data-key": 1,
      },
      {
        getOwnPropertyDescriptor(target, property) {
          propDescriptorReads += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      },
    );

    applyPostChildFormProps(div, props);

    expect(propDescriptorReads).toBe(0);
  });

  test("host createElement does not recheck ordinary props for children-only metadata", async () => {
    vi.resetModules();
    const originalHasOwnProperty = Object.prototype.hasOwnProperty;
    let propOwnershipChecks = 0;

    Object.prototype.hasOwnProperty = function hasOwnPropertySpy(property) {
      if (
        (property === "className" || property === "children") &&
        ((this as Record<PropertyKey, unknown>).className === "row" ||
          (this as Record<PropertyKey, unknown>).children === "row")
      ) {
        propOwnershipChecks += 1;
      }

      return originalHasOwnProperty.call(this, property);
    };

    try {
      const { createElement } = await import("../src/element.js");
      const element = createElement("tr", { className: "row" }, "row");

      expect(element.props.className).toBe("row");
      expect(element.props.children).toBe("row");
      expect(propOwnershipChecks).toBe(1);
    } finally {
      Object.prototype.hasOwnProperty = originalHasOwnProperty;
      vi.resetModules();
    }
  });

  test("reuses cached attribute names for repeated same-shape updates", () => {
    const root = document.createElement("div");
    const row = document.createElement("tr");

    applyProps(row, { className: "row", "data-id": 0, title: "0", children: "0" }, "0", {
      eventRoot: root,
    });

    __domPropsAttributeNameCacheForTesting.clear();

    for (let index = 1; index <= 20; index += 1) {
      applyProps(
        row,
        { className: "row", "data-id": index, title: String(index), children: String(index) },
        "0",
        { eventRoot: root },
      );
    }

    expect(__domPropsAttributeNameCacheForTesting.missCount()).toBe(1);
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
