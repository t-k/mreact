import type { ReactNode } from "react";

export type CompatRuntime = "react" | "compat";

export type RadixRiskTag =
  | "portal"
  | "aria-state"
  | "focus-management"
  | "event-delegation"
  | "escape-key"
  | "outside-click"
  | "effect-timing";

export interface RadixInteraction {
  name: string;
  description: string;
  run: "clickDialogTrigger" | "clickDialogClose" | "pressEscape" | "clickOutsideDialog";
}

export interface RadixFixture {
  id: string;
  library: "radix-ui";
  title: string;
  description: string;
  features: string[];
  riskTags: RadixRiskTag[];
  viewport: { width: number; height: number };
  render: (runtime: CompatRuntime) => ReactNode;
  interactions?: RadixInteraction[];
}

export interface RadixDomSummary {
  dialogCount: number;
  portalContentCount: number;
  triggerExpanded: string | null;
  activeElementText: string;
  bodyText: string[];
  consoleMessages: string[];
}
