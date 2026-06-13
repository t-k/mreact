import type { UiPrimitivePackageName } from "./types.js";

export interface UiPrimitiveCoverageRow {
  obligationId: string;
  packageName: UiPrimitivePackageName;
  feature: string;
  risk: string;
  fixtureId: string;
  vrt: boolean;
  domSummary: boolean;
  interaction: boolean;
  status: "covered" | "partial" | "debt";
}

export const uiPrimitiveCoverageLedger: UiPrimitiveCoverageRow[] = [
  {
    obligationId: "RAC-DIALOG-001",
    packageName: "react-aria-components",
    feature: "DialogTrigger",
    risk: "React Aria DialogTrigger must mount modal dialog content, move focus, and close from Escape",
    fixtureId: "react-aria-dialog-opens-and-closes",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RAC-LISTBOX-001",
    packageName: "react-aria-components",
    feature: "ListBox collection",
    risk: "React Aria ListBox must render collection items and update selection through render-prop item activation",
    fixtureId: "react-aria-listbox-selects-item",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "FLOATING-POPOVER-001",
    packageName: "@floating-ui/react",
    feature: "useFloating/useDismiss",
    risk: "Floating UI dismiss handling must close portaled popover content from an outside pointer interaction",
    fixtureId: "floating-ui-popover-dismisses",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "FLOATING-TOOLTIP-001",
    packageName: "@floating-ui/react",
    feature: "useHover/useFocus",
    risk: "Floating UI hover and focus interactions must mount positioned tooltip content without console errors",
    fixtureId: "floating-ui-tooltip-shows-on-hover",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "TANSTACK-VIRTUAL-001",
    packageName: "@tanstack/react-virtual",
    feature: "useVirtualizer",
    risk: "TanStack Virtual must keep measured virtual rows deterministic after scrolling a fixed container",
    fixtureId: "tanstack-virtual-scrolls-measured-rows",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RHF-FORM-001",
    packageName: "react-hook-form",
    feature: "useForm/register",
    risk: "React Hook Form must register uncontrolled fields by ref and submit changed values",
    fixtureId: "react-hook-form-submits-uncontrolled-fields",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RHF-FIELD-ARRAY-001",
    packageName: "react-hook-form",
    feature: "useFieldArray",
    risk: "React Hook Form field arrays must append inputs, validate empty rows, and submit filled dynamic values",
    fixtureId: "react-hook-form-field-array-validates-items",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "HEADLESS-DIALOG-001",
    packageName: "@headlessui/react",
    feature: "Dialog",
    risk: "Headless UI Dialog must mount managed dialog content and close from Escape",
    fixtureId: "headless-ui-dialog-closes-with-escape",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "HEADLESS-LISTBOX-001",
    packageName: "@headlessui/react",
    feature: "Listbox",
    risk: "Headless UI Listbox must update selected option through option activation",
    fixtureId: "headless-ui-listbox-selects-option",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "HEADLESS-MENU-001",
    packageName: "@headlessui/react",
    feature: "Menu",
    risk: "Headless UI Menu must open from keyboard activation and expose menu items through portal-like positioning",
    fixtureId: "headless-ui-menu-opens-with-keyboard",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
];
