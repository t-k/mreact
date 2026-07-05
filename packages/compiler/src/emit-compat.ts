import type {
  AttributeIr,
  ComponentPropIr,
  ComponentIr,
  JsxElementIr,
  JsxFragmentIr,
  JsxNodeIr,
  ModuleIr,
  PropAliasIr,
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

export function emitCompat(ir: ModuleIr, options: EmitCompatOptions = {}): EmitCompatResult {
  if (ir.components.length === 0 && ir.moduleStatements.length === 0) {
    return {
      code: "",
      imports: [],
    };
  }

  const dev = options.dev === true;
  const staticPropBlockComponentNames = collectStaticPropBlockComponentNames(ir, dev);
  const normalizedModuleStatements = normalizeCompatModuleStatements(
    ir.moduleStatements,
    staticPropBlockComponentNames,
  );
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
    const reactiveDomBlock = dev
      ? undefined
      : getReactiveDomBlock(component.root, directTextBindings);

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
    const reactiveDomBlock = getReactiveDomBlock(
      component.root,
      collectDirectTextBindings(component),
    );

    if (reactiveDomBlock !== undefined) {
      specifiers.add("bindText");
      specifiers.add("createTemplate");
      continue;
    }

    if (getPropReactiveDomBlock(component) !== undefined) {
      if (propBlockHasEvent(component.root)) {
        specifiers.add("bindEvent");
      }
      if (propBlockHasBindPropBinding(component.root)) {
        specifiers.add("bindProp");
      }
      if (propBlockHasEffectBinding(component.root)) {
        specifiers.add("effect");
      }
    }
  }

  return Array.from(specifiers).sort();
}

interface CompatHelperNames {
  Fragment?: string;
  REACTIVE_STATE_BINDING_META?: string;
  REACTIVE_TEXT_BINDING_META?: string;
  bindEvent?: string;
  bindText?: string;
  bindProp?: string;
  effect?: string;
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
    if (specifier === "bindEvent") {
      helperNames.bindEvent = allocator("_bindEvent");
      continue;
    }

    if (specifier === "bindText") {
      helperNames.bindText = allocator("_bindText");
      continue;
    }

    if (specifier === "bindProp") {
      helperNames.bindProp = allocator("_bindProp");
      continue;
    }

