import { applySelectValue as applyReactiveSelectValue } from "@reckona/mreact-reactive-dom/form-state";

export { applyReactiveSelectValue as applySelectValue };

export function restoreControlledFormState(element: Element, props: Record<string, unknown>): void {
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
    applyReactiveSelectValue(element, props.value);
  }
}

function hasOwnProp(props: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, name);
}
