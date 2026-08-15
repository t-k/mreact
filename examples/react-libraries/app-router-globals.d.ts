import type { ReactElement, ReactNode } from "react";

declare global {
  /** Renders a named app-router slot through the React compatibility runtime. */
  function Slot(props?: {
    children?: ReactNode;
    name?: string;
    [attribute: string]: unknown;
  }): ReactElement;
}

export {};
