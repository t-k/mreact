import type { ReactCompatElement, ReactCompatNode } from "@reckona/mreact-compat";

declare global {
  /**
   * Renders the fulfilled, rejected, or placeholder state of a deferred value.
   */
  function Await<T>(props: {
    children?: (value: Awaited<T>) => ReactCompatNode;
    catch?: (error: Error) => ReactCompatNode;
    placeholder?: ReactCompatNode;
    placeholderAs?: string;
    value: T | PromiseLike<T>;
  }): ReactCompatElement;

  /**
   * Renders a named layout slot with optional fallback children.
   */
  function Slot(props?: {
    children?: ReactCompatNode;
    name?: string;
    [attribute: string]: unknown;
  }): ReactCompatElement;
}

export {};
