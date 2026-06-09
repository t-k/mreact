/** Compiles an HTML string into a reusable document fragment factory. */
export function createTemplate(html: string): () => DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;

  return () => template.content.cloneNode(true) as DocumentFragment;
}
