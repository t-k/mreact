import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { RadixFixture } from "./types.js";

const dialogViewport = { width: 760, height: 520 };
const overlayViewport = { width: 820, height: 560 };

function DialogFixture() {
  return (
    <div className="radix-frame">
      <Dialog.Root>
        <Dialog.Trigger className="radix-trigger" data-testid="dialog-trigger">
          Open dialog
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay" data-testid="dialog-overlay" />
          <Dialog.Content
            className="radix-surface radix-modal-content"
            data-testid="dialog-content"
          >
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

function PopoverFixture() {
  return (
    <div className="radix-frame">
      <Popover.Root>
        <Popover.Trigger className="radix-trigger" data-testid="popover-trigger">
          Open popover
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            className="radix-surface radix-positioned-content"
            data-testid="popover-content"
            sideOffset={8}
          >
            <Popover.Arrow className="radix-arrow" />
            <h2 className="radix-title">Radix popover</h2>
            <p className="radix-description">Popover content rendered in a positioned portal.</p>
            <button className="radix-field" type="button">
              Popover action
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function DropdownMenuFixture() {
  return (
    <div className="radix-frame">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="radix-trigger" data-testid="dropdown-trigger">
          Open menu
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="center"
            className="radix-surface radix-positioned-content"
            data-testid="dropdown-content"
            sideOffset={8}
          >
            <DropdownMenu.Item className="radix-menu-item">Profile</DropdownMenu.Item>
            <DropdownMenu.Item className="radix-menu-item">Settings</DropdownMenu.Item>
            <DropdownMenu.Separator className="radix-menu-separator" />
            <DropdownMenu.Item className="radix-menu-item">Sign out</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function TooltipFixture() {
  return (
    <div className="radix-frame">
      <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger className="radix-trigger" data-testid="tooltip-trigger">
            Inspect tooltip
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="radix-tooltip"
              data-testid="tooltip-content"
              side="top"
              sideOffset={8}
            >
              Radix tooltip content
              <Tooltip.Arrow className="radix-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
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
  {
    id: "radix-dialog-closes-with-escape",
    library: "radix-ui",
    title: "Dialog closes with Escape",
    description: "Dialog opens, then closes from the Escape key.",
    features: ["Dialog.Trigger", "Dialog.Content", "Dialog.Close"],
    riskTags: ["portal", "aria-state", "focus-management", "escape-key"],
    viewport: dialogViewport,
    render: () => <DialogFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the dialog through the Radix trigger.",
        run: "clickDialogTrigger",
      },
      {
        name: "Press Escape",
        description: "Close the dialog with the Escape key.",
        run: "pressEscape",
      },
    ],
  },
  {
    id: "radix-dialog-closes-on-outside-click",
    library: "radix-ui",
    title: "Dialog closes on outside click",
    description: "Dialog opens, then closes from an outside pointer interaction.",
    features: ["Dialog.Trigger", "Dialog.Content", "Dialog.Overlay"],
    riskTags: ["portal", "aria-state", "focus-management", "outside-click"],
    viewport: dialogViewport,
    render: () => <DialogFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the dialog through the Radix trigger.",
        run: "clickDialogTrigger",
      },
      {
        name: "Click outside",
        description: "Click outside dialog content to dismiss it.",
        run: "clickOutsideDialog",
      },
    ],
  },
  {
    id: "radix-popover-opens-from-trigger",
    library: "radix-ui",
    title: "Popover opens from trigger",
    description: "Uncontrolled Popover opens after clicking Popover.Trigger.",
    features: ["Popover.Root", "Popover.Trigger", "Popover.Content", "Popover.Portal"],
    riskTags: ["portal", "aria-state", "event-delegation", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <PopoverFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the popover through the Radix trigger.",
        run: "clickPopoverTrigger",
      },
    ],
  },
  {
    id: "radix-popover-closes-on-outside-click",
    library: "radix-ui",
    title: "Popover closes on outside click",
    description: "Popover opens, then closes from an outside pointer interaction.",
    features: ["Popover.Trigger", "Popover.Content"],
    riskTags: ["portal", "aria-state", "event-delegation", "outside-click"],
    viewport: overlayViewport,
    render: () => <PopoverFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the popover through the Radix trigger.",
        run: "clickPopoverTrigger",
      },
      {
        name: "Click outside",
        description: "Click away from the popover.",
        run: "clickOutsideOverlay",
      },
    ],
  },
  {
    id: "radix-dropdown-menu-opens-from-trigger",
    library: "radix-ui",
    title: "DropdownMenu opens from trigger",
    description: "DropdownMenu opens after clicking DropdownMenu.Trigger.",
    features: [
      "DropdownMenu.Root",
      "DropdownMenu.Trigger",
      "DropdownMenu.Content",
      "DropdownMenu.Item",
    ],
    riskTags: [
      "portal",
      "aria-state",
      "focus-management",
      "event-delegation",
      "positioned-overlay",
    ],
    viewport: overlayViewport,
    render: () => <DropdownMenuFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the dropdown menu through the Radix trigger.",
        run: "clickDropdownTrigger",
      },
    ],
  },
  {
    id: "radix-dropdown-menu-closes-with-escape",
    library: "radix-ui",
    title: "DropdownMenu closes with Escape",
    description: "DropdownMenu opens, then closes from the Escape key.",
    features: ["DropdownMenu.Trigger", "DropdownMenu.Content", "DropdownMenu.Item"],
    riskTags: ["portal", "aria-state", "focus-management", "event-delegation", "escape-key"],
    viewport: overlayViewport,
    render: () => <DropdownMenuFixture />,
    interactions: [
      {
        name: "Click trigger",
        description: "Open the dropdown menu through the Radix trigger.",
        run: "clickDropdownTrigger",
      },
      {
        name: "Press Escape",
        description: "Close the dropdown menu with the Escape key.",
        run: "pressEscape",
      },
    ],
  },
  {
    id: "radix-tooltip-shows-on-hover",
    library: "radix-ui",
    title: "Tooltip shows on hover",
    description: "Tooltip opens when hovering Tooltip.Trigger.",
    features: ["Tooltip.Provider", "Tooltip.Trigger", "Tooltip.Content"],
    riskTags: ["portal", "aria-state", "pointer-hover", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <TooltipFixture />,
    interactions: [
      {
        name: "Hover trigger",
        description: "Show the tooltip through pointer hover.",
        run: "hoverTooltipTrigger",
      },
    ],
  },
  {
    id: "radix-tooltip-shows-on-focus",
    library: "radix-ui",
    title: "Tooltip shows on focus",
    description: "Tooltip opens when focusing Tooltip.Trigger.",
    features: ["Tooltip.Provider", "Tooltip.Trigger", "Tooltip.Content"],
    riskTags: ["portal", "aria-state", "focus-management", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <TooltipFixture />,
    interactions: [
      {
        name: "Focus trigger",
        description: "Show the tooltip through keyboard focus.",
        run: "focusTooltipTrigger",
      },
    ],
  },
];
