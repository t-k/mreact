import { useRef, useState, type ReactNode } from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Heading as AriaHeading,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFieldArray, useForm } from "react-hook-form";
import {
  Dialog as HeadlessDialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Menu as HeadlessMenu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import type { UiPrimitiveFixture } from "./types.js";

const dialogViewport = { width: 760, height: 520 };
const overlayViewport = { width: 820, height: 560 };
const smokeViewport = { width: 820, height: 560 };
const virtualViewport = { width: 880, height: 620 };

function SmokeFrame(props: { children: ReactNode }) {
  return <div className="ui-frame">{props.children}</div>;
}

function ReactAriaDialogFixture() {
  return (
    <SmokeFrame>
      <AriaDialogTrigger>
        <AriaButton className="ui-trigger" data-testid="react-aria-dialog-trigger">
          Open React Aria dialog
        </AriaButton>
        <AriaModalOverlay className="ui-overlay">
          <AriaModal className="ui-modal">
            <AriaDialog className="ui-surface" data-testid="react-aria-dialog">
              <AriaHeading className="ui-title" slot="title">
                React Aria dialog
              </AriaHeading>
              <p data-ui-smoke-content>Dialog content managed by React Aria Components.</p>
            </AriaDialog>
          </AriaModal>
        </AriaModalOverlay>
      </AriaDialogTrigger>
    </SmokeFrame>
  );
}

function ReactAriaListBoxFixture() {
  const [selected, setSelected] = useState("alpha");
  const items = [
    { id: "alpha", name: "Alpha action" },
    { id: "beta", name: "Beta action" },
  ];

  return (
    <SmokeFrame>
      <AriaListBox
        aria-label="React Aria actions"
        className="ui-surface ui-menu"
        data-testid="react-aria-listbox"
        items={items}
        onSelectionChange={(keys) => {
          if (keys !== "all") {
            setSelected(String([...keys][0] ?? "none"));
          }
        }}
        selectedKeys={new Set([selected])}
        selectionMode="single"
      >
        {(item) => (
          <AriaListBoxItem
            className="ui-menu-item"
            data-testid={`react-aria-listbox-item-${item.id}`}
            id={item.id}
            textValue={item.name}
          >
            {({ isSelected }) => `${item.name}${isSelected ? " selected" : ""}`}
          </AriaListBoxItem>
        )}
      </AriaListBox>
      <div data-ui-form-state data-ui-smoke-content>
        React Aria selected: {selected}
      </div>
    </SmokeFrame>
  );
}

function FloatingPopoverFixture() {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    middleware: [offset(8), flip(), shift()],
    onOpenChange: setOpen,
    open,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps, getReferenceProps } = useInteractions([click, dismiss, role]);

  return (
    <SmokeFrame>
      <button
        className="ui-trigger"
        data-testid="floating-popover-trigger"
        ref={refs.setReference}
        type="button"
        {...getReferenceProps()}
      >
        Open Floating UI popover
      </button>
      {open ? (
        <FloatingPortal>
          <div
            className="ui-surface ui-positioned"
            data-testid="floating-popover-content"
            data-ui-smoke-content
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            Floating popover content
          </div>
        </FloatingPortal>
      ) : null}
    </SmokeFrame>
  );
}

function FloatingTooltipFixture() {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    middleware: [offset(8), flip(), shift()],
    onOpenChange: setOpen,
    open,
    placement: "top",
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const role = useRole(context, { role: "tooltip" });
  const { getFloatingProps, getReferenceProps } = useInteractions([hover, focus, role]);

  return (
    <SmokeFrame>
      <button
        className="ui-trigger"
        data-testid="floating-tooltip-trigger"
        ref={refs.setReference}
        type="button"
        {...getReferenceProps()}
      >
        Inspect Floating UI tooltip
      </button>
      {open ? (
        <FloatingPortal>
          <div
            className="ui-tooltip"
            data-testid="floating-tooltip-content"
            data-ui-smoke-content
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            Floating tooltip content
          </div>
        </FloatingPortal>
      ) : null}
    </SmokeFrame>
  );
}

