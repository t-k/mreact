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
import { getCompatInlineMemo } from "./compat-inline-memo.js";
import { transformJsxToCreateElementWithOxc } from "./oxc-transform.js";
import type { RuntimeImport } from "./types.js";
import { listReadsNestedItemObject } from "./ir-nested-object-read.js";
import { escapeRegExp } from "./string-utils.js";
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
const COMPAT_SOURCE = "@reckona/mreact-compat";
const COMPAT_INTERNAL_SOURCE = "@reckona/mreact-compat/internal";
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
  const componentAnalyses = collectCompatComponentAnalyses(ir, dev, staticPropBlockComponentNames);
  const normalizedModuleStatements = normalizeCompatModuleStatements(
    ir.moduleStatements,
    staticPropBlockComponentNames,
  );
  const componentImportSource = dev ? JSX_DEV_RUNTIME_SOURCE : JSX_RUNTIME_SOURCE;
  const componentSpecifiers = collectComponentImportSpecifiers(ir, dev, componentAnalyses);
  const reactiveDomSpecifiers = collectReactiveDomImportSpecifiers(ir, dev, componentAnalyses);
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
    .map((component) =>
      emitComponent(
        component,
        helperNames,
        dev,
        staticPropBlockComponentNames,
        componentAnalyses.get(component),
      ),
    )
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

interface CompatComponentAnalysis {
  directTextBindings: DirectTextBinding[];
  propBlockFacts?: PropBlockFacts;
  propReactiveDomBlock?: PropReactiveDomBlock;
  reactiveDomBlock?: ReactiveDomBlock;
  rootListReactiveDomBlock?: RootListReactiveDomBlock;
}

function collectCompatComponentAnalyses(
  ir: ModuleIr,
  dev: boolean,
  staticPropBlockComponentNames: ReadonlySet<string>,
): ReadonlyMap<ComponentIr, CompatComponentAnalysis> {
  const analyses = new Map<ComponentIr, CompatComponentAnalysis>();

  for (const component of ir.components) {
    const directTextBindings = collectDirectTextBindings(component);
    const reactiveDomBlock = dev
      ? undefined
      : getReactiveDomBlock(component.root, directTextBindings);
    const propReactiveDomBlock =
      !dev && reactiveDomBlock === undefined
        ? getPropReactiveDomBlock(component, staticPropBlockComponentNames)
        : undefined;
    const rootListReactiveDomBlock =
      !dev && reactiveDomBlock === undefined && propReactiveDomBlock === undefined
        ? getRootListReactiveDomBlock(component, ir, staticPropBlockComponentNames)
        : undefined;
    analyses.set(component, {
      directTextBindings,
      ...(reactiveDomBlock === undefined ? {} : { reactiveDomBlock }),
      ...(propReactiveDomBlock === undefined
        ? {}
        : {
            propReactiveDomBlock,
            propBlockFacts: collectPropBlockFacts(component.root),
          }),
      ...(rootListReactiveDomBlock === undefined
        ? {}
        : {
            rootListReactiveDomBlock,
            propBlockFacts: collectPropBlockFacts(rootListReactiveDomBlock.renderRoot),
          }),
    });
  }

  return analyses;
}

