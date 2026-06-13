import { useState, type ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as AspectRatio from "@radix-ui/react-aspect-ratio";
import * as Avatar from "@radix-ui/react-avatar";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Form from "@radix-ui/react-form";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as Label from "@radix-ui/react-label";
import * as Menubar from "@radix-ui/react-menubar";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import * as OneTimePasswordField from "@radix-ui/react-one-time-password-field";
import * as PasswordToggleField from "@radix-ui/react-password-toggle-field";
import * as Popover from "@radix-ui/react-popover";
import * as Progress from "@radix-ui/react-progress";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Select from "@radix-ui/react-select";
import * as Separator from "@radix-ui/react-separator";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import * as Toast from "@radix-ui/react-toast";
import * as Toggle from "@radix-ui/react-toggle";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Toolbar from "@radix-ui/react-toolbar";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { RadixFixture } from "./types.js";

const dialogViewport = { width: 760, height: 520 };
const overlayViewport = { width: 820, height: 560 };
const smokeViewport = { width: 820, height: 560 };

function SmokeFrame(props: { children: ReactNode }) {
  return <div className="radix-frame">{props.children}</div>;
}

function AccordionFixture() {
  return (
    <SmokeFrame>
      <Accordion.Root className="radix-stack" type="single" collapsible>
        <Accordion.Item value="compat">
          <Accordion.Header>
            <Accordion.Trigger className="radix-trigger" data-testid="accordion-trigger">
              Open accordion
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="radix-panel" data-radix-smoke-content>
            Accordion content
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </SmokeFrame>
  );
}

function AlertDialogFixture() {
  return (
    <SmokeFrame>
      <AlertDialog.Root>
        <AlertDialog.Trigger className="radix-trigger" data-testid="alert-dialog-trigger">
          Open alert
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="radix-overlay" />
          <AlertDialog.Content
            className="radix-surface radix-modal-content"
            data-radix-smoke-content
            data-testid="alert-dialog-content"
          >
            <AlertDialog.Title className="radix-title">Radix alert dialog</AlertDialog.Title>
            <AlertDialog.Description className="radix-description">
              Confirm a compatibility action.
            </AlertDialog.Description>
            <AlertDialog.Cancel className="radix-close">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action className="radix-trigger">Continue</AlertDialog.Action>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </SmokeFrame>
  );
}

function AspectRatioFixture() {
  return (
    <SmokeFrame>
      <AspectRatio.Root className="radix-aspect" ratio={16 / 9} data-radix-smoke-content>
        <div className="radix-aspect-inner">Aspect ratio content</div>
      </AspectRatio.Root>
    </SmokeFrame>
  );
}

function AvatarFixture() {
  return (
    <SmokeFrame>
      <Avatar.Root className="radix-avatar" data-radix-smoke-content>
        <Avatar.Fallback className="radix-avatar-fallback">MR</Avatar.Fallback>
      </Avatar.Root>
    </SmokeFrame>
  );
}

function CheckboxFixture() {
  return (
    <SmokeFrame>
      <Checkbox.Root
        className="radix-checkbox"
        data-radix-smoke-content
        data-testid="checkbox-root"
      >
        <Checkbox.Indicator>checked</Checkbox.Indicator>
      </Checkbox.Root>
    </SmokeFrame>
  );
}

function CollapsibleFixture() {
  return (
    <SmokeFrame>
      <Collapsible.Root className="radix-stack">
        <Collapsible.Trigger className="radix-trigger" data-testid="collapsible-trigger">
          Open collapsible
        </Collapsible.Trigger>
        <Collapsible.Content className="radix-panel" data-radix-smoke-content>
          Collapsible content
        </Collapsible.Content>
      </Collapsible.Root>
    </SmokeFrame>
  );
}

function ContextMenuFixture() {
  return (
    <SmokeFrame>
      <ContextMenu.Root>
        <ContextMenu.Trigger className="radix-context-target" data-testid="context-menu-target">
          Right click target
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="radix-surface radix-positioned-content"
            data-radix-smoke-content
            data-testid="context-menu-content"
          >
            <ContextMenu.Item className="radix-menu-item">Context action</ContextMenu.Item>
            <ContextMenu.Item className="radix-menu-item">Inspect target</ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </SmokeFrame>
  );
}

function DialogFixture() {
  return (
    <SmokeFrame>
      <Dialog.Root>
        <Dialog.Trigger className="radix-trigger" data-testid="dialog-trigger">
          Open dialog
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay" data-testid="dialog-overlay" />
          <Dialog.Content
            className="radix-surface radix-modal-content"
            data-radix-smoke-content
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
    </SmokeFrame>
  );
}

function FormFixture() {
  const [submitted, setSubmitted] = useState("not submitted");

  return (
    <SmokeFrame>
      <Form.Root
        className="radix-stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted("submitted");
        }}
      >
        <Form.Field name="email">
          <Form.Label>Email</Form.Label>
          <Form.Control className="radix-input" defaultValue="compat@example.test" type="email" />
        </Form.Field>
        <Form.Submit className="radix-trigger" data-testid="form-submit">
          Submit form
        </Form.Submit>
        <div data-radix-smoke-content>{submitted}</div>
      </Form.Root>
    </SmokeFrame>
  );
}

