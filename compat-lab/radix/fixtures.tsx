import * as Dialog from "@radix-ui/react-dialog";
import type { RadixFixture } from "./types.js";

const dialogViewport = { width: 760, height: 520 };

function DialogFixture() {
  return (
    <div className="radix-frame">
      <Dialog.Root>
        <Dialog.Trigger className="radix-trigger" data-testid="dialog-trigger">
          Open dialog
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay" data-testid="dialog-overlay" />
          <Dialog.Content className="radix-content" data-testid="dialog-content">
            <Dialog.Title className="radix-title">Radix dialog</Dialog.Title>
            <Dialog.Description className="radix-description">
              Dialog content rendered through a Radix portal.
            </Dialog.Description>
            <button className="radix-field" type="button">
              Focus target
            </button>
            <Dialog.Close className="radix-close" data-testid="dialog-close">
              Close dialog
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export const radixFixtures: RadixFixture[] = [
  {
    id: "radix-dialog-initial-closed",
    library: "radix-ui",
    title: "Dialog initial closed state",
    description: "Closed Dialog.Root with trigger only and no portaled content.",
    features: ["Dialog.Root", "Dialog.Trigger", "Dialog.Portal", "Dialog.Content"],
    riskTags: ["portal", "aria-state"],
    viewport: dialogViewport,
    render: () => <DialogFixture />,
  },
  {
    id: "radix-dialog-opens-from-trigger",
    library: "radix-ui",
    title: "Dialog opens from trigger",
    description: "Uncontrolled Dialog opens after clicking Dialog.Trigger.",
    features: ["Dialog.Trigger", "Dialog.Content", "Dialog.Overlay", "Dialog.Title"],
    riskTags: ["portal", "aria-state", "focus-management", "event-delegation", "effect-timing"],
    viewport: dialogViewport,
    render: () => <DialogFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the dialog through the Radix trigger.",
        run: "clickDialogTrigger",
      },
    ],
  },
  {
    id: "radix-dialog-closes-from-open-state",
    library: "radix-ui",
    title: "Dialog closes from open state",
    description: "Dialog opens, then closes through Dialog.Close.",
    features: ["Dialog.Trigger", "Dialog.Content", "Dialog.Close"],
    riskTags: ["portal", "aria-state", "focus-management", "event-delegation"],
    viewport: dialogViewport,
    render: () => <DialogFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the dialog through the Radix trigger.",
        run: "clickDialogTrigger",
      },
      {
        name: "Click close",
        description: "Close the dialog through Dialog.Close.",
        run: "clickDialogClose",
      },
    ],
  },
];
