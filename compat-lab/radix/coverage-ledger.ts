export interface RadixCoverageRow {
  obligationId: string;
  feature: string;
  risk: string;
  fixtureId: string;
  vrt: boolean;
  domSummary: boolean;
  interaction: boolean;
  status: "covered" | "partial" | "debt";
}

export const radixCoverageLedger: RadixCoverageRow[] = [
  {
    obligationId: "RADIX-DIALOG-001",
    feature: "Dialog.Portal",
    risk: "Portal content must mount in document.body after an interaction",
    fixtureId: "radix-dialog-opens-from-trigger",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-DIALOG-002",
    feature: "Dialog.Trigger",
    risk: "Dialog trigger and content ARIA state must match React",
    fixtureId: "radix-dialog-opens-from-trigger",
    vrt: false,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-DIALOG-003",
    feature: "Dialog.FocusScope",
    risk: "Focus must move into the dialog and return to the trigger",
    fixtureId: "radix-dialog-closes-from-open-state",
    vrt: false,
    domSummary: true,
    interaction: true,
    status: "partial",
  },
  {
    obligationId: "RADIX-DIALOG-004",
    feature: "Dialog.Close",
    risk: "Close controls must unmount portaled content",
    fixtureId: "radix-dialog-closes-from-open-state",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-DIALOG-005",
    feature: "Dialog.Escape",
    risk: "Escape must close modal dialog content",
    fixtureId: "radix-dialog-closes-with-escape",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-DIALOG-006",
    feature: "Dialog.DismissableLayer",
    risk: "Outside pointer interaction must close dismissible dialog content",
    fixtureId: "radix-dialog-closes-on-outside-click",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-POPOVER-001",
    feature: "Popover.Trigger",
    risk: "Popover trigger must mount content and expose expanded state",
    fixtureId: "radix-popover-opens-from-trigger",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-POPOVER-002",
    feature: "Popover.DismissableLayer",
    risk: "Outside pointer interaction must close dismissible popover content",
    fixtureId: "radix-popover-closes-on-outside-click",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-DROPDOWN-001",
    feature: "DropdownMenu.Trigger",
    risk: "DropdownMenu trigger must mount menu content and close on Escape",
    fixtureId: "radix-dropdown-menu-closes-with-escape",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-TOOLTIP-001",
    feature: "Tooltip.Trigger",
    risk: "Tooltip must mount tooltip content from hover and focus interest",
    fixtureId: "radix-tooltip-shows-on-hover",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RADIX-TOOLTIP-002",
    feature: "Tooltip.Focus",
    risk: "Tooltip must mount tooltip content from hover and focus interest",
    fixtureId: "radix-tooltip-shows-on-focus",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
];
