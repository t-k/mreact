import type { ReactCompatElement, ReactCompatNode } from "@reckona/mreact-compat";

declare global {
  function Await<T>(props: {
    children?: (value: Awaited<T>) => ReactCompatNode;
    catch?: (error: Error) => ReactCompatNode;
    placeholder?: ReactCompatNode;
    placeholderAs?: string;
    value: T | PromiseLike<T>;
  }): ReactCompatElement;

  function Slot(props?: {
    children?: ReactCompatNode;
    name?: string;
    [attribute: string]: unknown;
  }): ReactCompatElement;
}

export {};