function HoverCardFixture() {
  return (
    <SmokeFrame>
      <HoverCard.Root closeDelay={0} openDelay={0}>
        <HoverCard.Trigger className="radix-trigger" data-testid="hover-card-trigger">
          Hover card
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            className="radix-surface radix-positioned-content"
            data-radix-smoke-content
            data-testid="hover-card-content"
            sideOffset={8}
          >
            Hover card content
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    </SmokeFrame>
  );
}

function LabelFixture() {
  return (
    <SmokeFrame>
      <div className="radix-stack" data-radix-smoke-content>
        <Label.Root htmlFor="radix-label-input">Label text</Label.Root>
        <input className="radix-input" id="radix-label-input" defaultValue="labeled" />
      </div>
    </SmokeFrame>
  );
}

function MenubarFixture() {
  return (
    <SmokeFrame>
      <Menubar.Root className="radix-toolbar">
        <Menubar.Menu>
          <Menubar.Trigger className="radix-trigger" data-testid="menubar-trigger">
            File
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content
              className="radix-surface radix-positioned-content"
              data-radix-smoke-content
              data-testid="menubar-content"
            >
              <Menubar.Item className="radix-menu-item">New file</Menubar.Item>
              <Menubar.Item className="radix-menu-item">Save file</Menubar.Item>
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      </Menubar.Root>
    </SmokeFrame>
  );
}

function NavigationMenuFixture() {
  return (
    <SmokeFrame>
      <NavigationMenu.Root>
        <NavigationMenu.List className="radix-toolbar">
          <NavigationMenu.Item value="docs">
            <NavigationMenu.Trigger className="radix-trigger" data-testid="navigation-trigger">
              Docs
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="radix-panel" data-radix-smoke-content>
              Navigation content
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    </SmokeFrame>
  );
}

function OneTimePasswordFieldFixture() {
  return (
    <SmokeFrame>
      <OneTimePasswordField.Root className="radix-otp" data-radix-smoke-content>
        <OneTimePasswordField.Input
          className="radix-input radix-otp-input"
          data-testid="otp-input-0"
          index={0}
        />
        <OneTimePasswordField.Input
          className="radix-input radix-otp-input"
          data-testid="otp-input-1"
          index={1}
        />
        <OneTimePasswordField.Input
          className="radix-input radix-otp-input"
          data-testid="otp-input-2"
          index={2}
        />
        <OneTimePasswordField.HiddenInput name="otp" />
      </OneTimePasswordField.Root>
    </SmokeFrame>
  );
}

function PasswordToggleFieldFixture() {
  return (
    <SmokeFrame>
      <PasswordToggleField.Root>
        <PasswordToggleField.Input
          className="radix-input"
          data-radix-smoke-content
          data-testid="password-input"
          defaultValue="secret"
        />
        <PasswordToggleField.Toggle className="radix-trigger" data-testid="password-toggle">
          <PasswordToggleField.Slot hidden="Show password" visible="Hide password" />
        </PasswordToggleField.Toggle>
      </PasswordToggleField.Root>
    </SmokeFrame>
  );
}

