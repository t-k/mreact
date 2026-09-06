/** Applies a controlled select value without serializing it as an HTML attribute. */
export function applySelectValue(element: HTMLSelectElement, value: unknown): void {
  if (value == null) return;

  if (element.multiple && Array.isArray(value)) {
    const values = new Set<string>();
    for (const item of value) {
      if (item != null) values.add(String(item));
    }

    for (const option of Array.from(element.options)) {
      option.selected = values.has(option.value);
    }
    return;
  }

  const nextValue = String(value);
  const options = Array.from(element.options);
  let selectedOption: HTMLOptionElement | undefined;
  let firstEnabledOption: HTMLOptionElement | undefined;
  for (const option of options) {
    if (firstEnabledOption === undefined && !option.disabled) {
      firstEnabledOption = option;
    }
    if (selectedOption === undefined && option.value === nextValue) {
      selectedOption = option;
    }
  }

  selectedOption ??= firstEnabledOption;
  for (const option of options) {
    option.selected = option === selectedOption;
  }
}
