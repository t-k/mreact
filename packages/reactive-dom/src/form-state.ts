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
  let matched = false;
  for (const option of Array.from(element.options)) {
    const optionMatches: boolean = !matched && option.value === nextValue;
    option.selected = optionMatches;
    matched ||= optionMatches;
  }
}