function PopoverFixture() {
  return (
    <SmokeFrame>
      <Popover.Root>
        <Popover.Trigger className="radix-trigger" data-testid="popover-trigger">
          Open popover
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            className="radix-surface radix-positioned-content"
            data-radix-smoke-content
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
    </SmokeFrame>
  );
}

function ProgressFixture() {
  return (
    <SmokeFrame>
      <Progress.Root className="radix-progress" data-radix-smoke-content value={64}>
        <Progress.Indicator
          className="radix-progress-indicator"
          style={{ transform: "translateX(-36%)" }}
        />
      </Progress.Root>
    </SmokeFrame>
  );
}

function RadioGroupFixture() {
  return (
    <SmokeFrame>
      <RadioGroup.Root className="radix-stack" defaultValue="alpha" data-radix-smoke-content>
        <RadioGroup.Item className="radix-radio" value="alpha">
          <RadioGroup.Indicator>selected</RadioGroup.Indicator>
        </RadioGroup.Item>
        <RadioGroup.Item className="radix-radio" data-testid="radio-beta" value="beta">
          <RadioGroup.Indicator>selected</RadioGroup.Indicator>
        </RadioGroup.Item>
      </RadioGroup.Root>
    </SmokeFrame>
  );
}

function ScrollAreaFixture() {
  return (
    <SmokeFrame>
      <ScrollArea.Root className="radix-scroll-area" data-radix-smoke-content>
        <ScrollArea.Viewport className="radix-scroll-viewport">
          <div>Scroll row one</div>
          <div>Scroll row two</div>
          <div>Scroll row three</div>
          <div>Scroll row four</div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="radix-scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="radix-scroll-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </SmokeFrame>
  );
}

function SelectFixture() {
  return (
    <SmokeFrame>
      <Select.Root defaultValue="alpha">
        <Select.Trigger className="radix-trigger" data-testid="select-trigger">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="radix-surface radix-positioned-content"
            data-radix-smoke-content
          >
            <Select.Viewport>
              <Select.Item className="radix-menu-item" value="alpha">
                <Select.ItemText>Alpha option</Select.ItemText>
              </Select.Item>
              <Select.Item className="radix-menu-item" data-testid="select-beta" value="beta">
                <Select.ItemText>Beta option</Select.ItemText>
              </Select.Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </SmokeFrame>
  );
}

function SeparatorFixture() {
  return (
    <SmokeFrame>
      <div className="radix-stack" data-radix-smoke-content>
        <span>Before separator</span>
        <Separator.Root className="radix-separator" />
        <span>After separator</span>
      </div>
    </SmokeFrame>
  );
}

function SliderFixture() {
  return (
    <SmokeFrame>
      <Slider.Root
        className="radix-slider"
        data-radix-smoke-content
        defaultValue={[32]}
        max={100}
        step={1}
      >
        <Slider.Track className="radix-slider-track">
          <Slider.Range className="radix-slider-range" />
        </Slider.Track>
        <Slider.Thumb className="radix-slider-thumb" data-testid="slider-thumb" />
      </Slider.Root>
    </SmokeFrame>
  );
}

function SwitchFixture() {
  return (
    <SmokeFrame>
      <Switch.Root className="radix-switch" data-radix-smoke-content data-testid="switch-root">
        <Switch.Thumb className="radix-switch-thumb" />
      </Switch.Root>
    </SmokeFrame>
  );
}

function TabsFixture() {
  return (
    <SmokeFrame>
      <Tabs.Root className="radix-stack" defaultValue="one">
        <Tabs.List className="radix-toolbar">
          <Tabs.Trigger className="radix-trigger" value="one">
            One
          </Tabs.Trigger>
          <Tabs.Trigger className="radix-trigger" data-testid="tabs-two" value="two">
            Two
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="radix-panel" value="one">
          Tab one
        </Tabs.Content>
        <Tabs.Content className="radix-panel" data-radix-smoke-content value="two">
          Tab two
        </Tabs.Content>
      </Tabs.Root>
    </SmokeFrame>
  );
}