function collectComponentImportSpecifiers(
  ir: ModuleIr,
  dev: boolean,
  componentAnalyses: ReadonlyMap<ComponentIr, CompatComponentAnalysis>,
): string[] {
  const specifiers = new Set<string>();

  for (const component of ir.components) {
    const analysis = componentAnalyses.get(component);
    const inlineMemo = getCompatInlineMemo(component);
    const directTextBindings = analysis?.directTextBindings ?? collectDirectTextBindings(component);
    const reactiveDomBlock = analysis?.reactiveDomBlock;

    if (inlineMemo?.compareHasJsx === true) {
      specifiers.add("createElement");
      specifiers.add("Fragment");
    }

    if (reactiveDomBlock !== undefined) {
      specifiers.add("REACTIVE_STATE_BINDING_META");
      specifiers.add("createReactiveDomBlock");
      continue;
    }

    if (!dev && analysis?.propReactiveDomBlock !== undefined) {
      specifiers.add("createReactiveDomBlock");
      continue;
    }

    if (!dev && analysis?.rootListReactiveDomBlock !== undefined) {
      specifiers.add("REACTIVE_STATE_BINDING_META");
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

function collectReactiveDomImportSpecifiers(
  ir: ModuleIr,
  dev: boolean,
  componentAnalyses: ReadonlyMap<ComponentIr, CompatComponentAnalysis>,
): string[] {
  const specifiers = new Set<string>();

  if (dev) {
    return [];
  }

  for (const component of ir.components) {
    const analysis = componentAnalyses.get(component);
    const reactiveDomBlock = analysis?.reactiveDomBlock;

    if (reactiveDomBlock !== undefined) {
      specifiers.add("bindText");
      specifiers.add("createTemplate");
      continue;
    }

    if (analysis?.propReactiveDomBlock !== undefined) {
      const facts = analysis.propBlockFacts ?? collectPropBlockFacts(component.root);
      if (facts.hasEvent) {
        specifiers.add("bindEvent");
      }
      if (facts.hasBindPropBinding) {
        specifiers.add("bindProp");
      }
      if (facts.hasSpreadBinding) {
        specifiers.add("bindSpreadProps");
      }
      if (facts.hasDynamicInsertion) {
        specifiers.add("insertDynamic");
      }
      if (facts.hasListBinding) {
        specifiers.add("bindList");
      }
      if (facts.hasNestedListRenderValue) {
        specifiers.add("createList");
      }
      if (facts.hasEffectBinding) {
        specifiers.add("effect");
      }
      continue;
    }

    if (analysis?.rootListReactiveDomBlock !== undefined) {
      const facts =
        analysis.propBlockFacts ??
        collectPropBlockFacts(analysis.rootListReactiveDomBlock.renderRoot);
      specifiers.add(
        analysis.rootListReactiveDomBlock.selectedClass === undefined
          ? "bindList"
          : "bindSelectedKeyedSingleNodeList",
      );
      if (facts.hasEvent) {
        specifiers.add("bindEvent");
      }
      if (facts.hasBindPropBinding) {
        specifiers.add("bindProp");
      }
      if (facts.hasSpreadBinding) {
        specifiers.add("bindSpreadProps");
      }
      if (facts.hasDynamicInsertion) {
        specifiers.add("insertDynamic");
      }
      if (facts.hasListBinding) {
        specifiers.add("bindList");
      }
      if (facts.hasNestedListRenderValue) {
        specifiers.add("createList");
      }
      if (facts.hasEffectBinding) {
        specifiers.add("effect");
      }
    }
  }

  return Array.from(specifiers).sort();
}

interface CompatHelperNames {
  Fragment?: string;
  createElement?: string;
  REACTIVE_STATE_BINDING_META?: string;
  REACTIVE_TEXT_BINDING_META?: string;
  bindEvent?: string;
  bindList?: string;
  bindSelectedKeyedSingleNodeList?: string;
  bindText?: string;
  bindProp?: string;
  bindSpreadProps?: string;
  createList?: string;
  effect?: string;
  createReactiveDomBlock?: string;
  createTemplate?: string;
  insertDynamic?: string;
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

interface DirectStateBinding {
  stateName: string;
  tupleName: string;
  stateBindingName: string;
}

interface ReactiveDomBlock {
  element: JsxElementIr;
  binding: DirectTextBinding;
}

interface RootListReactiveDomBlock {
  root: Extract<JsxNodeIr, { kind: "list" }>;
  stateBinding: DirectStateBinding;
  renderComponent: ComponentIr;
  renderComponentBlock: PropReactiveDomBlock;
  renderComponentNode: Extract<JsxNodeIr, { kind: "component" }>;
  renderRoot: JsxElementIr;
  selectedClass?: RootListSelectedClass;
}

interface RootListSelectedClass {
  className: string;
  itemPropName: string;
  selectedPropName: string;
  statePath: string;
}

function allocateHelperNames(
  ir: ModuleIr,
  specifiers: readonly string[],
  reactiveDomSpecifiers: readonly string[] = [],
): CompatHelperNames {
  const allocator = createNameAllocator(collectReservedHelperNames(ir));
  const helperNames: CompatHelperNames = {};

  for (const specifier of [...specifiers, ...reactiveDomSpecifiers]) {
    if (specifier === "bindSelectedKeyedSingleNodeList") {
      helperNames.bindSelectedKeyedSingleNodeList = allocator("_bindSelectedKeyedSingleNodeList");
      continue;
    }

    if (specifier === "bindEvent") {
      helperNames.bindEvent = allocator("_bindEvent");
      continue;
    }

    if (specifier === "bindList") {
      helperNames.bindList = allocator("_bindList");
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

    if (specifier === "bindSpreadProps") {
      helperNames.bindSpreadProps = allocator("_bindSpreadProps");
      continue;
    }

    if (specifier === "createList") {
      helperNames.createList = allocator("_createList");
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

    if (specifier === "createElement") {
      helperNames.createElement = allocator("_createElement");
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

    if (specifier === "insertDynamic") {
      helperNames.insertDynamic = allocator("_insertDynamic");
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
      ...(getCompatInlineMemo(component)?.compareReservedNames ?? []),
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

  const candidatesByName = new Map<string, StaticPropBlockComponentCandidate[]>();
  for (const component of ir.components) {
    const candidate = readStaticPropBlockComponentCandidate(component);
    if (candidate === undefined) {
      continue;
    }

    const sameNameCandidates = candidatesByName.get(candidate.name);
    if (sameNameCandidates === undefined) {
      candidatesByName.set(candidate.name, [candidate]);
    } else {
      sameNameCandidates.push(candidate);
    }
  }

  const dependentsByName = new Map<string, StaticPropBlockComponentPendingCandidate[]>();
  const readyNames: string[] = [];

  for (const candidates of candidatesByName.values()) {
    for (const candidate of candidates) {
      if (candidate.dependencies.size === 0) {
        readyNames.push(candidate.name);
        continue;
      }

      const pendingCandidate = {
        name: candidate.name,
        remainingDependencies: candidate.dependencies.size,
      };

      for (const dependency of candidate.dependencies) {
        const dependents = dependentsByName.get(dependency);
        if (dependents === undefined) {
          dependentsByName.set(dependency, [pendingCandidate]);
        } else {
          dependents.push(pendingCandidate);
        }
      }
    }
  }

  for (let index = 0; index < readyNames.length; index += 1) {
    const name = readyNames[index];
    if (name === undefined || names.has(name)) {
      continue;
    }

    names.add(name);
    const dependents = dependentsByName.get(name);
    if (dependents === undefined) {
      continue;
    }

    for (const dependent of dependents) {
      dependent.remainingDependencies -= 1;
      if (dependent.remainingDependencies === 0) {
        readyNames.push(dependent.name);
      }
    }
  }

  return names;
}

interface StaticPropBlockComponentCandidate {
  name: string;
  dependencies: ReadonlySet<string>;
}

interface StaticPropBlockComponentPendingCandidate {
  name: string;
  remainingDependencies: number;
}

function readStaticPropBlockComponentCandidate(
  component: ComponentIr,
): StaticPropBlockComponentCandidate | undefined {
  if (component.parameters.length !== 1) {
    return undefined;
  }

  const propsParam = component.parameters[0];
  const propAliases = component.parameterPropAliases;

  if (
    propsParam === undefined ||
    (!PROP_BLOCK_IDENTIFIER.test(propsParam) && propAliases === undefined) ||
    component.bodyStatements.length > 0 ||
    component.root.kind !== "element" ||
    component.root.keyCode !== undefined ||
    !collectPropBlockFacts(component.root).hasDynamicPart ||
    (propAliases !== undefined &&
      !canRewritePropBlockAliasNode(component.root, "props", propAliases))
  ) {
    return undefined;
  }

  const hostOnly = analyzeStaticPropBlockHostOnlyNode(component.root);
  return hostOnly.supported
    ? { name: component.name, dependencies: hostOnly.dependencies }
    : undefined;
}

interface StaticPropBlockHostOnlyAnalysis {
  supported: boolean;
  dependencies: Set<string>;
}

function analyzeStaticPropBlockHostOnlyNode(node: JsxNodeIr): StaticPropBlockHostOnlyAnalysis {
  const combine = (children: readonly JsxNodeIr[]): StaticPropBlockHostOnlyAnalysis => {
    const dependencies = new Set<string>();
    for (const child of children) {
      const analysis = analyzeStaticPropBlockHostOnlyNode(child);
      if (!analysis.supported) {
        return { supported: false, dependencies };
      }
      for (const dependency of analysis.dependencies) {
        dependencies.add(dependency);
      }
    }
    return { supported: true, dependencies };
  };

  if (node.kind === "text" || node.kind === "expr") {
    return { supported: true, dependencies: new Set() };
  }

  if (node.kind === "conditional") {
    return combine([...node.whenTrue, ...node.whenFalse]);
  }

  if (node.kind === "list" || node.kind === "fragment") {
    return combine(node.children);
  }

  if (node.kind === "component") {
    if (node.props.some((prop) => prop.kind === "render-prop")) {
      return { supported: false, dependencies: new Set() };
    }
    const analysis = combine(node.children);
    analysis.dependencies.add(node.name);
    return analysis;
  }

  if (node.kind !== "element") {
    return { supported: false, dependencies: new Set() };
  }

  for (const attr of node.attributes) {
    if (attr.kind === "spread-attr") {
      continue;
    }

    if (
      attr.kind === "dynamic-attr" &&
      isUnsupportedPropBlockDynamicAttr(node.tagName, attr.name)
    ) {
      return { supported: false, dependencies: new Set() };
    }
  }

  return combine(node.children);
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

const escapeRegex = escapeRegExp;

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
        specifier as
          | "bindEvent"
          | "bindList"
          | "bindSelectedKeyedSingleNodeList"
          | "bindText"
          | "bindProp"
          | "bindSpreadProps"
          | "createList"
          | "effect"
          | "createTemplate"
          | "insertDynamic"
      ] ?? `_${specifier}`;
    addImportSpecifier(
      groups,
      specifier === "bindSelectedKeyedSingleNodeList"
        ? COMPAT_INTERNAL_SOURCE
        : REACTIVE_DOM_SOURCE,
      specifier,
      localName,
    );
  }

  for (const specifier of componentSpecifiers) {
    if (specifier === "createElement") {
      const localName = helperNames.createElement ?? "_createElement";
      addImportSpecifier(groups, COMPAT_SOURCE, "createElement", localName);
      continue;
    }

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
  staticPropBlockComponentNames: ReadonlySet<string>,
  analysis: CompatComponentAnalysis | undefined,
): string {
  const inlineMemo = getCompatInlineMemo(component);
  const functionName =
    inlineMemo?.functionName ??
    (inlineMemo === undefined
      ? component.name
      : createNameAllocator([component.name, ...component.bindingNames])(
          `_${component.name}MemoInner`,
        ));
  const directTextBindings = collectDirectTextBindings(component, helperNames);
  const reactiveDomBlock = dev
    ? undefined
    : getReactiveDomBlock(component.root, directTextBindings);
  const propReactiveDomBlock =
    !dev && reactiveDomBlock === undefined
      ? (analysis?.propReactiveDomBlock ??
        getPropReactiveDomBlock(component, staticPropBlockComponentNames))
      : undefined;
  const rootListReactiveDomBlock =
    !dev && reactiveDomBlock === undefined && propReactiveDomBlock === undefined
      ? analysis?.rootListReactiveDomBlock
      : undefined;
  const body = component.bodyStatements.map((statement) => {
    const directTextStatement = rewriteDirectTextBindingStatement(
      statement,
      directTextBindings,
      helperNames,
      reactiveDomBlock !== undefined,
    );
    const rootListStatement =
      rootListReactiveDomBlock === undefined
        ? directTextStatement
        : rewriteDirectStateBindingStatement(
            directTextStatement,
            rootListReactiveDomBlock.stateBinding,
            helperNames,
          );
    return `  ${rootListStatement}`;
  });
  const parameters = component.parameters.join(", ");
  const functionKeyword =
    inlineMemo === undefined
      ? `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}${
          component.async === true ? "async " : ""
        }function`
      : `${component.async === true ? "async " : ""}function`;
  const finalize = (code: string): string =>
    inlineMemo === undefined
      ? code
      : emitInlineMemoComponent(component, functionName, code, helperNames);

  if (propReactiveDomBlock !== undefined) {
    return finalize(
      emitPropReactiveDomBlockComponent(
        component,
        propReactiveDomBlock,
        helperNames,
        functionKeyword,
        functionName,
      ),
    );
  }

  if (reactiveDomBlock !== undefined) {
    const allocator = createNameAllocator(
      collectReservedComponentLocalNames(component, helperNames),
    );
    const templateName = allocator(`_tmpl_${component.name}`);
    const templateHtml = JSON.stringify(renderStaticReactiveDomBlockHtml(reactiveDomBlock.element));

    return finalize(
      [
        `const ${templateName} = ${helperNames.createTemplate ?? "_createTemplate"}(${templateHtml});`,
        `${functionKeyword} ${functionName}(${parameters}) {`,
        ...body,
        emitReactiveDomBlockReturn(reactiveDomBlock, helperNames, templateName, allocator),
        `}`,
      ].join("\n"),
    );
  }

  if (rootListReactiveDomBlock !== undefined) {
    return finalize(
      emitRootListReactiveDomBlockComponent(
        component,
        rootListReactiveDomBlock,
        body,
        helperNames,
        functionKeyword,
        parameters,
        functionName,
      ),
    );
  }

  return finalize(
    [
      `${functionKeyword} ${functionName}(${parameters}) {`,
      ...body,
      `  return ${emitJsxNode(component.root, helperNames, dev, directTextBindings)};`,
      `}`,
    ].join("\n"),
  );
}

function emitInlineMemoComponent(
  component: ComponentIr,
  functionName: string,
  componentCode: string,
  helperNames: CompatHelperNames,
): string {
  const inlineMemo = getCompatInlineMemo(component);
  if (inlineMemo === undefined) {
    return componentCode;
  }

  const exportPrefix = component.exported === false ? "" : "export ";
  const compareCode =
    inlineMemo.compareCode === undefined
      ? undefined
      : inlineMemo.compareHasJsx === true
        ? transformJsxToCreateElementWithOxc(inlineMemo.compareCode, {
            pragma: helperNames.createElement ?? "_createElement",
            pragmaFrag: helperNames.Fragment ?? "_Fragment",
          })
            .trim()
            .replace(/;\s*$/, "")
        : inlineMemo.compareCode;
  const compareArgument =
    compareCode === undefined
      ? ""
      : inlineMemo.compareHasJsx === true
        ? `, (${compareCode})`
        : `, ${compareCode}`;
  const indentedComponentCode = componentCode
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  return [
    `${exportPrefix}${inlineMemo.bindingKind} ${component.name} = memo((() => {`,
    indentedComponentCode,
    `  return ${functionName};`,
    `})()${compareArgument});`,
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

function rewriteDirectStateBindingStatement(
  statement: string,
  binding: DirectStateBinding,
  helperNames: CompatHelperNames,
): string {
  const match = statement.match(
    /^\s*const\s+\[\s*(?<stateName>[A-Za-z_$][\w$]*)\s*,\s*(?<setterName>[A-Za-z_$][\w$]*)\s*\]\s*=\s*(?<initializer>use(?:State|Reducer)\s*\([\s\S]+\));\s*$/,
  );

  if (match?.groups?.stateName !== binding.stateName) {
    return statement;
  }

  const metadataName = helperNames.REACTIVE_STATE_BINDING_META ?? "_REACTIVE_STATE_BINDING_META";
  return [
    `const ${binding.tupleName} = ${match.groups.initializer};`,
    `  const [${binding.stateName}, ${match.groups.setterName}] = ${binding.tupleName};`,
    `  const ${binding.stateBindingName} = ${binding.tupleName}[${metadataName}];`,
  ].join("\n");
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
function getPropReactiveDomBlock(
  component: ComponentIr,
  staticPropBlockComponentNames: ReadonlySet<string> = new Set(),
): PropReactiveDomBlock | undefined {
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

  if (
    !isHostOnlyPropBlockNode(root, staticPropBlockComponentNames) ||
    !collectPropBlockFacts(root).hasDynamicPart
  ) {
    return undefined;
  }

  if (propAliases !== undefined && !canRewritePropBlockAliasNode(root, "props", propAliases)) {
    return undefined;
  }

  return propAliases === undefined
    ? { root, propsParam }
    : { root, propsParam: "props", propAliases };
}

function getRootListReactiveDomBlock(
  component: ComponentIr,
  ir: ModuleIr,
  staticPropBlockComponentNames: ReadonlySet<string>,
): RootListReactiveDomBlock | undefined {
  const root =
    component.root.kind === "list"
      ? component.root
      : readCompatCreateElementRootList(component.root);

  if (root === undefined || root.keyCode === undefined || root.children.length !== 1) {
    return undefined;
  }

  const stateBinding = collectDirectStateBindings(component).find((binding) =>
    rootListUsesStateBinding(root, binding.stateName),
  );

  if (stateBinding === undefined || !rootListBodyStatementsAreSafe(component, stateBinding)) {
    return undefined;
  }

  const renderComponentNode =
    root.children[0]?.kind === "component"
      ? root.children[0]
      : readCompatRuntimeComponentExpression(root.children[0]);
  if (
    renderComponentNode === undefined ||
    renderComponentNode.children.length > 0 ||
    renderComponentNode.props.some(
      (prop) => prop.kind === "render-prop" || prop.kind === "spread-prop",
    )
  ) {
    return undefined;
  }

  const memoAliases = collectCompatMemoAliases(ir.moduleStatements);
  const renderComponentName = memoAliases.get(renderComponentNode.name) ?? renderComponentNode.name;
  const renderComponent = ir.components.find((candidate) => candidate.name === renderComponentName);

  if (renderComponent === undefined) {
    return undefined;
  }

  const renderComponentBlock = getPropReactiveDomBlock(
    renderComponent,
    staticPropBlockComponentNames,
  );

  if (renderComponentBlock === undefined) {
    return undefined;
  }

  if (
    [root.itemName, root.indexName, root.arrayName].some(
      (name) => name !== undefined && name === renderComponentBlock.propsParam,
    )
  ) {
    return undefined;
  }

  return {
    root,
    stateBinding,
    renderComponent,
    renderComponentBlock,
    renderComponentNode,
    renderRoot: renderComponentBlock.root,
    ...collectRootListSelectedClass(root, renderComponentNode, renderComponentBlock, stateBinding),
  };
}

function collectRootListSelectedClass(
  root: Extract<JsxNodeIr, { kind: "list" }>,
  renderComponentNode: Extract<JsxNodeIr, { kind: "component" }>,
  renderComponentBlock: PropReactiveDomBlock,
  stateBinding: DirectStateBinding,
): { selectedClass: RootListSelectedClass } | undefined {
  const itemName = root.itemName;
  const keyCode = stripOuterParentheses(root.keyCode?.trim() ?? "");

  if (itemName === undefined || keyCode === "" || (root.bodyStatements?.length ?? 0) > 0) {
    return undefined;
  }
  if (renderComponentBlock.root.attributes.some((attribute) => attribute.kind === "spread-attr")) {
    return undefined;
  }

  const itemProp = renderComponentNode.props.find(
    (prop) => prop.kind === "prop" && stripOuterParentheses(prop.code.trim()) === itemName,
  );
  const selectedProp = renderComponentNode.props.find((prop) => {
    if (prop.kind !== "prop") {
      return false;
    }
    const equality = splitStrictEquality(stripOuterParentheses(prop.code.trim()));
    return equality?.some((side) => stripOuterParentheses(side) === keyCode) === true;
  });

  if (itemProp?.kind !== "prop" || selectedProp?.kind !== "prop") {
    return undefined;
  }

  const listParameterNames = [itemName, root.indexName, root.arrayName].filter(
    (name): name is string => name !== undefined,
  );
  if (
    renderComponentNode.props.some((prop) => {
      if (prop === itemProp || prop === selectedProp) {
        return false;
      }
      return (
        prop.kind !== "prop" ||
        listParameterNames.some((name) => containsIdentifier(prop.code, name))
      );
    })
  ) {
    return undefined;
  }

  const equality = splitStrictEquality(stripOuterParentheses(selectedProp.code.trim()));
  if (equality === undefined) {
    return undefined;
  }
  const [left, right] = equality;
  const statePath =
    stripOuterParentheses(right) === keyCode
      ? readStateProjection(left, stateBinding.stateName)
      : stripOuterParentheses(left) === keyCode
        ? readStateProjection(right, stateBinding.stateName)
        : undefined;

  if (statePath === undefined) {
    return undefined;
  }

  const propsReference = `${renderComponentBlock.propsParam}.${selectedProp.name}`;
  const rootJson = JSON.stringify(renderComponentBlock.root);
  if (rootJson.split(propsReference).length !== 2) {
    return undefined;
  }

  const classAttribute = renderComponentBlock.root.attributes.find(
    (attribute) => attribute.kind === "dynamic-attr" && attribute.name === "className",
  );
  if (classAttribute?.kind !== "dynamic-attr") {
    return undefined;
  }

  const classMatch = stripOuterParentheses(classAttribute.code.trim()).match(
    new RegExp(
      `^${escapeRegex(propsReference)}\\s*\\?\\s*(?<className>"(?:\\\\.|[^"\\\\])+")\\s*:\\s*""$`,
      "u",
    ),
  );
  const classNameLiteral = classMatch?.groups?.className;
  if (classNameLiteral === undefined) {
    return undefined;
  }
  const className = JSON.parse(classNameLiteral) as unknown;
  if (typeof className !== "string" || !/^[A-Za-z0-9_-]+$/u.test(className)) {
    return undefined;
  }

  return {
    selectedClass: {
      className,
      itemPropName: itemProp.name,
      selectedPropName: selectedProp.name,
      statePath,
    },
  };
}

function splitStrictEquality(code: string): [string, string] | undefined {
  const match = code.match(/^(?<left>[\s\S]+?)\s*===\s*(?<right>[\s\S]+)$/u);
  const left = match?.groups?.left?.trim();
  const right = match?.groups?.right?.trim();
  return left === undefined || right === undefined ? undefined : [left, right];
}

function readStateProjection(code: string, stateName: string): string | undefined {
  const match = stripOuterParentheses(code.trim()).match(
    new RegExp(`^${escapeRegex(stateName)}(?<path>(?:\\.[A-Za-z_$][\\w$]*)+)$`, "u"),
  );
  return match?.groups?.path;
}

function readCompatRuntimeComponentExpression(
  node: JsxNodeIr | undefined,
): Extract<JsxNodeIr, { kind: "component" }> | undefined {
  if (node?.kind !== "expr") {
    return undefined;
  }

  const code = stripOuterParentheses(node.code.trim()).replace(/^\/\*[\s\S]*?\*\/\s*/, "");
  const match = code.match(
    /^[A-Za-z_$][\w$]*\(\s*(?<componentName>[A-Za-z_$][\w$]*)\s*,\s*\{(?<props>[\s\S]*)\}(?:\s*,\s*(?<keyCode>[\s\S]+))?\s*\)$/,
  );
  const groups = match?.groups;

  if (groups?.componentName === undefined || groups.props === undefined) {
    return undefined;
  }

  const props = readCompatCreateElementObjectProps(groups.props);

  return {
    kind: "component",
    name: groups.componentName,
    ...(groups.keyCode === undefined ? {} : { keyCode: groups.keyCode.trim() }),
    props: props.map((prop) => ({ kind: "prop" as const, name: prop.name, code: prop.code })),
    children: [],
  };
}

function readCompatCreateElementRootList(
  node: JsxNodeIr,
): Extract<JsxNodeIr, { kind: "list" }> | undefined {
  if (node.kind !== "expr") {
    return undefined;
  }

  const code = stripOuterParentheses(node.code.trim());
  const match = code.match(
    /^(?<items>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.map\(\s*(?:\(\s*)?(?<itemName>[A-Za-z_$][\w$]*)(?:\s*\))?\s*=>\s*(?:\/\*[\s\S]*?\*\/\s*)?[A-Za-z_$][\w$]*\(\s*(?<componentName>[A-Za-z_$][\w$]*)\s*,\s*\{(?<props>[\s\S]*)\}(?:\s*,\s*(?<runtimeKeyCode>[\s\S]+))?\s*\)\s*\)$/,
  );

  const groups = match?.groups;

  if (
    groups?.items === undefined ||
    groups.itemName === undefined ||
    groups.componentName === undefined ||
    groups.props === undefined
  ) {
    return undefined;
  }

  const props = readCompatCreateElementObjectProps(groups.props);
  const key = props.find((prop) => prop.name === "key");
  const keyCode = groups.runtimeKeyCode?.trim() ?? key?.code;

  if (keyCode === undefined) {
    return undefined;
  }

  return {
    kind: "list",
    itemsCode: groups.items,
    itemName: groups.itemName,
    keyCode,
    children: [
      {
        kind: "component",
        name: groups.componentName,
        props: props
          .filter((prop) => prop.name !== "key")
          .map((prop) => ({ kind: "prop" as const, name: prop.name, code: prop.code })),
        children: [],
      },
    ],
  };
}

function readCompatCreateElementObjectProps(propsCode: string): { name: string; code: string }[] {
  return splitTopLevelCommaEntries(propsCode)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const colonIndex = findTopLevelColon(entry);

      if (colonIndex < 0) {
        return PROP_BLOCK_IDENTIFIER.test(entry) ? [{ name: entry, code: entry }] : [];
      }

      const rawName = entry.slice(0, colonIndex).trim();
      const name = rawName.replace(/^["']|["']$/g, "");
      const code = entry.slice(colonIndex + 1).trim();
      return PROP_BLOCK_IDENTIFIER.test(name) && code.length > 0 ? [{ name, code }] : [];
    });
}

function splitTopLevelCommaEntries(code: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let depth = 0;
  let index = 0;

  while (index < code.length) {
    const char = code[index] ?? "";

    if (char === '"' || char === "'" || char === "`") {
      const quoted = readQuotedJavaScript(code, index, char);
      index += quoted.length;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      entries.push(code.slice(start, index));
      start = index + 1;
    }

    index += 1;
  }

  entries.push(code.slice(start));
  return entries;
}

function findTopLevelColon(code: string): number {
  let depth = 0;
  let index = 0;

  while (index < code.length) {
    const char = code[index] ?? "";

    if (char === '"' || char === "'" || char === "`") {
      const quoted = readQuotedJavaScript(code, index, char);
      index += quoted.length;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === ":" && depth === 0) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function stripOuterParentheses(code: string): string {
  let current = code;

  while (current.startsWith("(") && current.endsWith(")")) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

function collectDirectStateBindings(
  component: ComponentIr,
  helperNames?: CompatHelperNames,
): DirectStateBinding[] {
  const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));
  const bindings: DirectStateBinding[] = [];

  for (const statement of component.bodyStatements) {
    const match = statement.match(
      /^\s*const\s+\[\s*(?<stateName>[A-Za-z_$][\w$]*)\s*,\s*[A-Za-z_$][\w$]*\s*\]\s*=\s*use(?:State|Reducer)\s*\([\s\S]+\);\s*$/,
    );
    const stateName = match?.groups?.stateName;

    if (stateName === undefined) {
      continue;
    }

    bindings.push({
      stateName,
      tupleName: allocator(`_${stateName}StateTuple`),
      stateBindingName: allocator(`_${stateName}StateBinding`),
    });
  }

  return bindings;
}

function rootListUsesStateBinding(
  root: Extract<JsxNodeIr, { kind: "list" }>,
  stateName: string,
): boolean {
  if (containsIdentifier(root.itemsCode, stateName)) {
    return true;
  }

  if (root.keyCode !== undefined && containsIdentifier(root.keyCode, stateName)) {
    return true;
  }

  return root.children.some((child) => nodeContainsIdentifier(child, stateName));
}

function rootListBodyStatementsAreSafe(
  component: ComponentIr,
  binding: DirectStateBinding,
): boolean {
  return component.bodyStatements.every(
    (statement) =>
      isDirectStateBindingDeclaration(statement, binding.stateName) ||
      !containsIdentifier(statement, binding.stateName),
  );
}

function isDirectStateBindingDeclaration(statement: string, stateName: string): boolean {
  return new RegExp(
    `^\\s*const\\s+\\[\\s*${stateName}\\s*,\\s*[A-Za-z_$][\\w$]*\\s*\\]\\s*=\\s*use(?:State|Reducer)\\s*\\([\\s\\S]+\\);\\s*$`,
  ).test(statement);
}

function collectCompatMemoAliases(statements: readonly string[]): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();

  for (const statement of statements) {
    const match = statement.match(
      /^\s*(?:export\s+)?(?:const|let|var)\s+(?<memoName>[A-Za-z_$][\w$]*)\s*=\s*memo\s*\(\s*(?<componentName>[A-Za-z_$][\w$]*)\s*,[\s\S]*\)\s*;?\s*$/,
    );
    const memoName = match?.groups?.memoName;
    const componentName = match?.groups?.componentName;

    if (memoName !== undefined && componentName !== undefined) {
      aliases.set(memoName, componentName);
    }
  }

  return aliases;
}

function nodeContainsIdentifier(node: JsxNodeIr, name: string): boolean {
  let found = false;

  visit(node, (current) => {
    if (found) {
      return;
    }

    if (current.kind === "expr") {
      found = containsIdentifier(current.code, name);
      return;
    }

    if (current.kind === "conditional") {
      found = containsIdentifier(current.conditionCode, name);
      return;
    }

    if (current.kind === "list") {
      found =
        containsIdentifier(current.itemsCode, name) ||
        (current.keyCode !== undefined && containsIdentifier(current.keyCode, name)) ||
        (current.bodyStatements ?? []).some((statement) => containsIdentifier(statement, name));
      return;
    }

    if (current.kind === "component") {
      found =
        (current.keyCode !== undefined && containsIdentifier(current.keyCode, name)) ||
        current.props.some(
          (prop) => prop.kind !== "render-prop" && containsIdentifier(prop.code, name),
        );
      return;
    }

    if (current.kind === "element") {
      found =
        (current.keyCode !== undefined && containsIdentifier(current.keyCode, name)) ||
        current.attributes.some(
          (attr) => attr.kind !== "static-attr" && containsIdentifier(attr.code, name),
        );
    }
  });

  return found;
}

// Conventional node-valued slot props (mirrors oxc-render-values.ts): a text
// expression referencing one of these may hold React nodes, not primitive text,
// so it is inserted through insertDynamic instead of being bound as text.
const PROP_BLOCK_NODE_VALUED = /\b(children|fallback|header|sidebar|element)\b/;
const PROP_BLOCK_UNSUPPORTED_DYNAMIC_ATTRS = new Set([
  "dangerouslySetInnerHTML",
  "ref",
  "suppressHydrationWarning",
]);
const PROP_BLOCK_FORM_VALUE_TAGS = new Set(["input", "select", "textarea"]);
const PROP_BLOCK_FORM_VALUE_ATTRS = new Set(["checked", "defaultChecked", "defaultValue", "value"]);

function isHostOnlyPropBlockNode(
  node: JsxNodeIr,
  staticPropBlockComponentNames: ReadonlySet<string>,
): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    return true;
  }

  if (node.kind === "conditional") {
    return (
      node.whenTrue.every((child) =>
        isHostOnlyPropBlockNode(child, staticPropBlockComponentNames),
      ) &&
      node.whenFalse.every((child) => isHostOnlyPropBlockNode(child, staticPropBlockComponentNames))
    );
  }

  if (node.kind === "list") {
    return node.children.every((child) =>
      isHostOnlyPropBlockNode(child, staticPropBlockComponentNames),
    );
  }

  if (node.kind === "fragment") {
    return node.children.every((child) =>
      isHostOnlyPropBlockNode(child, staticPropBlockComponentNames),
    );
  }

  if (node.kind === "component") {
    return (
      staticPropBlockComponentNames.has(node.name) &&
      node.props.every((prop) => prop.kind !== "render-prop") &&
      node.children.every((child) => isHostOnlyPropBlockNode(child, staticPropBlockComponentNames))
    );
  }

  if (node.kind !== "element") {
    return false;
  }

  for (const attr of node.attributes) {
    if (attr.kind === "spread-attr") {
      continue;
    }

    if (
      attr.kind === "dynamic-attr" &&
      isUnsupportedPropBlockDynamicAttr(node.tagName, attr.name)
    ) {
      return false;
    }
  }

  return node.children.every((child) =>
    isHostOnlyPropBlockNode(child, staticPropBlockComponentNames),
  );
}

function isUnsupportedPropBlockDynamicAttr(tagName: string, attrName: string): boolean {
  if (PROP_BLOCK_UNSUPPORTED_DYNAMIC_ATTRS.has(attrName)) {
    return true;
  }

  return PROP_BLOCK_FORM_VALUE_TAGS.has(tagName) && PROP_BLOCK_FORM_VALUE_ATTRS.has(attrName);
}

interface PropBlockFacts {
  hasBindPropBinding: boolean;
  hasDynamicInsertion: boolean;
  hasDynamicPart: boolean;
  hasEffectBinding: boolean;
  hasEvent: boolean;
  hasListBinding: boolean;
  hasNestedListRenderValue: boolean;
  hasSpreadBinding: boolean;
  hasBranchListRenderValue: boolean;
}

function collectPropBlockFacts(node: JsxNodeIr): PropBlockFacts {
  const empty = (): PropBlockFacts => ({
    hasBindPropBinding: false,
    hasDynamicInsertion: false,
    hasDynamicPart: false,
    hasEffectBinding: false,
    hasEvent: false,
    hasListBinding: false,
    hasNestedListRenderValue: false,
    hasSpreadBinding: false,
    hasBranchListRenderValue: false,
  });

  const merge = (children: readonly PropBlockFacts[]): PropBlockFacts => {
    const facts = empty();
    for (const child of children) {
      facts.hasBindPropBinding ||= child.hasBindPropBinding;
      facts.hasDynamicInsertion ||= child.hasDynamicInsertion;
      facts.hasDynamicPart ||= child.hasDynamicPart;
      facts.hasEffectBinding ||= child.hasEffectBinding;
      facts.hasEvent ||= child.hasEvent;
      facts.hasListBinding ||= child.hasListBinding;
      facts.hasNestedListRenderValue ||= child.hasNestedListRenderValue;
      facts.hasSpreadBinding ||= child.hasSpreadBinding;
      facts.hasBranchListRenderValue ||= child.hasBranchListRenderValue;
    }
    return facts;
  };

  const childFacts = (children: readonly JsxNodeIr[]) => children.map(collectPropBlockFacts);

  switch (node.kind) {
    case "expr": {
      const nodeValued = isPropBlockNodeValuedExpression(node.code);
      return {
        ...empty(),
        hasDynamicInsertion: nodeValued,
        hasDynamicPart: true,
        hasEffectBinding: !nodeValued,
      };
    }
    case "conditional": {
      const branchFacts = [...childFacts(node.whenTrue), ...childFacts(node.whenFalse)];
      const facts = merge(branchFacts);
      facts.hasDynamicInsertion = true;
      facts.hasDynamicPart = true;
      facts.hasNestedListRenderValue = branchFacts.some((child) => child.hasBranchListRenderValue);
      facts.hasBranchListRenderValue = facts.hasNestedListRenderValue;
      return facts;
    }
    case "list": {
      const facts = merge(childFacts(node.children));
      facts.hasDynamicInsertion = true;
      facts.hasDynamicPart = true;
      facts.hasListBinding = true;
      facts.hasBranchListRenderValue = true;
      return facts;
    }
    case "component": {
      const children = childFacts(node.children);
      const facts = merge(children);
      facts.hasDynamicInsertion = true;
      facts.hasDynamicPart = true;
      facts.hasNestedListRenderValue = children.some((child) => child.hasBranchListRenderValue);
      facts.hasBranchListRenderValue = facts.hasNestedListRenderValue;
      return facts;
    }
    case "fragment": {
      const facts = merge(childFacts(node.children));
      facts.hasBranchListRenderValue = facts.hasNestedListRenderValue;
      return facts;
    }
    case "element": {
      const facts = merge(childFacts(node.children));
      const hasClassOrForBinding = node.attributes.some(
        (attr) =>
          attr.kind === "dynamic-attr" && (attr.name === "className" || attr.name === "htmlFor"),
      );
      const hasPropBinding = node.attributes.some(
        (attr) =>
          attr.kind === "dynamic-attr" && attr.name !== "className" && attr.name !== "htmlFor",
      );
      facts.hasBindPropBinding ||= hasPropBinding;
      facts.hasDynamicPart ||= node.attributes.some(
        (attr) =>
          attr.kind === "dynamic-attr" || attr.kind === "event" || attr.kind === "spread-attr",
      );
      facts.hasEffectBinding ||= hasClassOrForBinding;
      facts.hasEvent ||= node.attributes.some((attr) => attr.kind === "event");
      facts.hasSpreadBinding ||= node.attributes.some((attr) => attr.kind === "spread-attr");
      facts.hasBranchListRenderValue = facts.hasNestedListRenderValue;
      return facts;
    }
    case "async-boundary":
    case "text":
      return empty();
  }
}

function isPropBlockNodeValuedExpression(code: string): boolean {
  return PROP_BLOCK_NODE_VALUED.test(code);
}

type PropBlockValueBinding = {
  kind: "text" | "className" | "htmlFor" | "prop" | "spread" | "dynamic";
  propName?: string | undefined;
  target: string;
  marker?: string | undefined;
  code: string;
};

type PropBlockBinding =
  | PropBlockValueBinding
  | {
      kind: "event";
      eventName: string;
      target: string;
      code: string;
    }
  | {
      kind: "list";
      target: string;
      marker: string;
      node: Extract<JsxNodeIr, { kind: "list" }>;
    };

interface PropBlockEmitHelpers {
  bindEvent: string;
  bindList: string;
  bindProp: string;
  bindSpreadProps: string;
  createList: string;
  effectName: string;
  insertDynamic: string;
}

function emitRootListReactiveDomBlockComponent(
  component: ComponentIr,
  block: RootListReactiveDomBlock,
  body: readonly string[],
  helperNames: CompatHelperNames,
  functionKeyword: string,
  parameters: string,
  functionName: string,
): string {
  const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));
  const createBlock = helperNames.createReactiveDomBlock ?? "_createReactiveDomBlock";
  const markerName = allocator("_marker");
  const disposeListName = allocator("_disposeList");
  const setupListName = allocator("_setupList");
  const disposeName = allocator("_dispose");
  const listParameters = emitPropBlockListParameters(block.root);
  const contextName = block.selectedClass === undefined ? undefined : allocator("_rowContext");
  const itemsCode = rewriteStateBindingCode(
    block.root.itemsCode,
    block.stateBinding.stateName,
    block.stateBinding.stateBindingName,
  );
  const listOptions = emitRootListOptions(block, listParameters);
  const propBlockHelpers: PropBlockEmitHelpers = {
    bindEvent: helperNames.bindEvent ?? "_bindEvent",
    bindList: helperNames.bindList ?? "_bindList",
    bindProp: helperNames.bindProp ?? "_bindProp",
    bindSpreadProps: helperNames.bindSpreadProps ?? "_bindSpreadProps",
    createList: helperNames.createList ?? "_createList",
    effectName: helperNames.effect ?? "_effect",
    insertDynamic: helperNames.insertDynamic ?? "_insertDynamic",
  };
  const renderer = emitRootListRenderer(
    block,
    contextName ?? listParameters,
    allocator,
    propBlockHelpers,
    contextName,
  );
  const bindList =
    block.selectedClass === undefined
      ? propBlockHelpers.bindList
      : (helperNames.bindSelectedKeyedSingleNodeList ?? "_bindSelectedKeyedSingleNodeList");

  return [
    `${functionKeyword} ${functionName}(${parameters}) {`,
    ...body,
    `  return ${createBlock}(() => {`,
    `    const ${markerName} = document.createTextNode("");`,
    `    let ${disposeListName};`,
    `    const ${setupListName} = () => {`,
    `      if (${disposeListName} !== undefined || ${markerName}.parentNode === null) return;`,
    `      ${disposeListName} = ${bindList}(${markerName}.parentNode, ${markerName}, () => (${itemsCode}), ${renderer}${listOptions});`,
    `    };`,
    `    const ${disposeName} = () => {`,
    `      if (${disposeListName} !== undefined) ${disposeListName}();`,
    `    };`,
    `    return { node: ${markerName}, dispose: ${disposeName}, afterCommit: ${setupListName} };`,
    `  });`,
    `}`,
  ].join("\n");
}

function emitRootListRenderer(
  block: RootListReactiveDomBlock,
  parameters: string,
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  contextName?: string,
): string {
  const valueExpression = emitRootListRenderComponentNode(
    block,
    allocator,
    helperNames,
    contextName,
  );
  const bodyStatements = block.root.bodyStatements ?? [];

  if (bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${bodyStatements
    .map(
      (statement) =>
        `    ${rewriteStateBindingCode(statement, block.stateBinding.stateName, block.stateBinding.stateBindingName)}`,
    )
    .join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitRootListRenderComponentNode(
  block: RootListReactiveDomBlock,
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  contextName?: string,
): string {
  const propsName = block.renderComponentBlock.propsParam;
  const build: string[] = [];
  const bindings: PropBlockBinding[] = [];
  const rootVar = emitPropBlockNode(
    block.renderRoot,
    undefined,
    build,
    bindings,
    allocator,
    propsName,
    block.renderComponentBlock.propAliases,
    helperNames,
  );
  const emittedBindings =
    block.selectedClass === undefined
      ? bindings
      : bindings.filter((binding) => !(binding.kind === "className" && binding.target === rootVar));
  const bindingLines = emitPropBlockBindingLines(
    emittedBindings,
    allocator,
    helperNames,
    propsName,
    block.renderComponentBlock.propAliases,
  ).lines;

  return [
    "(() => {",
    `  const ${propsName} = ${emitRootListRenderProps(block, contextName)};`,
    ...build.map((line) => `  ${line}`),
    ...bindingLines.map((line) => `  ${line}`),
    `  return ${rootVar};`,
    "})()",
  ].join("\n");
}

function emitRootListRenderProps(block: RootListReactiveDomBlock, contextName?: string): string {
  const entries = block.renderComponentNode.props
    .map((prop) => {
      if (prop.kind === "render-prop" || prop.kind === "spread-prop") {
        return "";
      }

      if (contextName !== undefined && prop.name === block.selectedClass?.selectedPropName) {
        return "";
      }

      const code =
        contextName !== undefined && prop.name === block.selectedClass?.itemPropName
          ? `${contextName}.item`
          : rewriteStateBindingCode(
              prop.code,
              block.stateBinding.stateName,
              block.stateBinding.stateBindingName,
            );
      return `get ${emitPropName(prop.name)}() { return (${code}); }`;
    })
    .filter(Boolean);

  return `{ ${entries.join(", ")} }`;
}

function emitRootListOptions(block: RootListReactiveDomBlock, parameters: string): string {
  const optionEntries: string[] = [];

  if (block.root.keyCode !== undefined) {
    optionEntries.push(
      `key: (${parameters}) => (${rewriteStateBindingCode(
        block.root.keyCode,
        block.stateBinding.stateName,
        block.stateBinding.stateBindingName,
      )})`,
    );
  }

  if (
    block.selectedClass === undefined &&
    block.root.keyCode !== undefined &&
    listReadsNestedItemObject(block.root, block.root.itemName)
  ) {
    optionEntries.push("nestedObjectFallback: true");
  }

  if (block.selectedClass !== undefined) {
    optionEntries.push(
      `selectedClass: { className: ${JSON.stringify(block.selectedClass.className)}, selected: () => ${block.stateBinding.stateBindingName}.get()${block.selectedClass.statePath} }`,
    );
  }

  return optionEntries.length === 0 ? "" : `, { ${optionEntries.join(", ")} }`;
}

function rewriteStateBindingCode(
  code: string,
  stateName: string,
  stateBindingName: string,
): string {
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
        output += code.slice(index);
        break;
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
      if (name !== stateName) {
        output += name;
        continue;
      }

      const previous = previousNonWhitespace(code, start);
      const next = nextNonWhitespace(code, index);
      if (previous === "." || ((previous === "{" || previous === ",") && next === ":")) {
        output += name;
        continue;
      }

      output += `${stateBindingName}.get()`;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function emitPropReactiveDomBlockComponent(
  component: ComponentIr,
  block: PropReactiveDomBlock,
  helperNames: CompatHelperNames,
  functionKeyword: string,
  functionName: string,
): string {
  const allocator = createNameAllocator(collectReservedComponentLocalNames(component, helperNames));
  const createBlock = helperNames.createReactiveDomBlock ?? "_createReactiveDomBlock";
  const propBlockHelpers: PropBlockEmitHelpers = {
    bindEvent: helperNames.bindEvent ?? "_bindEvent",
    bindList: helperNames.bindList ?? "_bindList",
    bindProp: helperNames.bindProp ?? "_bindProp",
    bindSpreadProps: helperNames.bindSpreadProps ?? "_bindSpreadProps",
    createList: helperNames.createList ?? "_createList",
    effectName: helperNames.effect ?? "_effect",
    insertDynamic: helperNames.insertDynamic ?? "_insertDynamic",
  };
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
    propBlockHelpers,
  );
  const disposeLinesResult = emitPropBlockBindingLines(
    bindings,
    allocator,
    propBlockHelpers,
    block.propsParam,
    block.propAliases,
  );
  const disposeName = allocator("_dispose");
  const disposeTargets = disposeLinesResult.disposeNames;
  const disposeLines = disposeLinesResult.lines.map((line) => `    ${line}`);

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
    `${functionKeyword} ${functionName}(${component.parameters.join(", ")}) {`,
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
    `${functionName}.__mreactStaticBlock = true;`,
  ].join("\n");
}

function emitPropBlockBindingLines(
  bindings: readonly PropBlockBinding[],
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): { lines: string[]; disposeNames: string[] } {
  const eventDisposeNames: string[] = [];
  const propDisposeNames: string[] = [];
  const spreadDisposeNames: string[] = [];
  const dynamicDisposeNames: string[] = [];
  const listDisposeNames: string[] = [];
  const eventBindLines = bindings
    .filter(
      (binding): binding is Extract<PropBlockBinding, { kind: "event" }> =>
        binding.kind === "event",
    )
    .map((binding) => {
      const eventName = allocator("event");
      const handlerName = allocator("_h");
      const eventDisposeName = allocator("_disposeEvent");
      eventDisposeNames.push(eventDisposeName);
      return [
        `const ${eventDisposeName} = ${helperNames.bindEvent}(${binding.target}, ${JSON.stringify(binding.eventName)}, (${eventName}) => {`,
        ...emitPropBlockEventHandlerLines(binding.code, handlerName, eventName).map(
          (line) => `  ${line}`,
        ),
        `});`,
      ].join("\n");
    });
  const propBindLines = bindings
    .filter(
      (binding): binding is PropBlockValueBinding & { kind: "prop" } => binding.kind === "prop",
    )
    .map((binding) => {
      const propDisposeName = allocator("_disposeProp");
      propDisposeNames.push(propDisposeName);
      return [
        `const ${propDisposeName} = ${helperNames.bindProp}(`,
        `  ${binding.target},`,
        `  ${JSON.stringify(binding.propName ?? "")},`,
        `  () => (${binding.code}),`,
        `);`,
      ].join("\n");
    });
  const spreadBindLines = bindings
    .filter(
      (binding): binding is PropBlockValueBinding & { kind: "spread" } => binding.kind === "spread",
    )
    .map((binding) => {
      const spreadDisposeName = allocator("_disposeSpread");
      spreadDisposeNames.push(spreadDisposeName);
      return `const ${spreadDisposeName} = ${helperNames.bindSpreadProps}(${binding.target}, () => (${binding.code}));`;
    });
  const dynamicBindLines = bindings
    .filter(
      (binding): binding is PropBlockValueBinding & { kind: "dynamic" } =>
        binding.kind === "dynamic",
    )
    .map((binding) => {
      const dynamicDisposeName = allocator("_disposeDynamic");
      dynamicDisposeNames.push(dynamicDisposeName);
      return `const ${dynamicDisposeName} = ${helperNames.insertDynamic}(${binding.target}, ${binding.marker ?? "undefined"}, () => (${binding.code}));`;
    });
  const listBindLines = bindings
    .filter(
      (binding): binding is Extract<PropBlockBinding, { kind: "list" }> => binding.kind === "list",
    )
    .map((binding) => {
      const listDisposeName = allocator("_disposeList");
      const parameters = emitPropBlockListParameters(binding.node);
      const itemsCode = rewritePropBlockCode(binding.node.itemsCode, propsParam, propAliases);
      const options = emitPropBlockListOptions(binding.node, parameters, propsParam, propAliases);
      listDisposeNames.push(listDisposeName);
      return `const ${listDisposeName} = ${helperNames.bindList}(${binding.target}, ${binding.marker}, () => (${itemsCode}), ${emitPropBlockListRenderer(binding.node, parameters, allocator, helperNames, propsParam, propAliases)}${options});`;
    });

  // Keep text/class/htmlFor bindings grouped by dependency. General DOM
  // attributes delegate to bindProp above so they reuse the shared safety policy.
  const effectBodiesByKey = new Map<string, string[]>();
  for (const binding of bindings) {
    if (
      binding.kind === "event" ||
      binding.kind === "prop" ||
      binding.kind === "spread" ||
      binding.kind === "dynamic" ||
      binding.kind === "list"
    ) {
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
    const key = propBindingDependencyKey(binding.code, propsParam);
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
  const disposeNames = [
    ...eventDisposeNames,
    ...propDisposeNames,
    ...spreadDisposeNames,
    ...dynamicDisposeNames,
    ...listDisposeNames,
    ...effectDisposeNames,
  ];

  const disposeLines: string[] = [
    ...eventBindLines.flatMap((line) => line.split("\n")),
    ...propBindLines.flatMap((line) => line.split("\n")),
    ...spreadBindLines,
    ...dynamicBindLines,
    ...listBindLines.flatMap((line) => line.split("\n")),
  ];

  let effectIndex = 0;
  for (const effectBody of effectBodiesByKey.values()) {
    const effectDisposeName = effectDisposeNames[effectIndex]!;
    disposeLines.push(
      `const ${effectDisposeName} = ${helperNames.effectName}(() => {`,
      ...effectBody,
      `});`,
    );
    effectIndex += 1;
  }

  return { lines: disposeLines, disposeNames };
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
  helperNames: PropBlockEmitHelpers,
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
    if (isPropBlockNodeValuedExpression(node.code)) {
      const name = allocator("_marker");
      build.push(`const ${name} = document.createTextNode("");`);
      bindings.push({
        kind: "dynamic",
        target: parentVar ?? "document",
        marker: name,
        code: rewriteCode(node.code),
      });
      if (parentVar !== undefined) {
        build.push(`${parentVar}.appendChild(${name});`);
      }
      return name;
    }

    const name = allocator("_text");
    build.push(`const ${name} = document.createTextNode("");`);
    bindings.push({ kind: "text", target: name, code: rewriteCode(node.code) });
    if (parentVar !== undefined) {
      build.push(`${parentVar}.appendChild(${name});`);
    }
    return name;
  }

  if (node.kind === "conditional") {
    const name = allocator("_marker");
    build.push(`const ${name} = document.createTextNode("");`);
    bindings.push({
      kind: "dynamic",
      target: parentVar ?? "document",
      marker: name,
      code: emitPropBlockConditionalRenderValueExpression(
        node,
        allocator,
        propsParam,
        propAliases,
        helperNames,
      ),
    });
    if (parentVar !== undefined) {
      build.push(`${parentVar}.appendChild(${name});`);
    }
    return name;
  }

  if (node.kind === "list") {
    const name = allocator("_marker");
    build.push(`const ${name} = document.createTextNode("");`);
    bindings.push({
      kind: "list",
      target: parentVar ?? "document",
      marker: name,
      node,
    });
    if (parentVar !== undefined) {
      build.push(`${parentVar}.appendChild(${name});`);
    }
    return name;
  }

  if (node.kind === "component") {
    const name = allocator("_marker");
    build.push(`const ${name} = document.createTextNode("");`);
    bindings.push({
      kind: "dynamic",
      target: parentVar ?? "document",
      marker: name,
      code: emitPropBlockComponentRenderValueExpression(
        node,
        allocator,
        helperNames,
        propsParam,
        propAliases,
      ),
    });
    if (parentVar !== undefined) {
      build.push(`${parentVar}.appendChild(${name});`);
    }
    return name;
  }

  if (node.kind === "fragment") {
    for (const child of node.children) {
      emitPropBlockNode(
        child,
        parentVar,
        build,
        bindings,
        allocator,
        propsParam,
        propAliases,
        helperNames,
      );
    }

    return parentVar ?? "document.createDocumentFragment()";
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
    } else if (attr.kind === "spread-attr") {
      bindings.push({
        kind: "spread",
        target: name,
        code: rewriteCode(attr.code),
      });
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
    emitPropBlockNode(
      child,
      name,
      build,
      bindings,
      allocator,
      propsParam,
      propAliases,
      helperNames,
    );
  }

  if (parentVar !== undefined) {
    build.push(`${parentVar}.appendChild(${name});`);
  }

  return name;
}

function emitPropBlockRenderValueExpression(
  children: readonly JsxNodeIr[],
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitPropBlockNodeRenderValueExpression(
      children[0] as JsxNodeIr,
      allocator,
      helperNames,
      propsParam,
      propAliases,
    );
  }

  return `[${children
    .map((child) =>
      emitPropBlockNodeRenderValueExpression(
        child,
        allocator,
        helperNames,
        propsParam,
        propAliases,
      ),
    )
    .join(", ")}]`;
}

function emitPropBlockNodeRenderValueExpression(
  node: JsxNodeIr,
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  const rewriteCode = (code: string): string =>
    propAliases === undefined
      ? code
      : (rewritePropBlockAliasCode(code, propsParam, propAliases) ?? code);

  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${rewriteCode(node.code)})`;
  }

  if (node.kind === "conditional") {
    return emitPropBlockConditionalRenderValueExpression(
      node,
      allocator,
      propsParam,
      propAliases,
      helperNames,
    );
  }

  if (node.kind === "list") {
    const parameters = emitPropBlockListParameters(node);
    const options = emitPropBlockListOptions(node, parameters, propsParam, propAliases);
    return `${helperNames.createList}(() => (${rewriteCode(node.itemsCode)}), ${emitPropBlockListRenderer(node, parameters, allocator, helperNames, propsParam, propAliases)}${options})`;
  }

  if (node.kind === "fragment") {
    return emitPropBlockRenderValueExpression(
      node.children,
      allocator,
      helperNames,
      propsParam,
      propAliases,
    );
  }

  if (node.kind === "component") {
    return emitPropBlockComponentRenderValueExpression(
      node,
      allocator,
      helperNames,
      propsParam,
      propAliases,
    );
  }

  if (node.kind !== "element") {
    return "null";
  }

  const build: string[] = [];
  const bindings: PropBlockBinding[] = [];
  const rootVar = emitPropBlockNode(
    node,
    undefined,
    build,
    bindings,
    allocator,
    propsParam,
    propAliases,
    helperNames,
  );
  const bindingLines = emitPropBlockBindingLines(
    bindings,
    allocator,
    helperNames,
    propsParam,
    propAliases,
  ).lines;

  return [
    "(() => {",
    ...build.map((line) => `  ${line}`),
    ...bindingLines.map((line) => `  ${line}`),
    `  return ${rootVar};`,
    "})()",
  ].join("\n");
}

function emitPropBlockConditionalRenderValueExpression(
  node: Extract<JsxNodeIr, { kind: "conditional" }>,
  allocator: (baseName: string) => string,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
  helperNames: PropBlockEmitHelpers,
): string {
  const rewriteCode = (code: string): string =>
    propAliases === undefined
      ? code
      : (rewritePropBlockAliasCode(code, propsParam, propAliases) ?? code);
  const whenTrue = emitPropBlockRenderValueExpression(
    node.whenTrue,
    allocator,
    helperNames,
    propsParam,
    propAliases,
  );
  const whenFalse = emitPropBlockRenderValueExpression(
    node.whenFalse,
    allocator,
    helperNames,
    propsParam,
    propAliases,
  );

  if (node.conditionValueName === undefined) {
    return `((${rewriteCode(node.conditionCode)}) ? ${whenTrue} : ${whenFalse})`;
  }

  return `(() => { const ${node.conditionValueName} = (${rewriteCode(node.conditionCode)}); return ${node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`;
}

function emitPropBlockListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  const valueExpression = emitPropBlockRenderValueExpression(
    node.children,
    allocator,
    helperNames,
    propsParam,
    propAliases,
  );

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${rewritePropBlockCode(statement, propsParam, propAliases)}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitPropBlockComponentRenderValueExpression(
  node: Extract<JsxNodeIr, { kind: "component" }>,
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  const props = emitPropBlockComponentProps(
    node.props,
    node.children,
    allocator,
    helperNames,
    propsParam,
    propAliases,
  );
  return `${node.name}(${props})`;
}

function emitPropBlockComponentProps(
  props: readonly ComponentPropIr[],
  children: readonly JsxNodeIr[],
  allocator: (baseName: string) => string,
  helperNames: PropBlockEmitHelpers,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  const rewriteCode = (code: string): string =>
    propAliases === undefined
      ? code
      : (rewritePropBlockAliasCode(code, propsParam, propAliases) ?? code);
  const entries = props
    .map((prop) => {
      if (prop.kind === "spread-prop") {
        return `...(${rewriteCode(prop.code)})`;
      }

      if (prop.kind === "render-prop") {
        return "";
      }

      return `${emitPropName(prop.name)}: (${rewriteCode(prop.code)})`;
    })
    .filter(Boolean);

  if (children.length > 0) {
    entries.push(
      `children: ${emitPropBlockRenderValueExpression(
        children,
        allocator,
        helperNames,
        propsParam,
        propAliases,
      )}`,
    );
  }

  return `{ ${entries.join(", ")} }`;
}

function emitPropBlockListOptions(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  const optionEntries: string[] = [];

  if (node.keyCode !== undefined) {
    optionEntries.push(
      `key: (${parameters}) => (${rewritePropBlockCode(node.keyCode, propsParam, propAliases)})`,
    );
  }

  if (node.keyCode !== undefined && listReadsNestedItemObject(node, node.itemName)) {
    optionEntries.push("nestedObjectFallback: true");
  }

  return optionEntries.length === 0 ? "" : `, { ${optionEntries.join(", ")} }`;
}

function emitPropBlockListParameters(node: Extract<JsxNodeIr, { kind: "list" }>): string {
  return [node.itemName, node.indexName, node.arrayName]
    .filter((name): name is string => name !== undefined)
    .join(", ");
}

function rewritePropBlockCode(
  code: string,
  propsParam: string,
  propAliases: readonly PropAliasIr[] | undefined,
): string {
  return propAliases === undefined
    ? code
    : (rewritePropBlockAliasCode(code, propsParam, propAliases) ?? code);
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

  if (node.kind === "conditional") {
    return (
      rewritePropBlockAliasCode(node.conditionCode, propsParam, propAliases) !== undefined &&
      node.whenTrue.every((child) =>
        canRewritePropBlockAliasNode(child, propsParam, propAliases),
      ) &&
      node.whenFalse.every((child) => canRewritePropBlockAliasNode(child, propsParam, propAliases))
    );
  }

  if (node.kind === "list") {
    if (propBlockListShadowsAlias(node, propAliases)) {
      return false;
    }

    return (
      rewritePropBlockAliasCode(node.itemsCode, propsParam, propAliases) !== undefined &&
      (node.keyCode === undefined ||
        rewritePropBlockAliasCode(node.keyCode, propsParam, propAliases) !== undefined) &&
      (node.bodyStatements === undefined ||
        node.bodyStatements.every(
          (statement) =>
            rewritePropBlockAliasCode(statement, propsParam, propAliases) !== undefined,
        )) &&
      node.children.every((child) => canRewritePropBlockAliasNode(child, propsParam, propAliases))
    );
  }

  if (node.kind === "fragment") {
    return node.children.every((child) =>
      canRewritePropBlockAliasNode(child, propsParam, propAliases),
    );
  }

  if (node.kind === "component") {
    return (
      node.props.every((prop) => {
        if (prop.kind === "render-prop") {
          return false;
        }

        return rewritePropBlockAliasCode(prop.code, propsParam, propAliases) !== undefined;
      }) &&
      node.children.every((child) => canRewritePropBlockAliasNode(child, propsParam, propAliases))
    );
  }

  if (node.kind !== "element") {
    return false;
  }

  for (const attr of node.attributes) {
    if (
      (attr.kind === "dynamic-attr" || attr.kind === "event" || attr.kind === "spread-attr") &&
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
        if (next === ":" && previous !== "{" && previous !== ",") {
          return undefined;
        }
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

function propBlockListShadowsAlias(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  propAliases: readonly PropAliasIr[],
): boolean {
  const aliasNames = new Set(propAliases.map((alias) => alias.localName));

  return (
    aliasNames.has(node.itemName) ||
    (node.indexName !== undefined && aliasNames.has(node.indexName)) ||
    (node.arrayName !== undefined && aliasNames.has(node.arrayName))
  );
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
  return new RegExp(`(^|[^A-Za-z_$\\d])${escapeRegex(name)}([^A-Za-z_$\\d]|$)`).test(code);
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
