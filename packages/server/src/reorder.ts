/** Moves out-of-order fragments into their matching placeholders within a DOM root. */
export function applyOutOfOrderFragments(root: ParentNode = document): void {
  const fragments = Array.from(
    root.querySelectorAll<HTMLTemplateElement>(
      "template[data-mreact-oob-fragment]",
    ),
  );
  const completionMarkers = new Map<string | null, Element>();
  for (const marker of root.querySelectorAll<Element>("[data-mreact-oob-complete]")) {
    const id = marker.getAttribute("data-mreact-oob-complete");
    if (!completionMarkers.has(id)) {
      completionMarkers.set(id, marker);
    }
  }
  const placeholders = new Map<string | null, Element>();
  for (const placeholder of root.querySelectorAll<Element>("[data-mreact-oob-placeholder]")) {
    const id = placeholder.getAttribute("data-mreact-oob-placeholder");
    if (!placeholders.has(id)) {
      placeholders.set(id, placeholder);
    }
  }

  for (const fragment of fragments) {
    const id = fragment.dataset.mreactOobFragment;

    if (id === undefined) {
      continue;
    }

    const completionMarker = completionMarkers.get(id);
    if (completionMarker === undefined) {
      continue;
    }

    const placeholder = placeholders.get(id);
    if (placeholder === undefined) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
    completionMarker.remove();
  }
}