    if (specifier === "effect") {
      helperNames.effect = allocator("_effect");
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

function normalizeCompatModuleStatements(
  statements: readonly string[],
  staticPropBlockComponentNames: ReadonlySet<string>,
): NormalizedModuleStatements {
  const importSpecifiers = new Map<string, CompatRuntimeImportSpecifier>();
  const normalizedStatements = statements.map((statement) => {
    const stripped = stripCompatRuntimeImports(statement, importSpecifiers);
    return annotateCompatMemoCompareProps(stripped, staticPropBlockComponentNames);
  });

  return {
    statements: normalizedStatements,
    importSpecifiers: Array.from(importSpecifiers.values()),
  };
}

function collectStaticPropBlockComponentNames(ir: ModuleIr, dev: boolean): ReadonlySet<string> {
  const names = new Set<string>();
  if (dev) {
    return names;
  }

  for (const component of ir.components) {
    if (getPropReactiveDomBlock(component) !== undefined) {
      names.add(component.name);
    }
  }

  return names;
}

function annotateCompatMemoCompareProps(
  statement: string,
  staticPropBlockComponentNames: ReadonlySet<string>,
): string {
  const match = statement.match(
    /^\s*(?:export\s+)?(?:const|let|var)\s+(?<memoName>[A-Za-z_$][\w$]*)\s*=\s*memo\s*\(\s*(?<componentName>[A-Za-z_$][\w$]*)\s*,\s*\(\s*(?<previousName>[A-Za-z_$][\w$]*)\s*,\s*(?<nextName>[A-Za-z_$][\w$]*)\s*\)\s*=>\s*(?<body>[\s\S]*?)\s*,?\s*\)\s*;?\s*$/,
  );

  const groups = match?.groups;
  if (groups === undefined) {
    return statement;
  }

  const { memoName, componentName, previousName, nextName, body } = groups;
  if (
    memoName === undefined ||
    componentName === undefined ||
    previousName === undefined ||
    nextName === undefined ||
    body === undefined ||
    !staticPropBlockComponentNames.has(componentName)
  ) {
    return statement;
  }

  const compareProps = readStrictEqualityMemoCompareProps(body, previousName, nextName);
  if (compareProps === undefined) {
    return statement;
  }

  const propsLiteral = `[${compareProps.map((prop) => JSON.stringify(prop)).join(", ")}]`;
  return `${statement}\n${memoName}.__mreactMemoCompareProps = ${propsLiteral};`;
}

function readStrictEqualityMemoCompareProps(
  body: string,
  previousName: string,
  nextName: string,
): string[] | undefined {
  const parts = body.split(/\s*&&\s*/).map((part) => stripOuterParens(part.trim()));
  if (parts.length === 0 || parts.some((part) => part === "")) {
    return undefined;
  }

  const props: string[] = [];
  const propName = "([A-Za-z_$][\\w$]*)";
  const previous = escapeRegex(previousName);
  const next = escapeRegex(nextName);
  const forward = new RegExp(`^${previous}\\.${propName}\\s*===\\s*${next}\\.\\1$`);
  const reverse = new RegExp(`^${next}\\.${propName}\\s*===\\s*${previous}\\.\\1$`);

  for (const part of parts) {
    const prop = part.match(forward)?.[1] ?? part.match(reverse)?.[1];
    if (prop === undefined) {
      return undefined;
    }
    if (!props.includes(prop)) {
      props.push(prop);
    }
  }

  return props;
}

function stripOuterParens(value: string): string {
  let current = value;
  while (current.startsWith("(") && current.endsWith(")")) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function parseCompatRuntimeImportLine(line: string): CompatRuntimeImportSpecifier[] | undefined {
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

      return [
        {
          importedName,
          localName,
          source,
        },
      ];
    }

    return /^(Fragment|REACTIVE_STATE_BINDING_META|REACTIVE_TEXT_BINDING_META|createReactiveDomBlock|jsx|jsxDEV|jsxs)$/.test(
      specifier,
    )
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
    const localName =
      helperNames[
        specifier as "bindEvent" | "bindText" | "bindProp" | "effect" | "createTemplate"
      ] ?? `_${specifier}`;
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
    .map(
      (group) =>
        `import { ${Array.from(group.specifiers.values()).join(", ")} } from "${group.source}";`,
    )
    .join("\n");
}

function emitComponent(
  component: ComponentIr,
  helperNames: CompatHelperNames,
  dev: boolean,
): string {
  const directTextBindings = collectDirectTextBindings(component, helperNames);
  const reactiveDomBlock = dev
    ? undefined
    : getReactiveDomBlock(component.root, directTextBindings);
  const propReactiveDomBlock =
    !dev && reactiveDomBlock === undefined ? getPropReactiveDomBlock(component) : undefined;
  const body = component.bodyStatements.map(
    (statement) =>
      `  ${rewriteDirectTextBindingStatement(statement, directTextBindings, helperNames, reactiveDomBlock !== undefined)}`,
  );
  const parameters = component.parameters.join(", ");
  const functionKeyword = `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}${
    component.async === true ? "async " : ""
  }function`;

  if (propReactiveDomBlock !== undefined) {
    return emitPropReactiveDomBlockComponent(
      component,
      propReactiveDomBlock,
      helperNames,
      functionKeyword,
    );
  }

  if (reactiveDomBlock !== undefined) {
    const allocator = createNameAllocator(
      collectReservedComponentLocalNames(component, helperNames),
    );
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
    const keyArgument = node.keyCode === undefined ? undefined : `(${node.keyCode})`;
    const props = emitComponentProps(
      node.props,
      node.children,
      helperNames,
      dev,
      directTextBindings,
    );
    return dev
      ? emitJsxDevCall(
          helperNames.jsxDEV ?? "_jsxDEV",
          node.name,
          props,
          keyArgument,
          node.children.length > 1,
        )
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
      node.kind === "element" && node.keyCode !== undefined ? `(${node.keyCode})` : undefined;
    return emitJsxDevCall(
      helperNames.jsxDEV ?? "_jsxDEV",
      typeExpression,
      emitProps(node, helperNames, dev, directTextBindings),
      keyArgument,
      node.children.length > 1,
    );
  }

  const callee =
    node.children.length > 1 ? (helperNames.jsxs ?? "_jsxs") : (helperNames.jsx ?? "_jsx");
  const keyArgument =
    node.kind === "element" && node.keyCode !== undefined ? `, (${node.keyCode})` : "";

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
  const entries = node.kind === "element" ? node.attributes.map(emitAttribute) : [];
  const children = emitChildren(node.children, helperNames, dev, directTextBindings);
  const directTextBinding =
    node.kind === "element"
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
    entries.push(
      `children: ${emitChildren(children, helperNames, dev, directTextBindings) ?? "null"}`,
    );
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

function directTextBindingIsSafe(component: ComponentIr, candidate: DirectTextBinding): boolean {
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

    if (
      containsIdentifier(statement, candidate.stateName) ||
      !isDirectTextBindingSafeBodyStatement(statement)
    ) {
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
    return [node.itemsCode, node.keyCode, ...(node.bodyStatements ?? [])].some(
      (code) => code !== undefined && containsIdentifier(code, stateName),
    );
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
    return [node.valueCode, node.placeholderTagCode, node.catchName].some(
      (code) => code !== undefined && containsIdentifier(code, stateName),
    );
  }

  if (node.kind === "fragment") {
    return (node.bodyStatements ?? []).some((statement) =>
      containsIdentifier(statement, stateName),
    );
  }

  return false;
}

function isDirectTextBindingDeclaration(statement: string, stateName: string): boolean {
  return new RegExp(
    `^\\s*const\\s+\\[\\s*${stateName}\\s*,\\s*[A-Za-z_$][\\w$]*\\s*\\]\\s*=\\s*useState\\(.+\\);\\s*$`,
  ).test(statement);
}

function hasDirectTextBindingHost(node: JsxNodeIr, candidate: DirectTextBinding): boolean {
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
      ? (helperNames.REACTIVE_STATE_BINDING_META ?? "_REACTIVE_STATE_BINDING_META")
      : (helperNames.REACTIVE_TEXT_BINDING_META ?? "_REACTIVE_TEXT_BINDING_META");
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
    .filter(
      (attr): attr is Extract<AttributeIr, { kind: "static-attr" }> => attr.kind === "static-attr",
    )
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
  propAliases?: PropAliasIr[];
}

const PROP_BLOCK_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

// Detects a component lowerable to a PROP-bridged reactive DOM block: a single
// props parameter or a narrow plain object destructuring parameter, no body
// statements (no hooks), and a host-only element tree (elements + static/dynamic
// attrs + events + text expressions) with at least one dynamic part.
function getPropReactiveDomBlock(component: ComponentIr): PropReactiveDomBlock | undefined {
  if (component.parameters.length !== 1) {
    return undefined;
  }

  const propsParam = component.parameters[0];
  const propAliases = component.parameterPropAliases;

  if (
    propsParam === undefined ||
    (!PROP_BLOCK_IDENTIFIER.test(propsParam) && propAliases === undefined)
  ) {
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

  if (propAliases !== undefined && !canRewritePropBlockAliasNode(root, "props", propAliases)) {
    return undefined;
  }

  return propAliases === undefined
    ? { root, propsParam }
    : { root, propsParam: "props", propAliases };
}

// Conventional node-valued slot props (mirrors oxc-render-values.ts): a text
// expression referencing one of these may hold React nodes, not primitive text,
// so it is not safe to bind with bindText. Conservatively bail on any of them.
const PROP_BLOCK_NODE_VALUED = /\b(children|fallback|header|sidebar|element)\b/;
const PROP_BLOCK_UNSUPPORTED_DYNAMIC_ATTRS = new Set([
  "dangerouslySetInnerHTML",
  "ref",
  "suppressHydrationWarning",
]);
const PROP_BLOCK_FORM_VALUE_TAGS = new Set(["input", "select", "textarea"]);
const PROP_BLOCK_FORM_VALUE_ATTRS = new Set(["checked", "defaultChecked", "defaultValue", "value"]);

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

  for (const attr of node.attributes) {
    if (attr.kind === "spread-attr") {
      return false;
    }

    if (
      attr.kind === "dynamic-attr" &&
      isUnsupportedPropBlockDynamicAttr(node.tagName, attr.name)
    ) {
      return false;
    }
  }

  return node.children.every(isHostOnlyPropBlockNode);
}

function isUnsupportedPropBlockDynamicAttr(tagName: string, attrName: string): boolean {
  if (PROP_BLOCK_UNSUPPORTED_DYNAMIC_ATTRS.has(attrName)) {
    return true;
  }

  return PROP_BLOCK_FORM_VALUE_TAGS.has(tagName) && PROP_BLOCK_FORM_VALUE_ATTRS.has(attrName);
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

function propBlockHasEvent(node: JsxNodeIr): boolean {
  if (node.kind !== "element") {
    return false;
  }

  if (node.attributes.some((attr) => attr.kind === "event")) {
    return true;
  }

  return node.children.some(propBlockHasEvent);
}

function propBlockHasEffectBinding(node: JsxNodeIr): boolean {
  if (node.kind === "expr") {
    return true;
  }

  if (node.kind !== "element") {
    return false;
  }

  if (
    node.attributes.some(
      (attr) =>
        attr.kind === "dynamic-attr" && (attr.name === "className" || attr.name === "htmlFor"),
    )
  ) {
    return true;
  }

  return node.children.some(propBlockHasEffectBinding);
}

function propBlockHasBindPropBinding(node: JsxNodeIr): boolean {
  if (node.kind !== "element") {
    return false;
  }

  if (
    node.attributes.some(
      (attr) =>
        attr.kind === "dynamic-attr" && attr.name !== "className" && attr.name !== "htmlFor",
    )
  ) {
    return true;
  }

  return node.children.some(propBlockHasBindPropBinding);
}

interface PropBlockBinding {
  kind: "text" | "className" | "htmlFor" | "prop" | "event";
  propName?: string | undefined;
  eventName?: string | undefined;
  target: string;
  code: string;
}

function emitPropReactiveDomBlockComponent(
  component: ComponentIr,
  block: PropReactiveDomBlock,
  helperNames: CompatHelperNames,
  functionKeyword: string,
): string {
  const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));
  const createBlock = helperNames.createReactiveDomBlock ?? "_createReactiveDomBlock";
  const effectName = helperNames.effect ?? "_effect";
  const bindEvent = helperNames.bindEvent ?? "_bindEvent";
  const bindProp = helperNames.bindProp ?? "_bindProp";
  const sourcePropsName = block.propAliases === undefined ? block.propsParam : allocator("_props");

  const build: string[] = [];
  const bindings: PropBlockBinding[] = [];
  const rootVar = emitPropBlockNode(
    block.root,
    undefined,
    build,
    bindings,
    allocator,
    block.propsParam,
    block.propAliases,
  );
  const disposeName = allocator("_dispose");
  const eventDisposeNames: string[] = [];
  const propDisposeNames: string[] = [];
  const eventBindLines = bindings
    .filter((binding) => binding.kind === "event")
    .map((binding) => {
      const eventName = allocator("event");
      const handlerName = allocator("_h");
      const eventDisposeName = allocator("_disposeEvent");
      eventDisposeNames.push(eventDisposeName);
      return [
        `const ${eventDisposeName} = ${bindEvent}(${binding.target}, ${JSON.stringify(binding.eventName ?? "")}, (${eventName}) => {`,
        ...emitPropBlockEventHandlerLines(binding.code, handlerName, eventName).map(
          (line) => `  ${line}`,
        ),
        `});`,
      ].join("\n");
    });
  const propBindLines = bindings
    .filter((binding) => binding.kind === "prop")
    .map((binding) => {
      const propDisposeName = allocator("_disposeProp");
      propDisposeNames.push(propDisposeName);
      return [
        `const ${propDisposeName} = ${bindProp}(`,
        `  ${binding.target},`,
        `  ${JSON.stringify(binding.propName ?? "")},`,
        `  () => (${binding.code}),`,
        `);`,
      ].join("\n");
    });

  // Keep text/class/htmlFor bindings grouped by dependency. General DOM
  // attributes delegate to bindProp above so they reuse the shared safety policy.
  const effectBodiesByKey = new Map<string, string[]>();
  for (const binding of bindings) {
    if (binding.kind === "event" || binding.kind === "prop") {
      continue;
    }

    const rawName = allocator("_r");
    const valueName = allocator("_v");
    const property = binding.kind === "text" ? "data" : binding.kind;
    const body = [
      `      const ${rawName} = (${binding.code});`,
      `      const ${valueName} = ${rawName} == null ? "" : String(${rawName});`,
      `      if (${binding.target}.${property} !== ${valueName}) ${binding.target}.${property} = ${valueName};`,
    ].join("\n");
    const key = propBindingDependencyKey(binding.code, block.propsParam);
    const effectBody = effectBodiesByKey.get(key);
    if (effectBody === undefined) {
      effectBodiesByKey.set(key, [body]);
    } else {
      effectBody.push(body);
    }
  }
  const effectDisposeNames =
    effectBodiesByKey.size === 0
      ? []
      : Array.from({ length: effectBodiesByKey.size }, () => allocator("_disposeEffect"));
  const disposeTargets = [...effectDisposeNames, ...eventDisposeNames, ...propDisposeNames];

  const disposeLines: string[] = [
    ...eventBindLines.flatMap((line) => line.split("\n").map((part) => `    ${part}`)),
    ...propBindLines.flatMap((line) => line.split("\n").map((part) => `    ${part}`)),
  ];

  let effectIndex = 0;
  for (const effectBody of effectBodiesByKey.values()) {
    const effectDisposeName = effectDisposeNames[effectIndex]!;
    disposeLines.push(
      `    const ${effectDisposeName} = ${effectName}(() => {`,
      ...effectBody,
      `    });`,
    );
    effectIndex += 1;
  }

  if (disposeTargets.length === 0) {
    disposeLines.push(`    const ${disposeName} = undefined;`);
  } else if (disposeTargets.length === 1) {
    disposeLines.push(`    const ${disposeName} = ${disposeTargets[0]};`);
  } else {
    disposeLines.push(
      `    const ${disposeName} = () => {`,
      ...disposeTargets.map((name) => `      ${name}();`),
      `    };`,
    );
  }

  return [
    `${functionKeyword} ${component.name}(${component.parameters.join(", ")}) {`,
    ...(block.propAliases === undefined
      ? []
      : [`  const ${sourcePropsName} = ${emitPropAliasesObject(block.propAliases)};`]),
    // The closure parameter is the reactive props proxy read by binding
    // expressions. Identifier props already use this name; destructured props
    // are rewritten to read through it.
    `  return ${createBlock}((${block.propsParam}) => {`,
    ...build.map((line) => `    ${line}`),
    ...disposeLines,
    `    return { node: ${rootVar}, dispose: ${disposeName} };`,
    `  }, ${sourcePropsName});`,
    `}`,
    // The component is pure and returns its props verbatim as a static reactive
    // block: mark it so a memo wrapping it can re-render by cell-updating the
    // committed block instead of re-invoking the component (see host-reconciler).
    `${component.name}.__mreactStaticBlock = true;`,
  ].join("\n");
}

function emitPropBlockEventHandlerLines(
  code: string,
  handlerName: string,
  eventName: string,
): string[] {
  const inlineBody = readZeroParameterArrowExpressionBody(code);
  if (inlineBody !== undefined) {
    return [`return (${inlineBody});`];
  }

  return [
    `const ${handlerName} = (${code});`,
    `if (typeof ${handlerName} === "function") return ${handlerName}(${eventName});`,
  ];
}

function readZeroParameterArrowExpressionBody(code: string): string | undefined {
  const match = code.match(/^\s*\(\s*\)\s*=>\s*(?<body>[\s\S]*?)\s*$/);
  const body = match?.groups?.body;
  if (body === undefined || body.startsWith("{")) {
    return undefined;
  }

  return body;
}

function propBindingDependencyKey(code: string, propsParam: string): string {
  const escaped = propsParam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z_$\\d])${escaped}\\.([A-Za-z_$][\\w$]*)`, "g");
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code)) !== null) {
    const name = match[2];
    if (name !== undefined) {
      names.add(name);
    }
  }

  return names.size === 0 ? code : Array.from(names).sort().join(".");
}

function emitPropBlockNode(
  node: JsxNodeIr,
  parentVar: string | undefined,
  build: string[],
  bindings: PropBlockBinding[],
  allocator: (baseName: string) => string,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  const rewriteCode = (code: string): string =>
    propAliases === undefined
      ? code
      : (rewritePropBlockAliasCode(code, propsParam, propAliases) ?? code);

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
    build.push(`const ${name} = document.createTextNode("");`);
    bindings.push({ kind: "text", target: name, code: rewriteCode(node.code) });
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
      } else if (attr.name === "htmlFor") {
        build.push(`${name}.htmlFor = ${JSON.stringify(attr.value)};`);
      } else {
        build.push(
          `${name}.setAttribute(${JSON.stringify(attr.name)}, ${JSON.stringify(attr.value)});`,
        );
      }
    } else if (attr.kind === "dynamic-attr") {
      if (attr.name === "className" || attr.name === "htmlFor") {
        bindings.push({
          kind: attr.name,
          target: name,
          code: rewriteCode(attr.code),
        });
      } else {
        bindings.push({
          kind: "prop",
          propName: attr.name,
          target: name,
          code: rewriteCode(attr.code),
        });
      }
    } else if (attr.kind === "event") {
      bindings.push({
        kind: "event",
        eventName: attr.eventName,
        target: name,
        code: rewriteCode(attr.code),
      });
    }
  }

  for (const child of element.children) {
    emitPropBlockNode(child, name, build, bindings, allocator, propsParam, propAliases);
  }

  if (parentVar !== undefined) {
    build.push(`${parentVar}.appendChild(${name});`);
  }

  return name;
}

function canRewritePropBlockAliasNode(
  node: JsxNodeIr,
  propsParam: string,
  propAliases: readonly PropAliasIr[],
): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    return rewritePropBlockAliasCode(node.code, propsParam, propAliases) !== undefined;
  }

  if (node.kind !== "element") {
    return false;
  }

  for (const attr of node.attributes) {
    if (
      (attr.kind === "dynamic-attr" || attr.kind === "event") &&
      rewritePropBlockAliasCode(attr.code, propsParam, propAliases) === undefined
    ) {
      return false;
    }
  }

  return node.children.every((child) =>
    canRewritePropBlockAliasNode(child, propsParam, propAliases),
  );
}

function emitPropAliasesObject(propAliases: readonly PropAliasIr[]): string {
  return `{ ${propAliases
    .map((alias) =>
      alias.propName === alias.localName
        ? alias.localName
        : `${alias.propName}: ${alias.localName}`,
    )
    .join(", ")} }`;
}

function rewritePropBlockAliasCode(
  code: string,
  propsParam: string,
  propAliases: readonly PropAliasIr[],
): string | undefined {
  const aliasByLocal = new Map(propAliases.map((alias) => [alias.localName, alias.propName]));
  let output = "";
  let index = 0;

  while (index < code.length) {
    const char = code[index] ?? "";

    if (char === '"' || char === "'") {
      const quoted = readQuotedJavaScript(code, index, char);
      output += quoted;
      index += quoted.length;
      continue;
    }

    if (char === "`") {
      const template = readQuotedJavaScript(code, index, char);
      if (propAliases.some((alias) => containsIdentifier(template, alias.localName))) {
        return undefined;
      }
      output += template;
      index += template.length;
      continue;
    }

    if (char === "/" && code[index + 1] === "/") {
      const end = code.indexOf("\n", index + 2);
      const comment = end === -1 ? code.slice(index) : code.slice(index, end);
      output += comment;
      index += comment.length;
      continue;
    }

    if (char === "/" && code[index + 1] === "*") {
      const end = code.indexOf("*/", index + 2);
      if (end === -1) {
        return undefined;
      }
      const comment = code.slice(index, end + 2);
      output += comment;
      index += comment.length;
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < code.length && isIdentifierPart(code[index] ?? "")) {
        index += 1;
      }

      const name = code.slice(start, index);
      const propName = aliasByLocal.get(name);
      if (propName === undefined) {
        output += name;
        continue;
      }

      const previous = previousNonWhitespace(code, start);
      const next = nextNonWhitespace(code, index);
      if (previous === "." || next === ":") {
        output += name;
        continue;
      }

      if ((previous === "{" || previous === ",") && (next === "}" || next === ",")) {
        return undefined;
      }

      output += `${propsParam}.${propName}`;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function readQuotedJavaScript(code: string, start: number, quote: string): string {
  let index = start + 1;
  while (index < code.length) {
    const char = code[index] ?? "";
    if (char === "\\") {
      index += 2;
      continue;
    }
    index += 1;
    if (char === quote) {
      break;
    }
  }
  return code.slice(start, index);
}

function previousNonWhitespace(code: string, start: number): string | undefined {
  for (let index = start - 1; index >= 0; index -= 1) {
    const char = code[index] ?? "";
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return undefined;
}

function nextNonWhitespace(code: string, start: number): string | undefined {
  for (let index = start; index < code.length; index += 1) {
    const char = code[index] ?? "";
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return undefined;
}

function isIdentifierStart(char: string): boolean {
  return /^[A-Za-z_$]$/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /^[A-Za-z_$0-9]$/.test(char);
}

function containsIdentifier(code: string, name: string): boolean {
  return new RegExp(`(^|[^A-Za-z_$\\d])${name}([^A-Za-z_$\\d]|$)`).test(code);
}

function isDirectTextBindingSafeBodyStatement(statement: string): boolean {
  return /^\s*const\s+[A-Za-z_$][\w$]*\s*=\s*(?:"[^"]*"|'[^']*'|\d+(?:\.\d+)?|true|false|null|undefined);\s*$/.test(
    statement,
  );
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function createNameAllocator(reservedNames: readonly string[]): (baseName: string) => string {
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
