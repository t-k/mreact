import { applyDomProp } from "../src/dom-prop-application.js";

declare const element: Element;

// @ts-expect-error applyDomProp requires a boolean preferProperty argument.
applyDomProp(element, "title", "value", { preferProperty: false });
