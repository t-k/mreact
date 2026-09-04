import { bindList } from "@reckona/mreact-reactive-dom";

declare const parent: ParentNode;
declare const marker: ChildNode;

// @ts-expect-error The renderer arity override is an internal runtime detail, not public API.
bindList(parent, marker, () => [1], (item) => String(item), {}, 1);
