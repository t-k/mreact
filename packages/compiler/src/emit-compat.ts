import type {
  AttributeIr,
  ComponentPropIr,
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
  if (ir.components.length === 0) {
    return {
      code: "",
      imports: [],
    };
  }

  const imports = collectImports(ir);
  const helperNames = allocateHelperNames(ir, imports[0]?.specifiers ?? []);
  const importLine = emitImportLine(imports, helperNames);
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(ir);
  const components = ir.components
    .map((component) => emitComponent(component, helperNames))
    .join("\n\n");

  return {
    code: `${[importLine, userImports, moduleStatements].filter(Boolean).join("\n")}\n\n${components}\n`,
    imports,
  };
}

function emitUserImports(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.userImports.join("\n");
}

function emitModuleStatements(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.moduleStatements.join("\n");
}

function collectImports(ir: ModuleIr): RuntimeImport[] {
  const specifiers = new Set<string>();

  for (const component of ir.components) {
    visit(component.root, (node) => {
      if (node.kind === "fragment") {
        specifiers.add("Fragment");
      }

      if (node.kind === "component") {
        specifiers.add("jsx");
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

interface CompatHelperNames {
  Fragment?: string;
  jsx?: string;
  jsxs?: string;
}

function allocateHelperNames(
  ir: ModuleIr,
  specifiers: readonly string[],
): CompatHelperNames {
  const allocator = createNameAllocator(collectReservedHelperNames(ir));
  const helperNames: CompatHelperNames = {};

  for (const specifier of specifiers) {
    if (specifier === "Fragment") {
      helperNames.Fragment = allocator("_Fragment");
      continue;
    }

    if (specifier === "jsx") {
      helperNames.jsx = allocator("_jsx");
      continue;
    }

    if (specifier === "jsxs") {
      helperNames.jsxs = allocator("_jsxs");
    }
  }

  return helperNames;
}

function collectReservedHelperNames(ir: ModuleIr): string[] {
  return [
    ...ir.moduleBindingNames,
    ...ir.components.flatMap((component) => [
      component.name,
      component.exportName,
      ...component.bindingNames,
    ]),
  ];
}

function emitImportLine(
  imports: RuntimeImport[],
  helperNames: CompatHelperNames,
): string {
  const specifiers = imports[0]?.specifiers ?? [];
  const importedNames = specifiers.map((specifier) => {
    if (specifier === "Fragment") {
      return `Fragment as ${helperNames.Fragment ?? "_Fragment"}`;
    }

    return `${specifier} as ${helperNames[specifier as "jsx" | "jsxs"] ?? `_${specifier}`}`;
  });

  return `import { ${importedNames.join(", ")} } from "${JSX_RUNTIME_SOURCE}";`;
}

function emitComponent(
  component: ComponentIr,
  helperNames: CompatHelperNames,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");

  return [
    `export function ${component.name}(${parameters}) {`,
    ...body,
    `  return ${emitJsxNode(component.root, helperNames)};`,
    `}`,
  ].join("\n");
}

function emitJsxNode(node: JsxNodeIr, helperNames: CompatHelperNames): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `(${node.conditionCode}) ? ${emitCompatChildren(node.whenTrue, helperNames)} : ${emitCompatChildren(node.whenFalse, helperNames)}`;
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return `(${node.itemsCode}).map((${parameters}) => ${emitCompatChildren(node.children, helperNames)})`;
  }

  if (node.kind === "fragment") {
    return emitJsxCall(helperNames.Fragment ?? "_Fragment", node, helperNames);
  }

  if (node.kind === "component") {
    const keyArgument =
      node.keyCode === undefined ? "" : `, (${node.keyCode})`;
    return `${helperNames.jsx ?? "_jsx"}(${node.name}, ${emitComponentProps(node.props, node.children, helperNames)}${keyArgument})`;
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  return emitJsxCall(JSON.stringify(node.tagName), node, helperNames);
}

function emitCompatChildren(
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr, helperNames);
  }

  return `[${children.map((child) => emitJsxNode(child, helperNames)).join(", ")}]`;
}

function emitJsxCall(
  typeExpression: string,
  node: JsxElementIr | JsxFragmentIr,
  helperNames: CompatHelperNames,
): string {
  const callee =
    node.children.length > 1
      ? (helperNames.jsxs ?? "_jsxs")
      : (helperNames.jsx ?? "_jsx");
  const keyArgument =
    node.kind === "element" && node.keyCode !== undefined
      ? `, (${node.keyCode})`
      : "";

  return `${callee}(${typeExpression}, ${emitProps(node, helperNames)}${keyArgument})`;
}

function emitProps(
  node: JsxElementIr | JsxFragmentIr,
  helperNames: CompatHelperNames,
): string {
  const entries =
    node.kind === "element" ? node.attributes.map(emitAttribute) : [];
  const children = emitChildren(node.children, helperNames);

  if (children !== undefined) {
    entries.push(`children: ${children}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitChildren(
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
): string | undefined {
  if (children.length === 0) {
    return undefined;
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr, helperNames);
  }

  return `[${children.map((child) => emitJsxNode(child, helperNames)).join(", ")}]`;
}

function emitAttribute(attr: AttributeIr): string {
  if (attr.kind === "spread-attr") {
    return `...(${attr.code})`;
  }

  if (attr.kind === "static-attr") {
    return `${emitPropName(attr.name)}: ${JSON.stringify(attr.value)}`;
  }

  if (attr.kind === "dynamic-attr") {
    return `${emitPropName(attr.name)}: (${attr.code})`;
  }

  return `${emitPropName(attr.name)}: ${attr.code}`;
}

function emitComponentProps(
  props: ComponentPropIr[],
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
): string {
  const entries = props
    .map((prop) =>
      prop.kind === "spread-prop"
        ? `...(${prop.code})`
        : `${emitPropName(prop.name)}: (${prop.code})`,
    )
    .filter(Boolean);

  if (children.length > 0) {
    entries.push(`children: ${emitChildren(children, helperNames) ?? "null"}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function createNameAllocator(
  reservedNames: readonly string[],
): (baseName: string) => string {
  const usedNames = new Set(reservedNames);

  return (baseName: string): string => {
    let name = baseName;
    let index = 1;

    while (usedNames.has(name)) {
      name = `${baseName}$${index}`;
      index += 1;
    }

    usedNames.add(name);
    return name;
  };
}

function visit(node: JsxNodeIr, fn: (node: JsxNodeIr) => void): void {
  fn(node);

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      visit(child, fn);
    }
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      visit(child, fn);
    }
  }

  if (node.kind === "component") {
    for (const child of node.children) {
      visit(child, fn);
    }
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      visit(child, fn);
    }
  }
}
