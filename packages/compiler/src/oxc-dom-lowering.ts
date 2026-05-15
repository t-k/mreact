import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import { readOxcJsxTagName } from "./oxc-jsx-attributes.js";

export function lowerOxcDomNodeExpression(
  code: string,
  node: Record<string, unknown>,
): string | undefined {
  const unwrapped = unwrapOxcParentheses(node);

  if (unwrapped.type === "ConditionalExpression") {
    const whenTrue = lowerOxcDomNodeExpression(code, readObject(unwrapped.consequent));
    const whenFalse = lowerOxcDomNodeExpression(code, readObject(unwrapped.alternate));

    if (whenTrue !== undefined && whenFalse !== undefined) {
      return `((${readSource(code, readObject(unwrapped.test))}) ? ${whenTrue} : ${whenFalse})`;
    }
  }

  if (unwrapped.type === "Literal" && (unwrapped.value === null || unwrapped.value === false)) {
    return 'document.createTextNode("")';
  }

  node = unwrapped;

  if (node.type !== "JSXElement") {
    return undefined;
  }

  const openingElement = readObject(node.openingElement);
  const tagName = readOxcJsxTagName(readObject(openingElement.name));

  if (!/^[a-z]/.test(tagName)) {
    return undefined;
  }

  return [
    "(() => {",
    `  const _node = document.createElement(${JSON.stringify(tagName)});`,
    ...lowerOxcDomAttributes(code, readArray(openingElement.attributes)),
    ...lowerOxcDomChildren(code, readArray(node.children)),
    "  return _node;",
    "})()",
  ].join("\n");
}

function lowerOxcDomAttributes(code: string, attributes: readonly unknown[]): string[] {
  return attributes.flatMap((attribute): string[] => {
    const object = readObject(attribute);

    if (object.type !== "JSXAttribute") {
      return [];
    }

    const name = String(readObject(object.name).name);
    const domName = htmlAttributeAliases[name] ?? name;
    const value = readObject(object.value);

    if (Object.keys(value).length === 0) {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, "");`];
    }

    if (value.type === "Literal") {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, ${JSON.stringify(value.value)});`];
    }

    if (value.type === "JSXExpressionContainer") {
      return [
        `  _node.setAttribute(${JSON.stringify(domName)}, String(${readSource(code, readObject(value.expression))}));`,
      ];
    }

    return [];
  });
}

const htmlAttributeAliases: Record<string, string> = {
  acceptCharset: "accept-charset",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  charSet: "charset",
  className: "class",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  encType: "enctype",
  formAction: "formaction",
  frameBorder: "frameborder",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  maxLength: "maxlength",
  minLength: "minlength",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readonly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

function lowerOxcDomChildren(code: string, children: readonly unknown[]): string[] {
  return children.flatMap((child): string[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value =
        typeof object.value === "string" ? object.value.replace(/\s+/g, " ").trim() : "";
      return value === "" ? [] : [`  _node.append(${JSON.stringify(value)});`];
    }

    if (object.type === "JSXExpressionContainer") {
      return [`  _node.append(String(${readSource(code, readObject(object.expression))}));`];
    }

    if (object.type === "JSXElement") {
      const lowered = lowerOxcDomNodeExpression(code, object);
      return lowered === undefined ? [] : [`  _node.append(${lowered});`];
    }

    return [];
  });
}
