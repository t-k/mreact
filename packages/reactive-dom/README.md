# @reckona/mreact-reactive-dom

`@reckona/mreact-reactive-dom` binds fine-grained reactive values to DOM nodes.
It is the low-level DOM runtime used by compiled client output.

## Basic Usage

```ts
import { bindText, createRoot } from "@reckona/mreact-reactive-dom";
import { cell } from "@reckona/mreact-reactive-core";

const count = cell(0);

createRoot(document.body, () => {
  const text = document.createTextNode("");
  bindText(text, () => count.get());
  return text;
});
```

Keep the dispose function returned by `createRoot()` when you mount manually.
`bindText()`, `bindList()`, `effect()`, and the other low-level bindings use an
explicit lifetime model. Bindings created inside a `createRoot()` scope are
cleaned up when that root is disposed; bindings created outside a root must be
disposed manually.

## Core APIs

- `createRoot()` owns a DOM scope and cleanup lifecycle.
- `createTemplate()` clones static HTML templates.
- `bindText()` and `bindTextBatch()` update text nodes.
- `bindProp()` and `bindSpreadProps()` update element properties and attributes.
- `bindEvent()` attaches event handlers.
- `bindList()` updates keyed list DOM and passes `(item, index, items)` to list item renderers and key functions.
- `insertDynamic()` inserts runtime values into a parent node.

## Notes

Application code should usually use JSX and the router. This package is for
compiler output and low-level runtime integration.
