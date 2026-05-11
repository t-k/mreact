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
  if (ir.components.length === 0 && ir.moduleStatements.length === 0) {
    return {
      code: "",
      imports: [],
    };
  }

  const normalizedModuleStatements = normalizeCompatModuleStatements(ir.moduleStatements);
  const componentSpecifiers = collectComponentImportSpecifiers(ir);
  const importSpecifiers = Array.from(
    new Set([
      ...componentSpecifiers,
      ...normalizedModuleStatements.importSpecifiers.map((specifier) => specifier.importedName),
    ]),
  ).sort();
  const imports = collectImports(importSpecifiers);
  const helperNames = allocateHelperNames(ir, componentSpecifiers);
  const importLine = importSpecifiers.length === 0
    ? ""
    : emitImportLine(importSpecifiers, helperNames, normalizedModuleStatements.importSpecifiers);
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(normalizedModuleStatements.statements);
  const components = ir.components
    .map((component) => emitComponent(component, helperNames))
    .join("\n\n");

  return {
    code: `${[importLine, userImports, moduleStatements].filter(Boolean).join("\n")}\n\n${components}\n`,
    imports,
  };
}

function emitUserImports(ir: ModuleIr): string {
  return ir.userImports.join("\n");
}

function emitModuleStatements(statements: readonly string[]): string {
  return statements.join("\n");
}

function collectImports(specifiers: readonly string[]): RuntimeImport[] {
  if (specifiers.length === 0) {
    return [];
  }

  return [
    {
      source: JSX_RUNTIME_SOURCE,
      specifiers: [...specifiers],
    },
  ];
}

function collectComponentImportSpecifiers(ir: ModuleIr): string[] {
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

  return Array.from(specifiers).sort();
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

interface CompatRuntimeImportSpecifier {
  importedName: string;
  localName: string;
}

interface NormalizedModuleStatements {
  statements: string[];
  importSpecifiers: CompatRuntimeImportSpecifier[];
}

function normalizeCompatModuleStatements(statements: readonly string[]): NormalizedModuleStatements {
  const importSpecifiers = new Map<string, CompatRuntimeImportSpecifier>();
  const normalizedStatements = statements.map((statement) =>
    stripCompatRuntimeImports(statement, importSpecifiers)
  );

  return {
    statements: normalizedStatements,
    importSpecifiers: Array.from(importSpecifiers.values()),
  };
}

function stripCompatRuntimeImports(
  statement: string,
  importSpecifiers: Map<string, CompatRuntimeImportSpecifier>,
): string {
  return statement
    .split("\n")
    .filter((line) => {
      const parsed = parseCompatRuntimeImportLine(line);

      if (parsed === undefined) {
        return true;
      }

      for (const specifier of parsed) {
        importSpecifiers.set(`${specifier.importedName}:${specifier.localName}`, specifier);
      }

      return false;
    })
    .join("\n");
}

function parseCompatRuntimeImportLine(
  line: string,
): CompatRuntimeImportSpecifier[] | undefined {
  const match = line.match(
    /^\s*import\s+\{\s*(?<specifiers>[^}]*)\s*\}\s+from\s+["@']@modular-react\/react-compat\/jsx-runtime(?:\.js)?["@'];?\s*$/,
  );
  const specifierText = match?.groups?.specifiers;

  if (specifierText === undefined) {
    return undefined;
  }

  if (specifierText.trim() === "") {
    return [];
  }

  return specifierText.split(",").flatMap((rawSpecifier): CompatRuntimeImportSpecifier[] => {
    const specifier = rawSpecifier.trim();
    const aliasMatch = specifier.match(
      /^(?<importedName>Fragment|jsx|jsxs)\s+as\s+(?<localName>[A-Za-z_$][\w$]*)$/,
    );

    if (aliasMatch?.groups !== undefined) {
      const { importedName, localName } = aliasMatch.groups;

      if (importedName === undefined || localName === undefined) {
        return [];
      }

      return [{
        importedName,
        localName,
      }];
    }

    return /^(Fragment|jsx|jsxs)$/.test(specifier)
      ? [{ importedName: specifier, localName: specifier }]
      : [];
  });
}

function emitImportLine(
  importSpecifiers: readonly string[],
  helperNames: CompatHelperNames,
  moduleImportSpecifiers: readonly CompatRuntimeImportSpecifier[],
): string {
  const importedNames = new Map<string, string>();

  for (const moduleSpecifier of moduleImportSpecifiers) {
    importedNames.set(
      `${moduleSpecifier.importedName}:${moduleSpecifier.localName}`,
      `${moduleSpecifier.importedName} as ${moduleSpecifier.localName}`,
    );
  }

  for (const specifier of importSpecifiers) {
    if (specifier === "Fragment") {
      const localName = helperNames.Fragment ?? "_Fragment";
      importedNames.set(`Fragment:${localName}`, `Fragment as ${localName}`);
      continue;
    }

    const localName = helperNames[specifier as "jsx" | "jsxs"] ?? `_${specifier}`;
    importedNames.set(`${specifier}:${localName}`, `${specifier} as ${localName}`);
  }

  return `import { ${Array.from(importedNames.values()).join(", ")} } from "${JSX_RUNTIME_SOURCE}";`;
}

function emitComponent(
  component: ComponentIr,
  helperNames: CompatHelperNames,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");

  return [
    `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
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
    return `(${node.itemsCode}).map(${emitListRenderer(node, parameters, helperNames)})`;
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

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  helperNames: CompatHelperNames,
): string {
  const valueExpression = emitCompatChildren(node.children, helperNames);

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
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
    .map((prop) => {
      if (prop.kind === "spread-prop") {
        return `...(${prop.code})`;
      }

      if (prop.kind === "render-prop") {
        const renderedChildren = emitChildren(prop.children, helperNames) ?? "null";
        return prop.valueName === undefined
          ? `${emitPropName(prop.name)}: ${renderedChildren}`
          : `${emitPropName(prop.name)}: (${prop.valueName}) => ${renderedChildren}`;
      }

      return `${emitPropName(prop.name)}: (${prop.code})`;
    })
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
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          visit(child, fn);
        }
      }
    }

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