function ToastFixture() {
  const [open, setOpen] = useState(false);

  return (
    <SmokeFrame>
      <Toast.Provider duration={100000}>
        <button className="radix-trigger" data-testid="toast-trigger" onClick={() => setOpen(true)}>
          Open toast
        </button>
        <Toast.Root
          className="radix-toast"
          data-radix-smoke-content
          open={open}
          onOpenChange={setOpen}
        >
          <Toast.Title>Radix toast</Toast.Title>
          <Toast.Description>Toast body</Toast.Description>
        </Toast.Root>
        <Toast.Viewport className="radix-toast-viewport" />
      </Toast.Provider>
    </SmokeFrame>
  );
}

function ToggleFixture() {
  return (
    <SmokeFrame>
      <Toggle.Root className="radix-trigger" data-radix-smoke-content data-testid="toggle-root">
        Toggle item
      </Toggle.Root>
    </SmokeFrame>
  );
}

function ToggleGroupFixture() {
  return (
    <SmokeFrame>
      <ToggleGroup.Root className="radix-toolbar" data-radix-smoke-content type="single">
        <ToggleGroup.Item className="radix-trigger" value="left">
          Left
        </ToggleGroup.Item>
        <ToggleGroup.Item className="radix-trigger" data-testid="toggle-group-right" value="right">
          Right
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </SmokeFrame>
  );
}

function ToolbarFixture() {
  const [state, setState] = useState("idle");

  return (
    <SmokeFrame>
      <Toolbar.Root className="radix-toolbar" data-radix-smoke-content>
        <Toolbar.Button
          className="radix-trigger"
          data-testid="toolbar-button"
          onClick={() => setState("clicked")}
        >
          Toolbar action
        </Toolbar.Button>
        <Toolbar.Separator className="radix-menu-separator" />
        <Toolbar.ToggleGroup type="single">
          <Toolbar.ToggleItem className="radix-trigger" value="bold">
            Bold
          </Toolbar.ToggleItem>
        </Toolbar.ToggleGroup>
        <span>{state}</span>
      </Toolbar.Root>
    </SmokeFrame>
  );
}

function DropdownMenuFixture() {
  return (
    <SmokeFrame>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="radix-trigger" data-testid="dropdown-trigger">
          Open menu
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="center"
            className="radix-surface radix-positioned-content"
            data-radix-smoke-content
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
    </SmokeFrame>
  );
}

function TooltipFixture() {
  return (
    <SmokeFrame>
      <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger className="radix-trigger" data-testid="tooltip-trigger">
            Inspect tooltip
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="radix-tooltip"
              data-radix-smoke-content
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
    </SmokeFrame>
  );
}

