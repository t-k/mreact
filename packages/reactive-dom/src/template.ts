/** Compiles an HTML string into a reusable document fragment factory. */
export function createTemplate(html: string): () => DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;

  return () => template.content.cloneNode(true) as DocumentFragment;
}

/** Compiles a single-root HTML string into a reusable element factory. */
export function createElementTemplate<T extends Element = Element>(html: string): () => T {
  const template = document.createElement("template");
  template.innerHTML = html;
  const element = template.content.firstElementChild;

  if (element === null || element.nextElementSibling !== null) {
    throw new Error("createElementTemplate requires exactly one root element");
  }

  return () => element.cloneNode(true) as T;
}