function TanStackVirtualFixture() {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rows = Array.from({ length: 80 }, (_, index) => `Virtual row ${index + 1}`);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 32,
    getScrollElement: () => parentRef.current,
    overscan: 4,
    useFlushSync: true,
  });

  return (
    <SmokeFrame>
      <div className="ui-virtual-shell" data-ui-smoke-content>
        <div className="ui-virtual-status" data-ui-form-state>
          Virtual total: {rowVirtualizer.getTotalSize()}
        </div>
        <div className="ui-virtual-scroll" data-testid="virtual-scroll-container" ref={parentRef}>
          <div
            className="ui-virtual-spacer"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                className="ui-virtual-row"
                data-index={virtualRow.index}
                data-ui-virtual-row
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rows[virtualRow.index]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SmokeFrame>
  );
}

interface HookFormValues {
  email: string;
  name: string;
}

function ReactHookFormFixture() {
  const [submitted, setSubmitted] = useState("not submitted");
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<HookFormValues>({
    defaultValues: { email: "before@example.test", name: "Compat User" },
    mode: "onBlur",
  });

  return (
    <SmokeFrame>
      <form
        className="ui-stack"
        onSubmit={handleSubmit((values) => setSubmitted(`submitted:${values.email}:${values.name}`))}
      >
        <label className="ui-label" htmlFor="hook-form-email">
          Email
        </label>
        <input
          className="ui-input"
          data-testid="hook-form-email"
          id="hook-form-email"
          type="email"
          {...register("email", { required: "Email required" })}
        />
        <label className="ui-label" htmlFor="hook-form-name">
          Name
        </label>
        <input
          className="ui-input"
          data-testid="hook-form-name"
          id="hook-form-name"
          {...register("name")}
        />
        <button className="ui-trigger" data-testid="hook-form-submit" type="submit">
          Submit hook form
        </button>
        <div data-ui-form-state data-ui-smoke-content>
          {errors.email?.message ?? submitted}
        </div>
      </form>
    </SmokeFrame>
  );
}

interface FieldArrayValues {
  items: { label: string }[];
}

function ReactHookFormFieldArrayFixture() {
  const [summary, setSummary] = useState("field array idle");
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<FieldArrayValues>({
    defaultValues: { items: [{ label: "Alpha" }] },
    mode: "onSubmit",
  });
  const { append, fields } = useFieldArray({ control, name: "items" });
  const errorCount = errors.items?.filter?.((item) => item?.label).length ?? 0;

  return (
    <SmokeFrame>
      <form
        className="ui-stack"
        onSubmit={handleSubmit(
          (values) => setSummary(`items:${values.items.map((item) => item.label).join("|")}`),
          () => setSummary(`errors:${errorCount}`),
        )}
      >
        {fields.map((field, index) => (
          <label className="ui-label" key={field.id}>
            Item {index + 1}
            <input
              className="ui-input"
              data-testid={`hook-form-array-item-${index}`}
              {...register(`items.${index}.label`, { required: "Item required" })}
            />
          </label>
        ))}
        <button
          className="ui-trigger"
          data-testid="hook-form-add-item"
          onClick={() => append({ label: "" })}
          type="button"
        >
          Add item
        </button>
        <button className="ui-trigger" data-testid="hook-form-submit" type="submit">
          Submit items
        </button>
        <div data-ui-form-state data-ui-smoke-content>
          {summary}
        </div>
      </form>
    </SmokeFrame>
  );
}

function HeadlessDialogFixture() {
  const [open, setOpen] = useState(false);

  return (
    <SmokeFrame>
      <button
        className="ui-trigger"
        data-testid="headless-dialog-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        Open Headless UI dialog
      </button>
      <HeadlessDialog className="ui-headless-dialog" onClose={setOpen} open={open}>
        <DialogBackdrop className="ui-overlay" />
        <div className="ui-dialog-positioner">
          <DialogPanel className="ui-surface" data-testid="headless-dialog-panel">
            <DialogTitle className="ui-title">Headless UI dialog</DialogTitle>
            <p data-ui-smoke-content>Dialog content managed by Headless UI.</p>
          </DialogPanel>
        </div>
      </HeadlessDialog>
    </SmokeFrame>
  );
}

