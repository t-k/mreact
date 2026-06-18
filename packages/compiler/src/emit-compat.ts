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
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";

export interface EmitCompatResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitCompatOptions {
  dev?: boolean;
}

const JSX_RUNTIME_SOURCE = "@reckona/mreact-compat/jsx-runtime";
const JSX_DEV_RUNTIME_SOURCE = "@reckona/mreact-compat/jsx-dev-runtime";
const REACTIVE_DOM_SOURCE = "@reckona/mreact-reactive-dom";

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
  const reactiveDomSpecifiers = collectReactiveDomImportSpecifiers(ir, dev);
  const helperNames = allocateHelperNames(ir, componentSpecifiers, reactiveDomSpecifiers);
  const importGroups = createImportGroups(
    componentSpecifiers,
    reactiveDomSpecifiers,
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
    const directTextBindings = collectDirectTextBindings(component);
    const reactiveDomBlock = dev ? undefined : getReactiveDomBlock(component.root, directTextBindings);

    if (reactiveDomBlock !== undefined) {
      specifiers.add("REACTIVE_STATE_BINDING_META");
      specifiers.add("createReactiveDomBlock");
      continue;
    }

    if (!dev && getPropReactiveDomBlock(component) !== undefined) {
      specifiers.add("createReactiveDomBlock");
      continue;
    }

    if (directTextBindings.length > 0) {
      specifiers.add("REACTIVE_TEXT_BINDING_META");
    }

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

function collectReactiveDomImportSpecifiers(ir: ModuleIr, dev: boolean): string[] {
  const specifiers = new Set<string>();

  if (dev) {
    return [];
  }

  for (const component of ir.components) {
    const reactiveDomBlock = getReactiveDomBlock(component.root, collectDirectTextBindings(component));

    if (reactiveDomBlock !== undefined) {
      specifiers.add("bindText");
      specifiers.add("createTemplate");
      continue;
    }

    if (getPropReactiveDomBlock(component) !== undefined) {
      specifiers.add("bindText");
      specifiers.add("bindProp");
    }
  }

  return Array.from(specifiers).sort();
}

interface CompatHelperNames {
  Fragment?: string;
  REACTIVE_STATE_BINDING_META?: string;
  REACTIVE_TEXT_BINDING_META?: string;
  bindText?: string;
  bindProp?: string;
  createReactiveDomBlock?: string;
  createTemplate?: string;
  jsx?: string;
  jsxDEV?: string;
  jsxs?: string;
}

interface DirectTextBinding {
  stateName: string;
  tupleName: string;
  textBindingName: string;
  stateBindingName: string;
}

interface ReactiveDomBlock {
  element: JsxElementIr;
  binding: DirectTextBinding;
}

function allocateHelperNames(
  ir: ModuleIr,
  specifiers: readonly string[],
  reactiveDomSpecifiers: readonly string[] = [],
): CompatHelperNames {
  const allocator = createNameAllocator(collectReservedHelperNames(ir));
  const helperNames: CompatHelperNames = {};

  for (const specifier of [...specifiers, ...reactiveDomSpecifiers]) {
    if (specifier === "bindText") {
      helperNames.bindText = allocator("_bindText");
      continue;
    }

    if (specifier === "bindProp") {
      helperNames.bindProp = allocator("_bindProp");
      continue;
    }

    if (specifier === "createTemplate") {
      helperNames.createTemplate = allocator("_createTemplate");
      continue;
    }

    if (specifier === "Fragment") {
      helperNames.Fragment = allocator("_Fragment");
      continue;
    }

    if (specifier === "REACTIVE_STATE_BINDING_META") {
      helperNames.REACTIVE_STATE_BINDING_META = allocator("_REACTIVE_STATE_BINDING_META");
      continue;
    }

    if (specifier === "REACTIVE_TEXT_BINDING_META") {
      helperNames.REACTIVE_TEXT_BINDING_META = allocator("_REACTIVE_TEXT_BINDING_META");
      continue;
    }

    if (specifier === "createReactiveDomBlock") {
      helperNames.createReactiveDomBlock = allocator("_createReactiveDomBlock");
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
    /^\s*import\s+\{\s*(?<specifiers>[^}]*)\s*\}\s+from\s+["@'](?<source>@reckona\/mreact-compat\/jsx(?:-dev)?-runtime)(?:\.js)?["@'];?\s*$/,
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
      /^(?<importedName>Fragment|REACTIVE_STATE_BINDING_META|REACTIVE_TEXT_BINDING_META|createReactiveDomBlock|jsx|jsxDEV|jsxs)\s+as\s+(?<localName>[A-Za-z_$][\w$]*)$/,
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

    return /^(Fragment|REACTIVE_STATE_BINDING_META|REACTIVE_TEXT_BINDING_META|createReactiveDomBlock|jsx|jsxDEV|jsxs)$/.test(specifier)
      ? [{ importedName: specifier, localName: specifier, source }]
      : [];
  });
}

function createImportGroups(
  componentSpecifiers: readonly string[],
  reactiveDomSpecifiers: readonly string[],
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

  for (const specifier of reactiveDomSpecifiers) {
    const localName = helperNames[specifier as "bindText" | "bindProp" | "createTemplate"] ?? `_${specifier}`;
    addImportSpecifier(groups, REACTIVE_DOM_SOURCE, specifier, localName);
  }

  for (const specifier of componentSpecifiers) {
    if (specifier === "Fragment") {
      const localName = helperNames.Fragment ?? "_Fragment";
      addImportSpecifier(groups, componentImportSource, "Fragment", localName);
      continue;
    }

    if (specifier === "REACTIVE_STATE_BINDING_META") {
      const localName = helperNames.REACTIVE_STATE_BINDING_META ?? "_REACTIVE_STATE_BINDING_META";
      addImportSpecifier(groups, componentImportSource, "REACTIVE_STATE_BINDING_META", localName);
      continue;
    }

    if (specifier === "REACTIVE_TEXT_BINDING_META") {
      const localName = helperNames.REACTIVE_TEXT_BINDING_META ?? "_REACTIVE_TEXT_BINDING_META";
      addImportSpecifier(groups, componentImportSource, "REACTIVE_TEXT_BINDING_META", localName);
      continue;
    }

    if (specifier === "createReactiveDomBlock") {
      const localName = helperNames.createReactiveDomBlock ?? "_createReactiveDomBlock";
      addImportSpecifier(groups, componentImportSource, "createReactiveDomBlock", localName);
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
  const directTextBindings = collectDirectTextBindings(component, helperNames);
  const reactiveDomBlock = dev ? undefined : getReactiveDomBlock(component.root, directTextBindings);
  const propReactiveDomBlock =
    !dev && reactiveDomBlock === undefined ? getPropReactiveDomBlock(component) : undefined;
  const body = component.bodyStatements.map((statement) =>
    `  ${rewriteDirectTextBindingStatement(statement, directTextBindings, helperNames, reactiveDomBlock !== undefined)}`
  );
  const parameters = component.parameters.join(", ");
  const functionKeyword = `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}${
    component.async === true ? "async " : ""
  }function`;

  if (propReactiveDomBlock !== undefined) {
    return emitPropReactiveDomBlockComponent(component, propReactiveDomBlock, helperNames, functionKeyword);
  }

  if (reactiveDomBlock !== undefined) {
    const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));
    const templateName = allocator(`_tmpl_${component.name}`);
    const templateHtml = JSON.stringify(renderStaticReactiveDomBlockHtml(reactiveDomBlock.element));

    return [
      `const ${templateName} = ${helperNames.createTemplate ?? "_createTemplate"}(${templateHtml});`,
      `${functionKeyword} ${component.name}(${parameters}) {`,
      ...body,
      emitReactiveDomBlockReturn(reactiveDomBlock, helperNames, templateName, allocator),
      `}`,
    ].join("\n");
  }

  return [
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    `  return ${emitJsxNode(component.root, helperNames, dev, directTextBindings)};`,
    `}`,
  ].join("\n");
}

function emitJsxNode(
  node: JsxNodeIr,
  helperNames: CompatHelperNames,
  dev: boolean,
  directTextBindings: readonly DirectTextBinding[] = [],
): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    const whenTrue = emitCompatChildren(node.whenTrue, helperNames, dev, directTextBindings);
    const whenFalse = emitCompatChildren(node.whenFalse, helperNames, dev, directTextBindings);

    return node.conditionValueName === undefined
      ? `(${node.conditionCode}) ? ${whenTrue} : ${whenFalse}`
      : `(() => { const ${node.conditionValueName} = (${node.conditionCode}); return ${node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`;
  }

  if (node.kind === "list") {
    const parameters = emitListParameters(node);
    return `(${node.itemsCode}).map(${emitListRenderer(node, parameters, helperNames, dev, directTextBindings)})`;
  }

  if (node.kind === "fragment") {
    return emitJsxCall(helperNames.Fragment ?? "_Fragment", node, helperNames, dev);
  }

  if (node.kind === "component") {
    const keyArgument =
      node.keyCode === undefined ? undefined : `(${node.keyCode})`;
    const props = emitComponentProps(node.props, node.children, helperNames, dev, directTextBindings);
    return dev
      ? emitJsxDevCall(helperNames.jsxDEV ?? "_jsxDEV", node.name, props, keyArgument, node.children.length > 1)
      : `${helperNames.jsx ?? "_jsx"}(${node.name}, ${props}${keyArgument === undefined ? "" : `, ${keyArgument}`})`;
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  return emitJsxCall(JSON.stringify(node.tagName), node, helperNames, dev, directTextBindings);
}

