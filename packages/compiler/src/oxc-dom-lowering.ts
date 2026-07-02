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
      return `(() => { const _left = (${left}); return _left ? _left : ${right}; })()`;
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
  const lines = attributes.flatMap((attribute): string[] => {
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

    if (/^on[A-Za-z]/.test(name)) {
      if (value.type !== "JSXExpressionContainer") {
        return [];
      }

      return [
        `  _node.addEventListener(${JSON.stringify(name.slice(2).toLowerCase())}, ${readSource(code, readObject(value.expression))});`,
      ];
    }

    if (Object.keys(value).length === 0) {
      if (isDangerousHtmlAttribute(domName)) {
        return [];
      }
      return [`  _node.setAttribute(${JSON.stringify(domName)}, "");`];
    }

    if (value.type === "Literal") {
      const literal = typeof value.value === "string" ? value.value : String(value.value);
      if (
        (isUrlAttribute(domName) || isSrcsetAttribute(domName)) &&
        isUnsafeStaticUrlAttribute(domName, literal)
      ) {
        return [];
      }
      if (isDangerousHtmlAttribute(domName)) {
        return [];
      }
      return [`  _node.setAttribute(${JSON.stringify(domName)}, ${JSON.stringify(value.value)});`];
    }

    if (value.type === "JSXExpressionContainer") {
      const expression = readSource(code, readObject(value.expression));
      if (isUrlAttribute(domName) || isSrcsetAttribute(domName)) {
        return [
          `  { const _value = __mreactSafeDomUrlAttribute(${JSON.stringify(domName)}, String(${expression})); if (_value !== undefined) _node.setAttribute(${JSON.stringify(domName)}, _value); }`,
        ];
      }
      if (isDangerousHtmlAttribute(domName)) {
        return [
          `  { const _value = (${expression}); if (_value && typeof _value === "object" && typeof _value.__html === "string") _node.setAttribute(${JSON.stringify(domName)}, _value.__html); }`,
        ];
      }
      return [
        `  _node.setAttribute(${JSON.stringify(domName)}, String(${expression}));`,
      ];
    }

    return [];
  });

  return lines.some((line) => line.includes("__mreactSafeDomUrlAttribute"))
    ? [...safeDomAttributeHelperLines(), ...lines]
    : lines;
}

function safeDomAttributeHelperLines(): string[] {
  return [
    "  const __mreactSafeDomUrlAttribute = (name, value) => {",
    '    if (name === "srcset" || name === "imagesrcset") {',
    "      const _canonicalSet = value.replace(/^[\\x00-\\x20]+/u, \"\").replace(/[\\t\\r\\n]/g, \"\");",
    "      for (const _candidate of _canonicalSet.split(\",\")) {",
    "        const _url = (_candidate.trim().split(/\\s+/)[0] || \"\");",
    '        if (_url !== "" && __mreactSafeDomUrlAttribute("src", _url) === undefined) return undefined;',
    "      }",
    "      return value;",
    "    }",
    '    const _canonical = value.replace(/^[\\x00-\\x20]+/u, "").replace(/[\\t\\r\\n]/g, "");',
    "    const _match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(_canonical);",
    "    if (_match === null) return value;",
    "    const _scheme = _match[1].toLowerCase();",
    '    if (_scheme !== "javascript" && _scheme !== "vbscript" && _scheme !== "livescript" && _scheme !== "mhtml" && _scheme !== "file" && _scheme !== "data") return value;',
    '    if (_scheme === "data" && (name === "src" || name === "poster") && /^data:image\\/(?!svg\\+xml(?:[;,]|$))/i.test(_canonical)) return value;',
    "    return undefined;",
    "  };",
  ];
}

function isUrlAttribute(name: string): boolean {
  return urlAttributeNames.has(name);
}

function isSrcsetAttribute(name: string): boolean {
  return srcsetAttributeNames.has(name);
}

function isDangerousHtmlAttribute(name: string): boolean {
  return dangerousHtmlAttributeNames.has(name);
}

function isUnsafeStaticUrlAttribute(name: string, value: string): boolean {
  return safeDomUrlAttributeValue(name, value) === undefined;
}

function safeDomUrlAttributeValue(name: string, value: string): string | undefined {
  if (isSrcsetAttribute(name)) {
    const canonical = canonicalizeUrl(value);
    for (const candidate of canonical.split(",")) {
      const url = candidate.trim().split(/\s+/)[0] ?? "";
      if (url !== "" && safeDomUrlAttributeValue("src", url) === undefined) {
        return undefined;
      }
    }
    return value;
  }

  const canonical = canonicalizeUrl(value);
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(canonical);
  if (match === null || match[1] === undefined) return value;
  const scheme = match[1].toLowerCase();
  if (!unsafeUrlSchemes.has(scheme)) return value;
  if (
    scheme === "data" &&
    (name === "src" || name === "poster") &&
    /^data:image\/(?!svg\+xml(?:[;,]|$))/i.test(canonical)
  ) {
    return value;
  }
  return undefined;
}

function canonicalizeUrl(value: string): string {
  return value.replace(/^[\x00-\x20]+/u, "").replace(/[\t\r\n]/g, "");
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
  imageSrcSet: "imagesrcset",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

const urlAttributeNames = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "ping",
  "poster",
  "background",
  "manifest",
  "data",
  "codebase",
]);
const srcsetAttributeNames = new Set(["srcset", "imagesrcset"]);
const dangerousHtmlAttributeNames = new Set(["srcdoc"]);
const unsafeUrlSchemes = new Set(["javascript", "data", "vbscript", "livescript", "mhtml", "file"]);

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
