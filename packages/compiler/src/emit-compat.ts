import type {
  AttributeIr,
  ComponentIr,
  JsxElementIr,
  JsxFragmentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitCompatResult {
  code: string;
  imports: RuntimeImport[];
}

const JSX_RUNTIME_SOURCE = "@modular-react/react-compat/jsx-runtime";

export function emitCompat(ir: ModuleIr): EmitCompatResult {
  const imports = collectImports(ir);
  const importLine = emitImportLine(imports);
  const components = ir.components.map(emitComponent).join("\n\n");

  return {
    code: `${importLine}\n\n${components}\n`,
    imports,
  };
}

function collectImports(ir: ModuleIr): RuntimeImport[] {
  const specifiers = new Set<string>();

  for (const component of ir.components) {
    visit(component.root, (node) => {
      if (node.kind === "fragment") {
        specifiers.add("Fragment");
      }

      if (node.kind === "element" || node.kind === "fragment") {
        specifiers.add(node.children.length > 1 ? "jsxs" : "jsx");
      }
    });
  }

  return [
    {
      source: JSX_RUNTIME_SOURCE,
      specifiers: Array.from(specifiers).sort(),
    },
  ];
}

function emitImportLine(imports: RuntimeImport[]): string {
  const specifiers = imports[0]?.specifiers ?? [];
  const importedNames = specifiers.map((specifier) => {
    if (specifier === "Fragment") {
      return "Fragment as _Fragment";
    }

    return `${specifier} as _${specifier}`;
  });

  return `import { ${importedNames.join(", ")} } from "${JSX_RUNTIME_SOURCE}";`;
}

function emitComponent(component: ComponentIr): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);

  return [
    `export function ${component.name}() {`,
    ...body,
    `  return ${emitJsxNode(component.root)};`,
    `}`,
  ].join("\n");
}

function emitJsxNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "fragment") {
    return emitJsxCall("_Fragment", node);
  }

  return emitJsxCall(JSON.stringify(node.tagName), node);
}

function emitJsxCall(
  typeExpression: string,
  node: JsxElementIr | JsxFragmentIr,
): string {
  const callee = node.children.length > 1 ? "_jsxs" : "_jsx";

  return `${callee}(${typeExpression}, ${emitProps(node)})`;
}

function emitProps(node: JsxElementIr | JsxFragmentIr): string {
  const entries =
    node.kind === "element" ? node.attributes.map(emitAttribute) : [];
  const children = emitChildren(node.children);

  if (children !== undefined) {
    entries.push(`children: ${children}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitChildren(children: JsxNodeIr[]): string | undefined {
  if (children.length === 0) {
    return undefined;
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr);
  }

  return `[${children.map(emitJsxNode).join(", ")}]`;
}

function emitAttribute(attr: AttributeIr): string {
  if (attr.kind === "static-attr") {
    return `${emitPropName(attr.name)}: ${JSON.stringify(attr.value)}`;
  }

  if (attr.kind === "dynamic-attr") {
    return `${emitPropName(attr.name)}: (${attr.code})`;
  }

  return `${emitPropName(attr.name)}: ${attr.code}`;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function visit(node: JsxNodeIr, fn: (node: JsxNodeIr) => void): void {
  fn(node);

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      visit(child, fn);
    }
  }
}