function emitCompatChildren(
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
  dev: boolean,
  directTextBindings: readonly DirectTextBinding[] = [],
): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr, helperNames, dev, directTextBindings);
  }

  return `[${children.map((child) => emitJsxNode(child, helperNames, dev, directTextBindings)).join(", ")}]`;
}

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  helperNames: CompatHelperNames,
  dev: boolean,
  directTextBindings: readonly DirectTextBinding[] = [],
): string {
  const valueExpression = emitCompatChildren(node.children, helperNames, dev, directTextBindings);

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitListParameters(node: Extract<JsxNodeIr, { kind: "list" }>): string {
  return [node.itemName, node.indexName, node.arrayName]
    .filter((name): name is string => name !== undefined)
    .join(", ");
}

function emitJsxCall(
  typeExpression: string,
  node: JsxElementIr | JsxFragmentIr,
  helperNames: CompatHelperNames,
  dev: boolean,
  directTextBindings: readonly DirectTextBinding[] = [],
): string {
  if (dev) {
    const keyArgument =
      node.kind === "element" && node.keyCode !== undefined
        ? `(${node.keyCode})`
        : undefined;
    return emitJsxDevCall(
      helperNames.jsxDEV ?? "_jsxDEV",
      typeExpression,
      emitProps(node, helperNames, dev, directTextBindings),
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

  return `${callee}(${typeExpression}, ${emitProps(node, helperNames, dev, directTextBindings)}${keyArgument})`;
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
  directTextBindings: readonly DirectTextBinding[] = [],
): string {
  const entries =
    node.kind === "element" ? node.attributes.map(emitAttribute) : [];
  const children = emitChildren(node.children, helperNames, dev, directTextBindings);
  const directTextBinding = node.kind === "element"
    ? findDirectTextBindingForChildren(node.children, directTextBindings)
    : undefined;

  if (children !== undefined) {
    entries.push(`children: ${children}`);
  }

  if (directTextBinding !== undefined) {
    entries.push(
      `[${helperNames.REACTIVE_TEXT_BINDING_META ?? "_REACTIVE_TEXT_BINDING_META"}]: ${directTextBinding.textBindingName}`,
    );
  }

  return `{ ${entries.join(", ")} }`;
}

function emitChildren(
  children: JsxNodeIr[],
  helperNames: CompatHelperNames,
  dev: boolean,
  directTextBindings: readonly DirectTextBinding[] = [],
): string | undefined {
  if (children.length === 0) {
    return undefined;
  }

  if (children.length === 1) {
    return emitJsxNode(children[0] as JsxNodeIr, helperNames, dev, directTextBindings);
  }

  return `[${children.map((child) => emitJsxNode(child, helperNames, dev, directTextBindings)).join(", ")}]`;
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
  directTextBindings: readonly DirectTextBinding[] = [],
): string {
  const entries = props
    .map((prop) => {
      if (prop.kind === "spread-prop") {
        return `...(${prop.code})`;
      }

      if (prop.kind === "render-prop") {
        const renderedChildren =
          emitChildren(prop.children, helperNames, dev, directTextBindings) ?? "null";
        return prop.valueName === undefined
          ? `${emitPropName(prop.name)}: ${renderedChildren}`
          : `${emitPropName(prop.name)}: (${prop.valueName}) => ${renderedChildren}`;
      }

      return `${emitPropName(prop.name)}: (${prop.code})`;
    })
    .filter(Boolean);

  if (children.length > 0) {
    entries.push(`children: ${emitChildren(children, helperNames, dev, directTextBindings) ?? "null"}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function collectDirectTextBindings(
  component: ComponentIr,
  helperNames?: CompatHelperNames,
): DirectTextBinding[] {
  const candidates: DirectTextBinding[] = [];
  const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));

  for (const statement of component.bodyStatements) {
    const match = statement.match(
      /^\s*const\s+\[\s*(?<stateName>[A-Za-z_$][\w$]*)\s*,\s*[A-Za-z_$][\w$]*\s*\]\s*=\s*useState\(.+\);\s*$/,
    );
    const stateName = match?.groups?.stateName;

    if (stateName === undefined) {
      continue;
    }

    candidates.push({
      stateName,
      tupleName: allocator(`_${stateName}StateTuple`),
      textBindingName: allocator(`_${stateName}TextBinding`),
      stateBindingName: allocator(`_${stateName}StateBinding`),
    });
  }

  return candidates.filter((candidate) => directTextBindingIsSafe(component, candidate));
}

function collectReservedComponentLocalNames(
  component: ComponentIr,
  helperNames?: CompatHelperNames,
): string[] {
  return [
    component.name,
    component.exportName,
    ...component.parameters,
    ...component.bindingNames,
    ...Object.values(helperNames ?? {}).filter((name): name is string => name !== undefined),
  ];
}

function directTextBindingIsSafe(
  component: ComponentIr,
  candidate: DirectTextBinding,
): boolean {
  let directTextUses = 0;
  let unsafe = false;

  visit(component.root, (node) => {
    if (node.kind === "expr" && node.code === candidate.stateName) {
      directTextUses += 1;
      return;
    }

    if (node.kind === "expr" && containsIdentifier(node.code, candidate.stateName)) {
      unsafe = true;
      return;
    }

    if (nodeHasStructuralIdentifierUse(node, candidate.stateName)) {
      unsafe = true;
      return;
    }

    if (node.kind === "element") {
      for (const attr of node.attributes) {
        if (attr.kind === "static-attr") {
          continue;
        }

        if (containsIdentifier(attr.code, candidate.stateName)) {
          unsafe = true;
        }
      }
    }
  });

  for (const statement of component.bodyStatements) {
    if (isDirectTextBindingDeclaration(statement, candidate.stateName)) {
      continue;
    }

    if (containsIdentifier(statement, candidate.stateName)) {
      unsafe = true;
    }
  }

  return directTextUses === 1 && !unsafe && hasDirectTextBindingHost(component.root, candidate);
}

function nodeHasStructuralIdentifierUse(node: JsxNodeIr, stateName: string): boolean {
  if (node.kind === "conditional") {
    return containsIdentifier(node.conditionCode, stateName);
  }

  if (node.kind === "list") {
    return [
      node.itemsCode,
      node.keyCode,
      ...(node.bodyStatements ?? []),
    ].some((code) => code !== undefined && containsIdentifier(code, stateName));
  }

  if (node.kind === "component") {
    return (
      (node.keyCode !== undefined && containsIdentifier(node.keyCode, stateName)) ||
      node.props.some((prop) => {
        if (prop.kind === "render-prop") {
          return false;
        }

        return containsIdentifier(prop.code, stateName);
      })
    );
  }

  if (node.kind === "element") {
    return node.keyCode !== undefined && containsIdentifier(node.keyCode, stateName);
  }

  if (node.kind === "async-boundary") {
    return [
      node.valueCode,
      node.placeholderTagCode,
      node.catchName,
    ].some((code) => code !== undefined && containsIdentifier(code, stateName));
  }

  if (node.kind === "fragment") {
    return (node.bodyStatements ?? []).some((statement) => containsIdentifier(statement, stateName));
  }

  return false;
}

function isDirectTextBindingDeclaration(statement: string, stateName: string): boolean {
  return new RegExp(
    `^\\s*const\\s+\\[\\s*${stateName}\\s*,\\s*[A-Za-z_$][\\w$]*\\s*\\]\\s*=\\s*useState\\(.+\\);\\s*$`,
  ).test(statement);
}

function hasDirectTextBindingHost(
  node: JsxNodeIr,
  candidate: DirectTextBinding,
): boolean {
  let found = false;

  visit(node, (current) => {
    if (
      current.kind === "element" &&
      findDirectTextBindingForChildren(current.children, [candidate]) !== undefined
    ) {
      found = true;
    }
  });

  return found;
}

function rewriteDirectTextBindingStatement(
  statement: string,
  directTextBindings: readonly DirectTextBinding[],
  helperNames: CompatHelperNames,
  useStateBinding: boolean,
): string {
  for (const binding of directTextBindings) {
    const match = statement.match(
      /^\s*const\s+\[\s*(?<stateName>[A-Za-z_$][\w$]*)\s*,\s*(?<setterName>[A-Za-z_$][\w$]*)\s*\]\s*=\s*(?<initializer>useState\(.+\));\s*$/,
    );

    if (match?.groups?.stateName !== binding.stateName) {
      continue;
    }

    const metadataName = useStateBinding
      ? helperNames.REACTIVE_STATE_BINDING_META ?? "_REACTIVE_STATE_BINDING_META"
      : helperNames.REACTIVE_TEXT_BINDING_META ?? "_REACTIVE_TEXT_BINDING_META";
    const bindingName = useStateBinding ? binding.stateBindingName : binding.textBindingName;
    return [
      `const ${binding.tupleName} = ${match.groups.initializer};`,
      `  const [${binding.stateName}, ${match.groups.setterName}] = ${binding.tupleName};`,
      `  const ${bindingName} = ${binding.tupleName}[${metadataName}];`,
    ].join("\n");
  }

  return statement;
}

function getReactiveDomBlock(
  root: JsxNodeIr,
  directTextBindings: readonly DirectTextBinding[],
): ReactiveDomBlock | undefined {
  if (root.kind !== "element") {
    return undefined;
  }

  if (root.keyCode !== undefined || root.attributes.some((attr) => attr.kind !== "static-attr")) {
    return undefined;
  }

  const binding = findDirectTextBindingForChildren(root.children, directTextBindings);

  if (binding === undefined) {
    return undefined;
  }

  return {
    element: root,
    binding,
  };
}

function emitReactiveDomBlockReturn(
  block: ReactiveDomBlock,
  helperNames: CompatHelperNames,
  templateName: string,
  allocateName: (baseName: string) => string,
): string {
  const binding = block.binding;
  const createBlock = helperNames.createReactiveDomBlock ?? "_createReactiveDomBlock";
  const bindText = helperNames.bindText ?? "_bindText";
  const fragmentName = allocateName("_fragment");
  const rootName = allocateName("_root");
  const textNodeName = allocateName(`_${binding.stateName}TextNode`);
  const textValueName = allocateName(`_${binding.stateName}TextValue`);
  const textDisposeName = allocateName(`_${binding.stateName}TextDispose`);

  return [
    `  return ${createBlock}(() => {`,
    `    const ${fragmentName} = ${templateName}();`,
    `    const ${rootName} = ${fragmentName}.firstChild;`,
    `    const ${textNodeName} = document.createTextNode("");`,
    `    ${rootName}.childNodes[0].replaceWith(${textNodeName});`,
    `    const ${textValueName} = ${binding.stateBindingName}.get();`,
    `    ${textNodeName}.data = ${textValueName} == null ? "" : String(${textValueName});`,
    `    const ${textDisposeName} = ${bindText}(${textNodeName}, () => ${binding.stateBindingName}.get(), { preserveInitial: true });`,
    `    return { node: ${rootName}, dispose: ${textDisposeName} };`,
    "  });",
  ].join("\n");
}

function renderStaticReactiveDomBlockHtml(element: JsxElementIr): string {
  const attrs = element.attributes
    .filter((attr): attr is Extract<AttributeIr, { kind: "static-attr" }> => attr.kind === "static-attr")
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join("");

  return `<${element.tagName}${attrs}><!----></${element.tagName}>`;
}

function findDirectTextBindingForChildren(
  children: readonly JsxNodeIr[],
  directTextBindings: readonly DirectTextBinding[],
): DirectTextBinding | undefined {
  if (children.length !== 1) {
    return undefined;
  }

  const child = children[0];

  if (child?.kind !== "expr") {
    return undefined;
  }

  return directTextBindings.find((binding) => binding.stateName === child.code);
}

interface PropReactiveDomBlock {
  root: JsxElementIr;
  propsParam: string;
}

const PROP_BLOCK_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

// Detects a component lowerable to a PROP-bridged reactive DOM block: a single
// (non-destructured) props parameter, no body statements (no hooks), and a
// host-only element tree (elements + static/dynamic attrs + events + text
// expressions) with at least one dynamic part. Prop expressions are emitted
// verbatim because the block closure parameter shadows the props parameter, so
// e.g. `props.row.id` reads the reactive proxy with no rewriting needed.
function getPropReactiveDomBlock(component: ComponentIr): PropReactiveDomBlock | undefined {
  if (component.parameters.length !== 1) {
    return undefined;
  }

  const propsParam = component.parameters[0];

  if (propsParam === undefined || !PROP_BLOCK_IDENTIFIER.test(propsParam)) {
    return undefined;
  }

  if (component.bodyStatements.length > 0) {
    return undefined;
  }

  const root = component.root;

  if (root.kind !== "element" || root.keyCode !== undefined) {
    return undefined;
  }

  if (!isHostOnlyPropBlockNode(root) || !propBlockHasDynamicPart(root)) {
    return undefined;
  }

  return { root, propsParam };
}

// Conventional node-valued slot props (mirrors oxc-render-values.ts): a text
// expression referencing one of these may hold React nodes, not primitive text,
// so it is not safe to bind with bindText. Conservatively bail on any of them.
const PROP_BLOCK_NODE_VALUED = /\b(children|fallback|header|sidebar|element)\b/;

function isHostOnlyPropBlockNode(node: JsxNodeIr): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    return !PROP_BLOCK_NODE_VALUED.test(node.code);
  }

  if (node.kind !== "element" || node.keyCode !== undefined) {
    return false;
  }

  if (node.attributes.some((attr) => attr.kind === "spread-attr")) {
    return false;
  }

  return node.children.every(isHostOnlyPropBlockNode);
}

function propBlockHasDynamicPart(node: JsxNodeIr): boolean {
  if (node.kind === "expr") {
    return true;
  }

  if (node.kind !== "element") {
    return false;
  }

  if (node.attributes.some((attr) => attr.kind === "dynamic-attr" || attr.kind === "event")) {
    return true;
  }

  return node.children.some(propBlockHasDynamicPart);
}

function emitPropReactiveDomBlockComponent(
  component: ComponentIr,
  block: PropReactiveDomBlock,
  helperNames: CompatHelperNames,
  functionKeyword: string,
): string {
  const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));
  const createBlock = helperNames.createReactiveDomBlock ?? "_createReactiveDomBlock";
  const bindTextName = helperNames.bindText ?? "_bindText";
  const bindPropName = helperNames.bindProp ?? "_bindProp";

  const build: string[] = [];
  const disposers: string[] = [];
  const rootVar = emitPropBlockNode(block.root, undefined, build, disposers, allocator, bindTextName, bindPropName);
  const disposeName = allocator("_dispose");
  const disposeExpr =
    disposers.length === 0
      ? "undefined"
      : `() => { ${disposers.map((name) => `${name}();`).join(" ")} }`;

  return [
    `${functionKeyword} ${component.name}(${block.propsParam}) {`,
    // The closure parameter intentionally shadows the props parameter: it is the
    // reactive props proxy, so the verbatim prop expressions below stay reactive.
    `  return ${createBlock}((${block.propsParam}) => {`,
    ...build.map((line) => `    ${line}`),
    `    const ${disposeName} = ${disposeExpr};`,
    `    return { node: ${rootVar}, dispose: ${disposeName} };`,
    `  }, ${block.propsParam});`,
    `}`,
  ].join("\n");
}

function emitPropBlockNode(
  node: JsxNodeIr,
  parentVar: string | undefined,
  build: string[],
  disposers: string[],
  allocator: (baseName: string) => string,
  bindTextName: string,
  bindPropName: string,
): string {
  if (node.kind === "text") {
    const name = allocator("_text");
    build.push(`const ${name} = document.createTextNode(${JSON.stringify(node.value)});`);
    if (parentVar !== undefined) {
      build.push(`${parentVar}.appendChild(${name});`);
    }
    return name;
  }

  if (node.kind === "expr") {
    const name = allocator("_text");
    const disposeName = allocator("_bind");
    build.push(`const ${name} = document.createTextNode("");`);
    build.push(
      `const ${disposeName} = ${bindTextName}(${name}, () => (${node.code}), { preserveInitial: false });`,
    );
    disposers.push(disposeName);
    if (parentVar !== undefined) {
      build.push(`${parentVar}.appendChild(${name});`);
    }
    return name;
  }

  const element = node as JsxElementIr;
  const name = allocator(`_${element.tagName.replace(/[^A-Za-z0-9_$]/g, "_") || "el"}`);
  build.push(`const ${name} = document.createElement(${JSON.stringify(element.tagName)});`);

  for (const attr of element.attributes) {
    if (attr.kind === "static-attr") {
      if (attr.name === "className") {
        build.push(`${name}.className = ${JSON.stringify(attr.value)};`);
      } else {
        build.push(`${name}.setAttribute(${JSON.stringify(attr.name)}, ${JSON.stringify(attr.value)});`);
      }
    } else if (attr.kind === "dynamic-attr") {
      const disposeName = allocator("_bind");
      build.push(
        `const ${disposeName} = ${bindPropName}(${name}, ${JSON.stringify(attr.name)}, () => (${attr.code}));`,
      );
      disposers.push(disposeName);
    } else if (attr.kind === "event") {
      build.push(`${name}.addEventListener(${JSON.stringify(attr.eventName)}, ${attr.code});`);
    }
  }

  for (const child of element.children) {
    emitPropBlockNode(child, name, build, disposers, allocator, bindTextName, bindPropName);
  }

  if (parentVar !== undefined) {
    build.push(`${parentVar}.appendChild(${name});`);
  }

  return name;
}

function containsIdentifier(code: string, name: string): boolean {
  return new RegExp(`(^|[^A-Za-z_$\\d])${name}([^A-Za-z_$\\d]|$)`).test(code);
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
