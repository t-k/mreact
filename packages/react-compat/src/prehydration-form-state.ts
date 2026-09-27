interface TextAreaState {
  selectionDirection: "backward" | "forward" | "none";
  selectionEnd: number;
  selectionStart: number;
  serverValue: string;
  value: string;
}

interface PreservedFormState {
  checked?: true;
  selectedOption?: HTMLOptionElement | null;
  selectedOptions?: readonly { option: HTMLOptionElement; selected: boolean }[];
  textarea?: TextAreaState;
  value?: true;
}

const prehydrationFormStates = new WeakMap<Element, PreservedFormState>();

export function capturePrehydrationFormState(
  element: Element,
  props: Record<string, unknown>,
): void {
  let state: PreservedFormState | undefined;

  if (element instanceof HTMLInputElement) {
    const serverValue = element.defaultValue;
    if (
      hasOwnProp(props, "value") &&
      stringValue(props.value) === serverValue &&
      element.value !== serverValue &&
      element.type !== "file"
    ) {
      state = { value: true };
    }

    const serverChecked = element.defaultChecked;
    if (
      hasOwnProp(props, "checked") &&
      booleanValue(props.checked) === serverChecked &&
      element.checked !== serverChecked
    ) {
      state ??= {};
      state.checked = true;
    }
  } else if (element instanceof HTMLTextAreaElement) {
    const serverValue = element.defaultValue;
    if (
      hasOwnProp(props, "value") &&
      stringValue(props.value) === serverValue &&
      element.value !== serverValue
    ) {
      state = {
        value: true,
        textarea: {
          selectionDirection: element.selectionDirection ?? "none",
          selectionEnd: element.selectionEnd,
          selectionStart: element.selectionStart,
          serverValue,
          value: element.value,
        },
      };
    }
  } else if (element instanceof HTMLSelectElement && hasOwnProp(props, "value")) {
    const options = Array.from(element.options);
    if (element.multiple && Array.isArray(props.value)) {
      const propValues = new Set(props.value.map(stringValue));
      if (
        options.every((option) => option.hasAttribute("selected") === propValues.has(option.value)) &&
        options.some((option) => option.selected !== option.hasAttribute("selected"))
      ) {
        state = { selectedOptions: options.map((option) => ({ option, selected: option.selected })) };
      }
    } else if (!element.multiple) {
      let serverIndex = -1;
      for (let index = 0; index < options.length; index++) {
        if (options[index]!.hasAttribute("selected")) serverIndex = index;
      }
      const baselineIndex = serverIndex < 0
        ? Number.parseInt(element.getAttribute("size") ?? "0", 10) > 1
          ? -1
          : options.findIndex((option) => !option.disabled && option.closest("optgroup[disabled]") === null)
        : serverIndex;
      const serverValue = baselineIndex < 0 ? "" : options[baselineIndex]!.value;
      if (stringValue(props.value) === serverValue && element.selectedIndex !== baselineIndex) {
        state = { selectedOption: element.options.item(element.selectedIndex) };
      }
    }
  }

  if (state === undefined) {
    prehydrationFormStates.delete(element);
  } else {
    prehydrationFormStates.set(element, state);
  }
}

export function preservesPrehydrationValue(element: Element): boolean {
  return prehydrationFormStates.get(element)?.value === true;
}

export function preservesPrehydrationChecked(element: Element): boolean {
  return prehydrationFormStates.get(element)?.checked === true;
}

export function preservesPrehydrationSelection(element: Element): boolean {
  const state = prehydrationFormStates.get(element);
  return state?.selectedOption !== undefined || state?.selectedOptions !== undefined;
}

export function restorePrehydrationFormState(element: Element): void {
  const state = prehydrationFormStates.get(element);
  prehydrationFormStates.delete(element);
  if (state === undefined) return;

  if (element instanceof HTMLTextAreaElement && state.textarea !== undefined) {
    const { serverValue, value, selectionStart, selectionEnd, selectionDirection } = state.textarea;
    if (element.defaultValue !== serverValue) element.defaultValue = serverValue;
    if (element.value !== value) element.value = value;
    element.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  } else if (element instanceof HTMLSelectElement) {
    if (state.selectedOptions !== undefined) {
      for (const { option, selected } of state.selectedOptions) {
        if (element.contains(option)) option.selected = selected;
      }
    } else if (state.selectedOption !== undefined) {
      if (state.selectedOption === null) {
        element.selectedIndex = -1;
      } else if (element.contains(state.selectedOption)) {
        state.selectedOption.selected = true;
      }
    }
  }
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function booleanValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

function hasOwnProp(props: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, name);
}
