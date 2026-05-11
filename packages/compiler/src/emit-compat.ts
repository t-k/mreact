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

export interface EmitCompatOptions {
  dev?: boolean;
}

const JSX_RUNTIME_SOURCE = "@modular-react/react-compat/jsx-runtime";
const JSX_DEV_RUNTIME_SOURCE = "@modular-react/react-compat/jsx-dev-runtime";

export function emitCompat(
  ir: ModuleIr,
  options: EmitCompatOptions = {},
): EmitCompatResult {
  if (ir.components.length === 0 && ir.moduleStatements.length === 0) {
    return {
      code: "",
      imports: [],
    };
  }

  const normalizedModuleStatements = normalizeCompatModuleStatements(ir.moduleStatements);
  const dev = options.dev === true;
  const componentImportSource = dev ? JSX_DEV_RUNTIME_SOURCE : JSX_RUNTIME_SOURCE;
  const componentSpecifiers = collectComponentImportSpecifiers(ir, dev);
  const helperNames = allocateHelperNames(ir, componentSpecifiers);
  const importGroups = createImportGroups(
    componentSpecifiers,
    helperNames,
    normalizedModuleStatements.importSpecifiers,
    componentImportSource,
  );
  const imports = collectImports(importGroups);
  const importLine = emitImportLines(importGroups);
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(normalizedModuleStatements.statements);
  const components = ir.components
    .map((component) => emitComponent(component, helperNames, dev))
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

function collectComponentImportSpecifiers(ir: ModuleIr, dev: boolean): string[] {
  const specifiers = new Set<string>();

  for (const component of ir.components) {
    visit(component.root, (node) => {
      if (node.kind === "fragment") {
        specifiers.add("Fragment");
      }

      if (node.kind === "component") {
        specifiers.add(dev ? "jsxDEV" : "jsx");
      }

      if (node.kind === "element" || node.kind === "fragment") {
        specifiers.add(dev ? "jsxDEV" : node.children.length > 1 ? "jsxs" : "jsx");
      }
    });
  }

  return Array.from(specifiers).sort();
}

interface CompatHelperNames {
  Fragment?: string;
  jsx?: string;
  jsxDEV?: string;
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

    if (specifier === "jsxDEV") {
      helperNames.jsxDEV = allocator("_jsxDEV");
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
  source: string;
}

interface CompatImportGroup {
  source: string;
  specifiers: Map<string, string>;
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
    /^\s*import\s+\{\s*(?<specifiers>[^}]*)\s*\}\s+from\s+["@'](?<source>@modular-react\/react-compat\/jsx(?:-dev)?-runtime)(?:\.js)?["@'];?\s*$/,
  );
  const specifierText = match?.groups?.specifiers;
  const source = match?.groups?.source;

  if (specifierText === undefined || source === undefined) {
    return undefined;
  }

  if (specifierText.trim() === "") {
    return [];
  }

  return specifierText.split(",").flatMap((rawSpecifier): CompatRuntimeImportSpecifier[] => {
    const specifier = rawSpecifier.trim();
    const aliasMatch = specifier.match(
      /^(?<importedName>Fragment|jsx|jsxDEV|jsxs)\s+as\s+(?<localName>[A-Za-z_$][\w$]*)$/,
    );

    if (aliasMatch?.groups !== undefined) {
      const { importedName, localName } = aliasMatch.groups;

      if (importedName === undefined || localName === undefined) {
        return [];
      }

      return [{
        importedName,
        localName,
        source,
      }];
    }

    return /^(Fragment|jsx|jsxDEV|jsxs)$/.test(specifier)
      ? [{ importedName: specifier, localName: specifier, source }]
      : [];
  });
}

function createImportGroups(
  componentSpecifiers: readonly string[],
  helperNames: CompatHelperNames,
  moduleImportSpecifiers: readonly CompatRuntimeImportSpecifier[],
  componentImportSource: string,
): CompatImportGroup[] {
  const groups = new Map<string, CompatImportGroup>();

  for (const moduleSpecifier of moduleImportSpecifiers) {
    addImportSpecifier(
      groups,
      moduleSpecifier.source,
      moduleSpecifier.importedName,
      moduleSpecifier.localName,
    );
  }

  for (const specifier of componentSpecifiers) {
    if (specifier === "Fragment") {
      const localName = helperNames.Fragment ?? "_Fragment";
      addImportSpecifier(groups, componentImportSource, "Fragment", localName);
      continue;
    }

    const localName = helperNames[specifier as "jsx" | "jsxDEV" | "jsxs"] ?? `_${specifier}`;
    addImportSpecifier(groups, componentImportSource, specifier, localName);
  }

  return Array.from(groups.values());
}

function addImportSpecifier(
  groups: Map<string, CompatImportGroup>,
  source: string,
  importedName: string,
  localName: string,
): void {
  const group = groups.get(source) ?? {
    source,
    specifiers: new Map<string, string>(),
  };

  group.specifiers.set(
    `${importedName}:${localName}`,
    importedName === localName ? importedName : `${importedName} as ${localName}`,
  );
  groups.set(source, group);
}

function collectImports(groups: readonly CompatImportGroup[]): RuntimeImport[] {
  return groups.map((group) => ({
    source: group.source,
    specifiers: Array.from(
      new Set(Array.from(group.specifiers.keys(), (key) => key.split(":")[0] as string)),
    ).sort(),
  }));
}

function emitImportLines(groups: readonly CompatImportGroup[]): string {
  return groups
    .map((group) =>
      `import { ${Array.from(group.specifiers.values()).join(", ")} } from "${group.source}";`
    )
    .join("\n");
}

function emitComponent(
  component: ComponentIr,
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");

  return [
    `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
    ...body,
    `  return ${emitJsxNode(component.root, helperNames, dev)};`,
    `}`,
  ].join("\n");
}

function emitJsxNode(
  node: JsxNodeIr,
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `(${node.conditionCode}) ? ${emitCompatChildren(node.whenTrue, helperNames, dev)} : ${emitCompatChildren(node.whenFalse, helperNames, dev)}`;
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return `(${node.itemsCode}).map(${emitListRenderer(node, parameters, helperNames, dev)})`;
  }

  if (node.kind === "fragment") {
    return emitJsxCall(helperNames.Fragment ?? "_Fragment", node, helperNames, dev);
  }

  if (node.kind === "component") {
    const keyArgument =
      node.keyCode === undefined ? undefined : `(${node.keyCode})`;
    const props = emitComponentProps(node.props, node.children, helperNames, dev);
    return dev
      ? emitJsxDevCall(helperNames.jsxDEV ?? "_jsxDEV", node.name, props, keyArgument, node.children.length > 1)
      : `${helperNames.jsx ?? "_jsx"}(${node.name}, ${props}${keyArgument === undefined ? "" : `, ${keyArgument}`})`;
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  return emitJsxCall(JSON.stringify(node.tagName), node, helperNames, dev);
}

function emitCompatChildren(
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr, helperNames, dev);
  }

  return `[${children.map((child) => emitJsxNode(child, helperNames, dev)).join(", ")}]`;
}

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  const valueExpression = emitCompatChildren(node.children, helperNames, dev);

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitJsxCall(
  typeExpression: string,
  node: JsxElementIr | JsxFragmentIr,
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  if (dev) {
    const keyArgument =
      node.kind === "element" && node.keyCode !== undefined
        ? `(${node.keyCode})`
        : undefined;
    return emitJsxDevCall(
      helperNames.jsxDEV ?? "_jsxDEV",
      typeExpression,
      emitProps(node, helperNames, dev),
      keyArgument,
      node.children.length > 1,
    );
  }

  const callee =
    node.children.length > 1
      ? (helperNames.jsxs ?? "_jsxs")
      : (helperNames.jsx ?? "_jsx");
  const keyArgument =
    node.kind === "element" && node.keyCode !== undefined
      ? `, (${node.keyCode})`
      : "";

  return `${callee}(${typeExpression}, ${emitProps(node, helperNames, dev)}${keyArgument})`;
}

function emitJsxDevCall(
  callee: string,
  typeExpression: string,
  props: string,
  keyArgument: string | undefined,
  isStaticChildren: boolean,
): string {
  return `${callee}(${typeExpression}, ${props}, ${keyArgument ?? "undefined"}, ${isStaticChildren}, undefined, undefined)`;
}

function emitProps(
  node: JsxElementIr | JsxFragmentIr,
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  const entries =
    node.kind === "element" ? node.attributes.map(emitAttribute) : [];
  const children = emitChildren(node.children, helperNames, dev);

  if (children !== undefined) {
    entries.push(`children: ${children}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitChildren(
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
  dev: boolean,
): string | undefined {
  if (children.length === 0) {
    return undefined;
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr, helperNames, dev);
  }

  return `[${children.map((child) => emitJsxNode(child, helperNames, dev)).join(", ")}]`;
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
  dev: boolean,
): string {
  const entries = props
    .map((prop) => {
      if (prop.kind === "spread-prop") {
        return `...(${prop.code})`;
      }

      if (prop.kind === "render-prop") {
        const renderedChildren = emitChildren(prop.children, helperNames, dev) ?? "null";
        return prop.valueName === undefined
          ? `${emitPropName(prop.name)}: ${renderedChildren}`
          : `${emitPropName(prop.name)}: (${prop.valueName}) => ${renderedChildren}`;
      }

      return `${emitPropName(prop.name)}: (${prop.code})`;
    })
    .filter(Boolean);

  if (children.length > 0) {
    entries.push(`children: ${emitChildren(children, helperNames, dev) ?? "null"}`);
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
