import type { ReactCompatElement, ReactCompatNode } from "@reckona/mreact-compat";

declare global {
  function Slot(props?: {
    children?: ReactCompatNode;
    name?: string;
    [attribute: string]: unknown;
  }): ReactCompatElement;
}

export {};
