export function applyOutOfOrderFragments(root: ParentNode = document): void {
  const fragments = Array.from(
    root.querySelectorAll<HTMLTemplateElement>(
      "template[data-mreact-oob-fragment]",
    ),
  );

  for (const fragment of fragments) {
    const id = fragment.dataset.mreactOobFragment;

    if (id === undefined) {
      continue;
    }

    const placeholder = root.querySelector<HTMLTemplateElement>(
      `template[data-mreact-oob-placeholder="${cssEscape(id)}"]`,
    );

    if (placeholder === null) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
  }
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
