/** Applies a controlled select value without serializing it as an HTML attribute. */
export function applySelectValue(element: HTMLSelectElement, value: unknown): void {
  if (value == null) return;

  const values = new Set(
    element.multiple && Array.isArray(value) ? value.map(String) : [String(value)],
  );

  for (const option of Array.from(element.options)) {
    option.selected = values.has(option.value);
  }
}
