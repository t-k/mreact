export function applySelectValue(element: HTMLSelectElement, value: unknown): void {
  if (element.multiple) {
    const values = Array.isArray(value)
      ? new Set(value.map((item) => String(item)))
      : value === null || value === undefined
        ? new Set<string>()
        : new Set([String(value)]);

    for (const option of Array.from(element.options)) {
      option.selected = values.has(option.value);
    }
    return;
  }

  const nextValue = value === null || value === undefined ? undefined : String(value);
  for (const option of Array.from(element.options)) {
    option.selected = nextValue !== undefined && option.value === nextValue;
  }
}

export function restoreControlledFormState(
  element: Element,
  props: Record<string, unknown>,
): void {
  if (element instanceof HTMLInputElement) {
    if (hasOwnProp(props, "value")) {
      element.value = props.value === null || props.value === undefined ? "" : String(props.value);
    }
    if (hasOwnProp(props, "checked")) {
      element.checked =
        props.checked !== null && props.checked !== undefined && props.checked !== false;
    }
    return;
  }

  if (element instanceof HTMLTextAreaElement && hasOwnProp(props, "value")) {
    element.value = props.value === null || props.value === undefined ? "" : String(props.value);
    return;
  }

  if (element instanceof HTMLSelectElement && hasOwnProp(props, "value")) {
    applySelectValue(element, props.value);
  }
}

function hasOwnProp(props: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, name);
}
