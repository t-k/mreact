import { bindList } from "@reckona/mreact-reactive-dom";

declare const parent: ParentNode;
declare const marker: ChildNode;

bindList(
  parent,
  marker,
  () => [1],
  (item) => String(item),
  {},
  // @ts-expect-error The renderer arity override is an internal runtime detail, not public API.
  1,
);