export const radixFixtures: RadixFixture[] = [
  {
    id: "radix-accordion-opens-item",
    library: "radix-ui",
    title: "Accordion opens item",
    description: "Accordion content appears after clicking its trigger.",
    features: ["Accordion.Root", "Accordion.Item", "Accordion.Trigger", "Accordion.Content"],
    riskTags: ["aria-state", "event-delegation"],
    viewport: smokeViewport,
    render: () => <AccordionFixture />,
    interactions: [
      { name: "Click trigger", description: "Open accordion item.", run: "clickAccordionTrigger" },
    ],
  },
  {
    id: "radix-alert-dialog-opens",
    library: "radix-ui",
    title: "AlertDialog opens",
    description: "AlertDialog content appears after clicking its trigger.",
    features: ["AlertDialog.Root", "AlertDialog.Trigger", "AlertDialog.Content"],
    riskTags: ["portal", "aria-state", "focus-management", "event-delegation"],
    viewport: dialogViewport,
    render: () => <AlertDialogFixture />,
    interactions: [
      { name: "Click trigger", description: "Open alert dialog.", run: "clickAlertDialogTrigger" },
    ],
  },
  {
    id: "radix-aspect-ratio-renders",
    library: "radix-ui",
    title: "AspectRatio renders",
    description: "AspectRatio lays out deterministic content.",
    features: ["AspectRatio.Root"],
    riskTags: ["layout-measurement"],
    viewport: smokeViewport,
    render: () => <AspectRatioFixture />,
  },
  {
    id: "radix-avatar-renders-fallback",
    library: "radix-ui",
    title: "Avatar renders fallback",
    description: "Avatar fallback appears without loading an external image.",
    features: ["Avatar.Root", "Avatar.Fallback"],
    riskTags: ["effect-timing"],
    viewport: smokeViewport,
    render: () => <AvatarFixture />,
  },
  {
    id: "radix-checkbox-toggles",
    library: "radix-ui",
    title: "Checkbox toggles",
    description: "Checkbox toggles its checked state.",
    features: ["Checkbox.Root", "Checkbox.Indicator"],
    riskTags: ["aria-state", "event-delegation"],
    viewport: smokeViewport,
    render: () => <CheckboxFixture />,
    interactions: [
      { name: "Click checkbox", description: "Toggle checkbox.", run: "clickCheckbox" },
    ],
  },
  {
    id: "radix-collapsible-opens",
    library: "radix-ui",
    title: "Collapsible opens",
    description: "Collapsible content appears after clicking the trigger.",
    features: ["Collapsible.Root", "Collapsible.Trigger", "Collapsible.Content"],
    riskTags: ["aria-state", "event-delegation"],
    viewport: smokeViewport,
    render: () => <CollapsibleFixture />,
    interactions: [
      { name: "Click trigger", description: "Open collapsible.", run: "clickCollapsibleTrigger" },
    ],
  },
  {
    id: "radix-context-menu-opens",
    library: "radix-ui",
    title: "ContextMenu opens",
    description: "ContextMenu content appears from a right click.",
    features: ["ContextMenu.Root", "ContextMenu.Trigger", "ContextMenu.Content"],
    riskTags: ["portal", "event-delegation", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <ContextMenuFixture />,
    interactions: [
      {
        name: "Right click target",
        description: "Open context menu.",
        run: "rightClickContextMenuTarget",
      },
    ],
  },
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
      { name: "Click trigger", description: "Open the dialog.", run: "clickDialogTrigger" },
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
      { name: "Click trigger", description: "Open the dialog.", run: "clickDialogTrigger" },
      { name: "Click close", description: "Close the dialog.", run: "clickDialogClose" },
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
      { name: "Click trigger", description: "Open the dialog.", run: "clickDialogTrigger" },
      { name: "Press Escape", description: "Close the dialog with Escape.", run: "pressEscape" },
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
      { name: "Click trigger", description: "Open the dialog.", run: "clickDialogTrigger" },
      { name: "Click outside", description: "Dismiss the dialog.", run: "clickOutsideDialog" },
    ],
  },
  {
    id: "radix-form-submits",
    library: "radix-ui",
    title: "Form submits",
    description: "Form primitives submit and update local state.",
    features: ["Form.Root", "Form.Field", "Form.Control", "Form.Submit"],
    riskTags: ["event-delegation", "aria-state"],
    viewport: smokeViewport,
    render: () => <FormFixture />,
    interactions: [{ name: "Submit form", description: "Submit the form.", run: "submitForm" }],
  },
  {
    id: "radix-hover-card-shows-on-hover",
    library: "radix-ui",
    title: "HoverCard shows on hover",
    description: "HoverCard content appears from pointer hover.",
    features: ["HoverCard.Root", "HoverCard.Trigger", "HoverCard.Content"],
    riskTags: ["portal", "pointer-hover", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <HoverCardFixture />,
    interactions: [
      { name: "Hover trigger", description: "Show hover card.", run: "hoverHoverCardTrigger" },
    ],
  },
  {
    id: "radix-label-links-control",
    library: "radix-ui",
    title: "Label links control",
    description: "Label renders with a linked native input.",
    features: ["Label.Root"],
    riskTags: ["aria-state"],
    viewport: smokeViewport,
    render: () => <LabelFixture />,
  },
  {
    id: "radix-menubar-opens-menu",
    library: "radix-ui",
    title: "Menubar opens menu",
    description: "Menubar menu content appears after clicking a trigger.",
    features: ["Menubar.Root", "Menubar.Menu", "Menubar.Trigger", "Menubar.Content"],
    riskTags: ["portal", "focus-management", "event-delegation"],
    viewport: overlayViewport,
    render: () => <MenubarFixture />,
    interactions: [
      { name: "Click trigger", description: "Open menubar menu.", run: "clickMenubarTrigger" },
    ],
  },
  {
    id: "radix-navigation-menu-opens-item",
    library: "radix-ui",
    title: "NavigationMenu opens item",
    description: "NavigationMenu content appears after interacting with a trigger.",
    features: ["NavigationMenu.Root", "NavigationMenu.List", "NavigationMenu.Trigger"],
    riskTags: ["aria-state", "pointer-hover", "event-delegation"],
    viewport: smokeViewport,
    render: () => <NavigationMenuFixture />,
    interactions: [
      {
        name: "Hover trigger",
        description: "Open navigation item.",
        run: "hoverNavigationTrigger",
      },
    ],
  },
  {
    id: "radix-one-time-password-field-accepts-input",
    library: "radix-ui",
    title: "OneTimePasswordField accepts input",
    description: "OTP field accepts a single character input.",
    features: [
      "OneTimePasswordField.Root",
      "OneTimePasswordField.Input",
      "OneTimePasswordField.HiddenInput",
    ],
    riskTags: ["event-delegation", "focus-management"],
    viewport: smokeViewport,
    render: () => <OneTimePasswordFieldFixture />,
    interactions: [
      { name: "Input OTP", description: "Fill the first OTP slot.", run: "inputOtpValue" },
    ],
  },
  {
    id: "radix-password-toggle-field-toggles",
    library: "radix-ui",
    title: "PasswordToggleField toggles",
    description: "Password visibility toggle changes the visible slot text.",
    features: [
      "PasswordToggleField.Root",
      "PasswordToggleField.Input",
      "PasswordToggleField.Toggle",
    ],
    riskTags: ["event-delegation", "aria-state"],
    viewport: smokeViewport,
    render: () => <PasswordToggleFieldFixture />,
    interactions: [
      {
        name: "Click toggle",
        description: "Toggle password visibility.",
        run: "clickPasswordToggle",
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
      { name: "Click trigger", description: "Open the popover.", run: "clickPopoverTrigger" },
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
      { name: "Click trigger", description: "Open the popover.", run: "clickPopoverTrigger" },
      {
        name: "Click outside",
        description: "Click away from the popover.",
        run: "clickOutsideOverlay",
      },
    ],
  },
  {
    id: "radix-progress-renders-value",
    library: "radix-ui",
    title: "Progress renders value",
    description: "Progress renders a deterministic indicator.",
    features: ["Progress.Root", "Progress.Indicator"],
    riskTags: ["aria-state"],
    viewport: smokeViewport,
    render: () => <ProgressFixture />,
  },
  {
    id: "radix-radio-group-selects-option",
    library: "radix-ui",
    title: "RadioGroup selects option",
    description: "RadioGroup selection moves to a second item.",
    features: ["RadioGroup.Root", "RadioGroup.Item", "RadioGroup.Indicator"],
    riskTags: ["aria-state", "event-delegation", "focus-management"],
    viewport: smokeViewport,
    render: () => <RadioGroupFixture />,
    interactions: [
      { name: "Click beta", description: "Select second radio item.", run: "clickRadioSecondItem" },
    ],
  },
  {
    id: "radix-scroll-area-renders-viewport",
    library: "radix-ui",
    title: "ScrollArea renders viewport",
    description: "ScrollArea renders a viewport and scrollbar.",
    features: ["ScrollArea.Root", "ScrollArea.Viewport", "ScrollArea.Scrollbar"],
    riskTags: ["layout-measurement"],
    viewport: smokeViewport,
    render: () => <ScrollAreaFixture />,
  },
  {
    id: "radix-select-chooses-option",
    library: "radix-ui",
    title: "Select chooses option",
    description: "Select opens, then chooses the second item.",
    features: ["Select.Root", "Select.Trigger", "Select.Content", "Select.Item"],
    riskTags: ["portal", "aria-state", "focus-management", "event-delegation"],
    viewport: overlayViewport,
    render: () => <SelectFixture />,
    interactions: [
      { name: "Click trigger", description: "Open select.", run: "clickSelectTrigger" },
      {
        name: "Click second item",
        description: "Choose the beta option.",
        run: "clickSelectSecondItem",
      },
    ],
  },
  {
    id: "radix-separator-renders",
    library: "radix-ui",
    title: "Separator renders",
    description: "Separator renders between two pieces of content.",
    features: ["Separator.Root"],
    riskTags: ["aria-state"],
    viewport: smokeViewport,
    render: () => <SeparatorFixture />,
  },
  {
    id: "radix-slider-changes-value",
    library: "radix-ui",
    title: "Slider changes value",
    description: "Slider handles keyboard value change.",
    features: ["Slider.Root", "Slider.Track", "Slider.Thumb"],
    riskTags: ["aria-state", "focus-management", "event-delegation"],
    viewport: smokeViewport,
    render: () => <SliderFixture />,
    interactions: [
      {
        name: "Keyboard increment",
        description: "Move slider by keyboard.",
        run: "incrementSlider",
      },
    ],
  },
  {
    id: "radix-switch-toggles",
    library: "radix-ui",
    title: "Switch toggles",
    description: "Switch toggles checked state.",
    features: ["Switch.Root", "Switch.Thumb"],
    riskTags: ["aria-state", "event-delegation"],
    viewport: smokeViewport,
    render: () => <SwitchFixture />,
    interactions: [{ name: "Click switch", description: "Toggle switch.", run: "clickSwitch" }],
  },
  {
    id: "radix-tabs-switches-tab",
    library: "radix-ui",
    title: "Tabs switches tab",
    description: "Tabs switches to second content.",
    features: ["Tabs.Root", "Tabs.List", "Tabs.Trigger", "Tabs.Content"],
    riskTags: ["aria-state", "focus-management", "event-delegation"],
    viewport: smokeViewport,
    render: () => <TabsFixture />,
    interactions: [
      { name: "Click second tab", description: "Select tab two.", run: "clickTabsSecondTrigger" },
    ],
  },
  {
    id: "radix-toast-opens",
    library: "radix-ui",
    title: "Toast opens",
    description: "Toast appears after clicking a trigger button.",
    features: ["Toast.Provider", "Toast.Root", "Toast.Viewport"],
    riskTags: ["portal", "aria-state", "event-delegation"],
    viewport: overlayViewport,
    render: () => <ToastFixture />,
    interactions: [{ name: "Click trigger", description: "Open toast.", run: "clickToastTrigger" }],
  },
  {
    id: "radix-toggle-toggles",
    library: "radix-ui",
    title: "Toggle toggles",
    description: "Toggle changes pressed state.",
    features: ["Toggle.Root"],
    riskTags: ["aria-state", "event-delegation"],
    viewport: smokeViewport,
    render: () => <ToggleFixture />,
    interactions: [
      { name: "Click toggle", description: "Toggle pressed state.", run: "clickToggle" },
    ],
  },
  {
    id: "radix-toggle-group-selects-item",
    library: "radix-ui",
    title: "ToggleGroup selects item",
    description: "ToggleGroup selects a second item.",
    features: ["ToggleGroup.Root", "ToggleGroup.Item"],
    riskTags: ["aria-state", "event-delegation"],
    viewport: smokeViewport,
    render: () => <ToggleGroupFixture />,
    interactions: [
      { name: "Click right", description: "Select right item.", run: "clickToggleGroupSecond" },
    ],
  },
  {
    id: "radix-toolbar-activates-button",
    library: "radix-ui",
    title: "Toolbar activates button",
    description: "Toolbar button handles a click inside toolbar primitives.",
    features: ["Toolbar.Root", "Toolbar.Button", "Toolbar.ToggleGroup"],
    riskTags: ["focus-management", "event-delegation"],
    viewport: smokeViewport,
    render: () => <ToolbarFixture />,
    interactions: [
      { name: "Click toolbar", description: "Activate toolbar button.", run: "clickToolbarButton" },
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
      { name: "Click trigger", description: "Open dropdown menu.", run: "clickDropdownTrigger" },
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
      { name: "Click trigger", description: "Open dropdown menu.", run: "clickDropdownTrigger" },
      { name: "Press Escape", description: "Close dropdown menu.", run: "pressEscape" },
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
      { name: "Hover trigger", description: "Show tooltip.", run: "hoverTooltipTrigger" },
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
      { name: "Focus trigger", description: "Show tooltip.", run: "focusTooltipTrigger" },
    ],
  },
];
