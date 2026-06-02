import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import { readOxcJsxTagName } from "./oxc-jsx-attributes.js";
import { normalizeOxcJsxText } from "./oxc-jsx-text.js";

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

  if (unwrapped.type === "LogicalExpression") {
    const right = lowerOxcDomNodeExpression(code, readObject(unwrapped.right));

    if (right !== undefined && unwrapped.operator === "&&") {
      return `((${readSource(code, readObject(unwrapped.left))}) ? ${right} : false)`;
    }

    if (right !== undefined && unwrapped.operator === "||") {
      const left = readSource(code, readObject(unwrapped.left));
      return `((${left}) ? ${left} : ${right})`;
    }
  }

  if (unwrapped.type === "ArrayExpression") {
    return `[${readArray(unwrapped.elements).map((element) => {
      const object = readObject(element);
      return Object.keys(object).length === 0
        ? "undefined"
        : (lowerOxcDomNodeExpression(code, object) ?? readSource(code, object));
    }).join(", ")}]`;
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

    if (name === "key") {
      return [];
    }

    if (/^on[A-Z]/.test(name)) {
      if (value.type !== "JSXExpressionContainer") {
        return [];
      }

      return [
        `  _node.addEventListener(${JSON.stringify(name.slice(2).toLowerCase())}, ${readSource(code, readObject(value.expression))});`,
      ];
    }

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
  return children.flatMap((child, index): string[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value =
        typeof object.value === "string"
          ? normalizeOxcJsxText(object.value, children, index)
          : "";
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