function HeadlessListboxFixture() {
  const options = ["Alpha option", "Beta option", "Gamma option"];
  const [selected, setSelected] = useState(options[0]!);

  return (
    <SmokeFrame>
      <Listbox value={selected} onChange={setSelected}>
        <ListboxButton className="ui-trigger" data-testid="headless-listbox-button">
          {selected}
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="ui-surface ui-positioned"
          data-testid="headless-listbox-options"
        >
          {options.map((option) => (
            <ListboxOption
              className="ui-menu-item"
              data-testid={`headless-listbox-option-${option.startsWith("Beta") ? "beta" : "other"}`}
              key={option}
              value={option}
            >
              {option}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
      <div data-ui-form-state data-ui-smoke-content>
        Headless selected: {selected}
      </div>
    </SmokeFrame>
  );
}

function HeadlessMenuFixture() {
  return (
    <SmokeFrame>
      <HeadlessMenu>
        <MenuButton className="ui-trigger" data-testid="headless-menu-button">
          Open Headless menu
        </MenuButton>
        <MenuItems
          anchor="bottom start"
          className="ui-surface ui-positioned"
          data-testid="headless-menu-items"
        >
          <MenuItem>
            <button className="ui-menu-item" data-ui-smoke-content type="button">
              Archive
            </button>
          </MenuItem>
          <MenuItem>
            <button className="ui-menu-item" type="button">
              Duplicate
            </button>
          </MenuItem>
        </MenuItems>
      </HeadlessMenu>
    </SmokeFrame>
  );
}

export const uiPrimitiveFixtures: UiPrimitiveFixture[] = [
  {
    id: "react-aria-dialog-opens-and-closes",
    packageName: "react-aria-components",
    title: "React Aria dialog opens and closes",
    description: "DialogTrigger opens modal content and Escape closes it.",
    features: ["DialogTrigger", "ModalOverlay", "Modal", "Dialog"],
    riskTags: ["portal", "aria-state", "focus-management", "escape-key", "render-props"],
    viewport: dialogViewport,
    render: () => <ReactAriaDialogFixture />,
    interactions: [
      { name: "Click trigger", description: "Open the dialog.", run: "clickReactAriaDialogTrigger" },
      { name: "Press Escape", description: "Close the dialog with Escape.", run: "pressEscape" },
    ],
  },
  {
    id: "react-aria-listbox-selects-item",
    packageName: "react-aria-components",
    title: "React Aria listbox selects item",
    description: "ListBox collection renders dynamic items and selects the second action.",
    features: ["ListBox", "ListBoxItem", "collection render props"],
    riskTags: ["positioned-overlay", "aria-state", "focus-management", "event-delegation", "render-props"],
    viewport: overlayViewport,
    render: () => <ReactAriaListBoxFixture />,
    interactions: [
      {
        name: "Click beta item",
        description: "Select the dynamic beta item.",
        run: "clickReactAriaListboxSecondItem",
      },
    ],
  },
  {
    id: "floating-ui-popover-dismisses",
    packageName: "@floating-ui/react",
    title: "Floating UI popover dismisses",
    description: "A clicked popover opens in a portal and dismisses on outside pointer interaction.",
    features: ["useFloating", "FloatingPortal", "useClick", "useDismiss"],
    riskTags: ["portal", "positioned-overlay", "outside-click", "event-delegation"],
    viewport: overlayViewport,
    render: () => <FloatingPopoverFixture />,
    interactions: [
      { name: "Click trigger", description: "Open the popover.", run: "clickFloatingPopoverTrigger" },
      { name: "Click outside", description: "Dismiss the popover.", run: "clickOutsideOverlay" },
    ],
  },
  {
    id: "floating-ui-tooltip-shows-on-hover",
    packageName: "@floating-ui/react",
    title: "Floating UI tooltip shows on hover",
    description: "Hover and focus interactions mount positioned tooltip content.",
    features: ["useFloating", "useHover", "useFocus", "useRole"],
    riskTags: ["portal", "positioned-overlay", "pointer-hover", "focus-management"],
    viewport: overlayViewport,
    render: () => <FloatingTooltipFixture />,
    interactions: [
      { name: "Hover trigger", description: "Open the tooltip.", run: "hoverFloatingTooltipTrigger" },
    ],
  },
  {
    id: "tanstack-virtual-scrolls-measured-rows",
    packageName: "@tanstack/react-virtual",
    title: "TanStack Virtual scrolls measured rows",
    description: "Virtual rows update after scrolling a fixed container.",
    features: ["useVirtualizer", "measureElement", "useFlushSync"],
    riskTags: ["layout-measurement", "effect-timing", "ref-registration"],
    viewport: virtualViewport,
    render: () => <TanStackVirtualFixture />,
    interactions: [
      { name: "Scroll list", description: "Scroll the virtual list.", run: "scrollVirtualList" },
    ],
  },
  {
    id: "react-hook-form-submits-uncontrolled-fields",
    packageName: "react-hook-form",
    title: "React Hook Form submits uncontrolled fields",
    description: "Uncontrolled registered inputs submit changed values after blur validation.",
    features: ["useForm", "register", "handleSubmit"],
    riskTags: ["ref-registration", "uncontrolled-input", "event-delegation"],
    viewport: smokeViewport,
    render: () => <ReactHookFormFixture />,
    interactions: [
      { name: "Fill email", description: "Change registered email.", run: "fillHookFormEmail" },
      { name: "Blur email", description: "Run blur validation.", run: "blurHookFormEmail" },
      { name: "Submit form", description: "Submit changed values.", run: "submitHookForm" },
    ],
  },
  {
    id: "react-hook-form-field-array-validates-items",
    packageName: "react-hook-form",
    title: "React Hook Form field array validates items",
    description: "Field array appends a dynamic input, validates it, and submits a filled value.",
    features: ["useForm", "useFieldArray", "register"],
    riskTags: ["field-array", "ref-registration", "uncontrolled-input", "event-delegation"],
    viewport: smokeViewport,
    render: () => <ReactHookFormFieldArrayFixture />,
    interactions: [
      { name: "Add item", description: "Append a dynamic item.", run: "clickHookFormAddItem" },
      { name: "Submit empty", description: "Trigger validation.", run: "submitHookForm" },
      { name: "Fill item", description: "Fill the appended item.", run: "fillHookFormArrayItem" },
      { name: "Submit filled", description: "Submit dynamic values.", run: "submitHookForm" },
    ],
  },
  {
    id: "headless-ui-dialog-closes-with-escape",
    packageName: "@headlessui/react",
    title: "Headless UI dialog closes with Escape",
    description: "Managed Dialog opens from state and closes from Escape.",
    features: ["Dialog", "DialogBackdrop", "DialogPanel", "DialogTitle"],
    riskTags: ["portal", "aria-state", "focus-management", "escape-key"],
    viewport: dialogViewport,
    render: () => <HeadlessDialogFixture />,
    interactions: [
      { name: "Click trigger", description: "Open the dialog.", run: "clickHeadlessDialogTrigger" },
      { name: "Press Escape", description: "Close the dialog.", run: "pressEscape" },
    ],
  },
  {
    id: "headless-ui-listbox-selects-option",
    packageName: "@headlessui/react",
    title: "Headless UI listbox selects option",
    description: "Listbox opens and selects a second option.",
    features: ["Listbox", "ListboxButton", "ListboxOptions", "ListboxOption"],
    riskTags: ["aria-state", "focus-management", "event-delegation", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <HeadlessListboxFixture />,
    interactions: [
      { name: "Click button", description: "Open options.", run: "clickHeadlessListboxButton" },
      {
        name: "Click beta option",
        description: "Select beta option.",
        run: "clickHeadlessListboxSecondOption",
      },
    ],
  },
  {
    id: "headless-ui-menu-opens-with-keyboard",
    packageName: "@headlessui/react",
    title: "Headless UI menu opens with keyboard",
    description: "Menu opens from keyboard activation and exposes items.",
    features: ["Menu", "MenuButton", "MenuItems", "MenuItem"],
    riskTags: ["aria-state", "focus-management", "keyboard", "positioned-overlay"],
    viewport: overlayViewport,
    render: () => <HeadlessMenuFixture />,
    interactions: [
      { name: "Focus button", description: "Focus menu button.", run: "focusHeadlessMenuButton" },
      { name: "Press Enter", description: "Open menu.", run: "pressEnter" },
    ],
  },
];
