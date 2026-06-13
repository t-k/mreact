import type { ReactNode } from "react";

export type CompatRuntime = "react" | "compat";

export type UiPrimitivePackageName =
  | "react-aria-components"
  | "@floating-ui/react"
  | "@tanstack/react-virtual"
  | "react-hook-form"
  | "@headlessui/react";

export type UiPrimitiveRiskTag =
  | "positioned-overlay"
  | "portal"
  | "aria-state"
  | "focus-management"
  | "event-delegation"
  | "pointer-hover"
  | "keyboard"
  | "escape-key"
  | "outside-click"
  | "effect-timing"
  | "layout-measurement"
  | "ref-registration"
  | "uncontrolled-input"
  | "field-array"
  | "render-props";

export interface UiPrimitiveInteraction {
  name: string;
  description: string;
  run:
    | "clickReactAriaDialogTrigger"
    | "clickReactAriaListboxSecondItem"
    | "clickFloatingPopoverTrigger"
    | "hoverFloatingTooltipTrigger"
    | "focusFloatingTooltipTrigger"
    | "scrollVirtualList"
    | "fillHookFormEmail"
    | "blurHookFormEmail"
    | "submitHookForm"
    | "clickHookFormAddItem"
    | "fillHookFormArrayItem"
    | "clickHeadlessDialogTrigger"
    | "clickHeadlessListboxButton"
    | "clickHeadlessListboxSecondOption"
    | "focusHeadlessMenuButton"
    | "pressEnter"
    | "pressEscape"
    | "clickOutsideOverlay";
}

export interface UiPrimitiveFixture {
  id: string;
  packageName: UiPrimitivePackageName;
  title: string;
  description: string;
  features: string[];
  riskTags: UiPrimitiveRiskTag[];
  viewport: { width: number; height: number };
  render: (runtime: CompatRuntime) => ReactNode;
  interactions?: UiPrimitiveInteraction[];
}

export interface UiPrimitiveDomSummary {
  dialogCount: number;
  menuCount: number;
  listboxCount: number;
  tooltipCount: number;
  smokeContentCount: number;
  triggerExpanded: string | null;
  activeElementText: string;
  virtualRows: string[];
  formStateText: string[];
  bodyText: string[];
  consoleMessages: string[];
}
