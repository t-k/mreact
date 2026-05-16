export function validateEventTargets(host: Element, expectedCount: number): void {
  const buttons = host.querySelectorAll("button[data-index]");

  if (buttons.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} event targets, received ${buttons.length}`);
  }

  for (let index = 0; index < expectedCount; index += 1) {
    const button = buttons[index];

    if (button === undefined) {
      throw new Error(`event target ${index} is missing`);
    }

    const received = button.getAttribute("data-index");
    if (received !== String(index)) {
      throw new Error(`event target ${index} expected data-index ${index}, received ${received}`);
    }
  }
}
