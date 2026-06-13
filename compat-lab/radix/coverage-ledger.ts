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
];
