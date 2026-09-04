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

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Compiles SVG markup into a reusable document fragment factory. */
export function createSvgTemplate(svg: string): () => DocumentFragment {
  const container = createSvgTemplateContainer(svg);

  return () => {
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(container.childNodes)) {
      fragment.append(child.cloneNode(true));
    }
    return fragment;
  };
}

/** Compiles single-root SVG markup into a reusable element factory. */
export function createSvgTemplateElement<TElement extends Element = Element>(
  svg: string,
): () => TElement {
  const container = createSvgTemplateContainer(svg);

  if (container.childElementCount !== 1) {
    throw new Error("createSvgTemplateElement requires a single root element");
  }

  const root = container.firstElementChild;

  if (root === null) {
    throw new Error("createSvgTemplateElement requires a single root element");
  }

  return () => root.cloneNode(true) as TElement;
}

function createSvgTemplateContainer(svg: string): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = `<svg xmlns="${SVG_NAMESPACE}">${svg}</svg>`;
  const container = template.content.firstElementChild;

  if (!(container instanceof SVGSVGElement)) {
    throw new Error("Unable to create SVG template container");
  }

  for (const foreignObject of Array.from(container.querySelectorAll("foreignObject"))) {
    const htmlTemplate = document.createElement("template");
    htmlTemplate.innerHTML = foreignObject.innerHTML;
    foreignObject.replaceChildren(htmlTemplate.content);
  }

  return container;
}
