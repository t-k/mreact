import type { ReactNode } from "react";

export type CompatRuntime = "react" | "compat";

export type RadixRiskTag =
  | "positioned-overlay"
  | "portal"
  | "aria-state"
  | "focus-management"
  | "event-delegation"
  | "pointer-hover"
  | "escape-key"
  | "outside-click"
  | "effect-timing";

export interface RadixInteraction {
  name: string;
  description: string;
  run:
    | "clickDialogTrigger"
    | "clickDialogClose"
    | "clickPopoverTrigger"
    | "clickDropdownTrigger"
    | "hoverTooltipTrigger"
    | "focusTooltipTrigger"
    | "pressEscape"
    | "clickOutsideDialog"
    | "clickOutsideOverlay";
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
  popoverContentCount: number;
  dropdownMenuCount: number;
  tooltipCount: number;
  triggerExpanded: string | null;
  popoverExpanded: string | null;
  dropdownExpanded: string | null;
  activeElementText: string;
  bodyText: string[];
  consoleMessages: string[];
}
