/** Compiles an HTML string into a reusable document fragment factory. */
export function createTemplate(html: string): () => DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;

  return () => template.content.cloneNode(true) as DocumentFragment;
}

/** Compiles a single-root HTML string into a reusable element factory. */
export function createTemplateElement<TElement extends Element = Element>(
  html: string,
): () => TElement {
  const template = document.createElement("template");
  template.innerHTML = html;

  if (template.content.childElementCount !== 1) {
    throw new Error("createTemplateElement requires a single root element");
  }

  const root = template.content.firstElementChild;

  if (root === null) {
    throw new Error("createTemplateElement requires a single root element");
  }

  return () => root.cloneNode(true) as TElement;
}
