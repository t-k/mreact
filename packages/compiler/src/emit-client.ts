import type { ComponentPropIr, ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import type { RuntimeImport } from "./types.js";
import { listReadsNestedItemObject } from "./ir-nested-object-read.js";
import { OXC_BIND_DOM_REF_PLACEHOLDER } from "./oxc-dom-lowering.js";
import { OXC_UNTRACK_REACTIVE_ALIAS_PLACEHOLDER } from "./oxc-render-values.js";
import {
  getCompatInlineMemo,
  type CompatInlineMemo,
} from "./compat-inline-memo.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitClient(
  ir: ModuleIr,
  options: { dev?: boolean; filename?: string } = {},
): EmitResult {
  const imports = collectImports(ir);
  const helperNames = allocateRuntimeHelperNames(
    ir,
    imports.flatMap((entry) => entry.specifiers),
  );
  const importLines = imports
    .filter((entry) => entry.specifiers.length > 0)
    .map((entry) => emitRuntimeImportLine(entry, helperNames))
    .join("\n");
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(ir);
  const moduleAllocator = createNameAllocator([]);
  const clientBoundaryHelperName = hasClientReferenceNodes(ir)
    ? moduleAllocator("__mreactClientBoundary", ir.moduleBindingNames)
    : undefined;
  const clientBoundaryHelper =
    clientBoundaryHelperName === undefined
      ? ""
      : emitClientBoundaryHelper(clientBoundaryHelperName);
  const inlineMemoComponents = new Map(
    ir.components.flatMap((component) => {
      const inlineMemo = getCompatInlineMemo(component);
      return inlineMemo === undefined ? [] : ([[component.name, inlineMemo]] as const);
    }),
  );
  const components = ir.components
    .map((component) =>
      emitComponent(
        component,
        moduleAllocator,
        helperNames,
        clientBoundaryHelperName,
        inlineMemoComponents,
        options,
      ),
    )
    .join("\n\n")
    .replaceAll(OXC_BIND_DOM_REF_PLACEHOLDER, helperNames.bindDomRef)
    .replaceAll(OXC_UNTRACK_REACTIVE_ALIAS_PLACEHOLDER, helperNames.untrack);

  return {
    code: `${[importLines, userImports, moduleStatements, clientBoundaryHelper].filter(Boolean).join("\n")}\n\n${components}\n`,
    imports,
  };
}

type RuntimeHelperName =
  | "bindList"
  | "bindDomRef"
  | "bindEvent"
  | "bindProp"
  | "bindSpreadProps"
  | "bindText"
  | "createList"
  | "createMemo"
  | "createTemplate"
  | "createTemplateElement"
  | "insertDynamic"
  | "insertMemoDynamic"
  | "bindCompilerKeyedCellText"
  | "bindCompilerKeyedSingleNodeList"
  | "bindCompilerKeyedPropertyText"
  | "bindCompilerKeyedText"
  | "markCompilerKeyedEventSlot"
  | "untrack";

type RuntimeHelperNames = Record<RuntimeHelperName, string>;

function allocateRuntimeHelperNames(
  ir: ModuleIr,
  specifiers: readonly string[],
): RuntimeHelperNames {
  const bindingNames = [
    ...ir.moduleBindingNames,
    ...ir.components.flatMap((component) => [
      component.name,
      component.exportName,
      ...component.bindingNames,
    ]),
  ];
  const allocator = createNameAllocator(bindingNames);
  const occupiedNames = new Set(bindingNames);
  const helperNames: RuntimeHelperNames = {
    bindList: "bindList",
    bindDomRef: "bindDomRef",
    bindEvent: "bindEvent",
    bindProp: "bindProp",
    bindSpreadProps: "bindSpreadProps",
    bindText: "bindText",
    createList: "createList",
    createMemo: "createMemo",
    createTemplate: "createTemplate",
    createTemplateElement: "createTemplateElement",
    insertDynamic: "insertDynamic",
    insertMemoDynamic: "insertMemoDynamic",
    bindCompilerKeyedCellText: "bindCompilerKeyedCellText",
    bindCompilerKeyedSingleNodeList: "bindCompilerKeyedSingleNodeList",
    bindCompilerKeyedPropertyText: "bindCompilerKeyedPropertyText",
    bindCompilerKeyedText: "bindCompilerKeyedText",
    markCompilerKeyedEventSlot: "markCompilerKeyedEventSlot",
    untrack: "untrack",
  };

  for (const specifier of specifiers) {
    const helper = specifier as RuntimeHelperName;
    helperNames[helper] = allocator(occupiedNames.has(helper) ? `_${helper}` : helper);
  }

  return helperNames;
}

function emitRuntimeImportLine(
  runtimeImport: RuntimeImport,
  helperNames: RuntimeHelperNames,
): string {
  const specifiers = runtimeImport.specifiers;
  const importedNames = specifiers.map((specifier) => {
    const helper = specifier as RuntimeHelperName;
    const localName = helperNames[helper];

    return localName === specifier ? specifier : `${specifier} as ${localName}`;
  });

  return `import { ${importedNames.join(", ")} } from ${JSON.stringify(runtimeImport.source)};`;
}

function emitUserImports(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.userImports.join("\n");
}

function emitModuleStatements(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.moduleStatements.join("\n");
}

function collectImports(ir: ModuleIr): RuntimeImport[] {
  if (ir.components.length === 0) {
    return [];
  }

  const specifiers = new Set<string>(["createTemplate"]);
  const internalSpecifiers = new Set<string>();
  const reactiveCoreSpecifiers = new Set<string>();

  const inlineMemoComponentNames = new Set(
    ir.components
      .filter((component) => getCompatInlineMemo(component) !== undefined)
      .map((component) => component.name),
  );

  if (
    ir.components.some((component) =>
      treeUsesOwnerScopedMemo(component.root, inlineMemoComponentNames),
    )
  ) {
    internalSpecifiers.add("createMemo");
    internalSpecifiers.add("insertMemoDynamic");
  }

  if (JSON.stringify(ir).includes(OXC_BIND_DOM_REF_PLACEHOLDER)) {
    specifiers.add("bindDomRef");
  }

  if (JSON.stringify(ir).includes(OXC_UNTRACK_REACTIVE_ALIAS_PLACEHOLDER)) {
    reactiveCoreSpecifiers.add("untrack");
  }

  for (const component of ir.components) {
    visit(component.root, (node) => {
      if (node.kind === "expr") {
        if (node.renderMode === "dynamic") {
          specifiers.add("insertDynamic");
        } else if (node.renderMode === "compiler-keyed-cell-text") {
          internalSpecifiers.add("bindCompilerKeyedCellText");
        } else if (node.renderMode === "compiler-keyed-text") {
          internalSpecifiers.add(
            node.compilerKeyedProperty === undefined
              ? "bindCompilerKeyedText"
              : "bindCompilerKeyedPropertyText",
          );
        } else if (node.renderMode !== "compiler-keyed-initial-text") {
          specifiers.add("bindText");
        }
      }

      if (node.kind === "conditional") {
        specifiers.add("insertDynamic");
      }

      if (node.kind === "list") {
        if (node.compiledSingleNode === undefined) {
          specifiers.add("bindList");
        } else {
          specifiers.add("createTemplateElement");
          internalSpecifiers.add("bindCompilerKeyedSingleNodeList");
        }
      }

      if (node.kind === "element") {
        for (const attr of node.attributes) {
          if (attr.kind === "dynamic-attr") {
            specifiers.add("bindProp");
          }

          if (attr.kind === "dom-ref") {
            specifiers.add("bindDomRef");
          }

          if (attr.kind === "spread-attr") {
            specifiers.add("bindSpreadProps");
          }

          if (attr.kind === "event") {
            if (attr.compilerKeyedSlot === undefined) {
              specifiers.add("bindEvent");
            }
          }
        }
      }
    });

    if (componentUsesCreateList(component.root)) {
      specifiers.add("createList");
    }
  }

  const imports: RuntimeImport[] = [
    {
      source: "@reckona/mreact-reactive-dom",
      specifiers: Array.from(specifiers).sort(),
    },
  ];
  if (internalSpecifiers.size > 0) {
    imports.push({
      source: "@reckona/mreact-reactive-dom/internal",
      specifiers: Array.from(internalSpecifiers).sort(),
    });
  }
  if (reactiveCoreSpecifiers.size > 0) {
    imports.push({
      source: "@reckona/mreact-reactive-core",
      specifiers: Array.from(reactiveCoreSpecifiers).sort(),
    });
  }
  return imports;
}

function componentUsesCreateList(node: JsxNodeIr): boolean {
  if (node.kind === "conditional" || node.kind === "list") {
    return renderValueNodeUsesCreateList(node);
  }

  if (node.kind === "component") {
    return componentCallUsesCreateList(node);
  }

  return setupUsesCreateList(node);
}

function setupUsesCreateList(node: JsxNodeIr): boolean {
  if (node.kind === "component") {
    return componentCallUsesCreateList(node);
  }

  if (node.kind === "list") {
    return renderValueChildrenUseCreateList(node.children);
  }

  if (node.kind === "conditional") {
    return renderValueNodeUsesCreateList(node);
  }

  if (node.kind === "async-boundary") {
    return (
      renderValueChildrenUseCreateList(node.children) ||
      renderValueChildrenUseCreateList(node.placeholderChildren ?? []) ||
      renderValueChildrenUseCreateList(node.catchChildren ?? [])
    );
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some(setupUsesCreateList);
  }

  return false;
}

function renderValueChildrenUseCreateList(children: readonly JsxNodeIr[]): boolean {
  return children.some(renderValueNodeUsesCreateList);
}

function renderValueNodeUsesCreateList(node: JsxNodeIr): boolean {
  if (node.kind === "list") {
    return true;
  }

  if (node.kind === "conditional") {
    return (
      renderValueChildrenUseCreateList(node.whenTrue) ||
      renderValueChildrenUseCreateList(node.whenFalse)
    );
  }

  if (node.kind === "fragment") {
    return renderValueChildrenUseCreateList(node.children);
  }

  if (node.kind === "component") {
    return componentCallUsesCreateList(node);
  }

  if (node.kind === "element") {
    return setupUsesCreateList(node);
  }

  return false;
}

function componentCallUsesCreateList(node: Extract<JsxNodeIr, { kind: "component" }>): boolean {
  return (
    node.props.some(
      (prop) => prop.kind === "render-prop" && renderValueChildrenUseCreateList(prop.children),
    ) || renderValueChildrenUseCreateList(node.children)
  );
}

function hasClientReferenceNodes(ir: ModuleIr): boolean {
  return ir.components.some((component) => {
    let found = false;
    visit(component.root, (node) => {
      if (
        node.kind === "component" &&
        node.clientReference !== undefined &&
        isCompatClientReferenceModuleId(node.clientReference.moduleId)
      ) {
        found = true;
      }
    });
    return found;
  });
}

function emitClientBoundaryHelper(name: string): string {
  return `function ${name}(name, props) {
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement("template");
  placeholder.setAttribute("data-mreact-client-boundary", name);
  const propsElement = document.createElement("script");
  propsElement.type = "application/json";
  propsElement.setAttribute("data-mreact-client-boundary-props", name);
  try {
    propsElement.textContent = JSON.stringify(props ?? {})
      .replaceAll("&", "\\\\u0026")
      .replaceAll("<", "\\\\u003c")
      .replaceAll(">", "\\\\u003e")
      .replaceAll("\\u2028", "\\\\u2028")
      .replaceAll("\\u2029", "\\\\u2029");
  } catch {
    placeholder.setAttribute("data-mreact-client-boundary-nonserializable", "true");
    propsElement.textContent = "{}";
  }
  fragment.append(placeholder, propsElement);
  return fragment;
}`;
}

function emitComponent(
  component: ComponentIr,
  moduleAllocator: NameAllocator,
  helperNames: RuntimeHelperNames,
  clientBoundaryHelperName: string | undefined,
  inlineMemoComponents: ReadonlyMap<string, CompatInlineMemo>,
  options: { dev?: boolean; filename?: string },
): string {
  const templateName = moduleAllocator("_tmpl_" + component.name, component.bindingNames);
  const allocator = createNameAllocator([...component.bindingNames, templateName]);
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");
  const functionKeyword = emitFunctionKeyword(component);
  const debugLabel =
    options.dev === true && options.filename !== undefined
      ? `${options.filename}#${component.name}`
      : undefined;

  if (component.root.kind === "component") {
    const state = {
      allocateName: allocator,
      textIndex: 0,
      helperNames,
      clientBoundaryHelperName,
      inlineMemoComponents,
      debugLabel,
    };
    return [
      `${functionKeyword} ${component.name}(${parameters}) {`,
      ...body,
      `  return ${emitComponentCall(
        component.root.name,
        component.root.props,
        component.root.children,
        state,
        component.root.clientReference === undefined
          ? undefined
          : { moduleId: component.root.clientReference.moduleId, name: component.root.name },
      )};`,
      `}`,
    ].join("\n");
  }

  if (component.root.kind === "conditional") {
    const state = {
      allocateName: allocator,
      textIndex: 0,
      helperNames,
      clientBoundaryHelperName,
      inlineMemoComponents,
      debugLabel,
    };
    const fragmentName = allocator("_fragment");
    const markerName = allocator("_marker");
    const ownerScopedMemo = isOwnerScopedMemoConditional(component.root, state);
    return [
      `${functionKeyword} ${component.name}(${parameters}) {`,
      ...body,
      `  const ${fragmentName} = document.createDocumentFragment();`,
      `  const ${markerName} = document.createComment("");`,
      `  ${fragmentName}.append(${markerName});`,
      `  ${ownerScopedMemo ? helperNames.insertMemoDynamic : helperNames.insertDynamic}(${fragmentName}, ${markerName}, () => ${emitNodeRenderValueExpression(component.root, state)}${emitDynamicOptions(debugLabel)});`,
      `  return ${fragmentName};`,
      `}`,
    ].join("\n");
  }

  const fragmentName = allocator("_fragment");
  const rootName = allocator("_root");
  const templateHtml = JSON.stringify(renderStaticHtml(component.root));
  const setup = emitSetup(component.root, rootName, {
    allocateName: allocator,
    textIndex: 0,
    helperNames,
    clientBoundaryHelperName,
    inlineMemoComponents,
    debugLabel,
  });
  return [
    `const ${templateName} = ${helperNames.createTemplate}(${templateHtml});`,
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    `  const ${fragmentName} = ${templateName}();`,
    component.root.kind === "fragment"
      ? `  const ${rootName} = ${fragmentName};`
      : `  const ${rootName} = ${fragmentName}.firstChild;`,
    setup,
    `  return ${rootName};`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function emitFunctionKeyword(component: ComponentIr): string {
  return `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}${
    component.async === true ? "async " : ""
  }function`;
}

function renderStaticHtml(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return escapeHtml(node.value);
  }

  if (node.kind === "expr") {
    return "<!---->";
  }

  if (node.kind === "conditional" || node.kind === "list") {
    return "<!---->";
  }

  if (node.kind === "fragment") {
    return renderStaticChildren(node.children);
  }

  if (node.kind === "component") {
    return "<!---->";
  }

  if (node.kind === "async-boundary") {
    return "<!--mreact-async-boundary-->";
  }

  const attrs = node.attributes
    .filter((attr) => attr.kind === "static-attr")
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join("");
  const children = renderStaticChildren(node.children);

  return `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
}

function renderStaticChildren(children: readonly JsxNodeIr[]): string {
  return children
    .map((child, index) =>
      canReuseTemplateTextNode(children, index) ? " " : renderStaticHtml(child),
    )
    .join("");
}

function canReuseTemplateTextNode(children: readonly JsxNodeIr[], index: number): boolean {
  const child = children[index];
  if (child?.kind !== "expr" || child.renderMode === "dynamic") {
    return false;
  }

  return (
    !isMergeableTemplateText(children[index - 1]) && !isMergeableTemplateText(children[index + 1])
  );
}

function isMergeableTemplateText(node: JsxNodeIr | undefined): boolean {
  return node?.kind === "text" || (node?.kind === "expr" && node.renderMode !== "dynamic");
}

interface EmitSetupState {
  allocateName: (baseName: string) => string;
  textIndex: number;
  helperNames: RuntimeHelperNames;
  clientBoundaryHelperName?: string | undefined;
  inlineMemoComponents: ReadonlyMap<string, CompatInlineMemo>;
  debugLabel?: string | undefined;
  compilerKeyedEventSlotKeys?: ReadonlyMap<string, string> | undefined;
  compilerKeyedElementPath?: string | undefined;
  compilerKeyedRowContext?: string | undefined;
}

function emitDynamicOptions(debugLabel: string | undefined, memo = false): string {
  const entries = [
    ...(debugLabel === undefined ? [] : [`debugLabel: ${JSON.stringify(debugLabel)}`]),
    ...(memo ? ["memo: true"] : []),
  ];
  return entries.length === 0 ? "" : `, { ${entries.join(", ")} }`;
}

function emitSetup(node: JsxNodeIr, path: string, state: EmitSetupState): string {
  const lines: string[] = [];

  if (node.kind !== "element" && node.kind !== "fragment" && node.kind !== "component") {
    return "";
  }

  if (node.kind === "component") {
    const componentVar = state.allocateName("_component");
    lines.push(
      `  const ${componentVar} = ${emitComponentCall(
        node.name,
        node.props,
        node.children,
        state,
        node.clientReference === undefined
          ? undefined
          : { moduleId: node.clientReference.moduleId, name: node.name },
      )};`,
    );
    lines.push(`  if (${componentVar} == null || typeof ${componentVar} === "boolean") {`);
    lines.push(`    ${path}.remove();`);
    lines.push(`  } else {`);
    lines.push(`    ${path}.replaceWith(${componentVar});`);
    lines.push(`  }`);
    return lines.join("\n");
  }

  const currentPath =
    node.kind === "element" && shouldCacheCompilerKeyedElementPath(node, path, state)
      ? state.allocateName("_keyedElement")
      : path;

  if (currentPath !== path) {
    lines.push(`  const ${currentPath} = ${path};`);
  }

  if (node.kind === "element") {
    for (const attr of node.attributes) {
      if (attr.kind === "dynamic-attr") {
        lines.push(
          `  ${state.helperNames.bindProp}(${currentPath}, "${attr.name}", () => (${attr.code}));`,
        );
      }

      if (attr.kind === "dom-ref") {
        lines.push(`  ${state.helperNames.bindDomRef}(${currentPath}, ${attr.code});`);
      }

      if (attr.kind === "spread-attr") {
        lines.push(`  ${state.helperNames.bindSpreadProps}(${currentPath}, () => (${attr.code}));`);
      }

      if (attr.kind === "event") {
        if (state.compilerKeyedEventSlotKeys && attr.compilerKeyedSlot !== undefined) {
          const slotKey = state.compilerKeyedEventSlotKeys.get(attr.eventName);
          if (slotKey === undefined) {
            throw new Error(`Missing compiler keyed event slot for ${attr.eventName}.`);
          }
          lines.push(`  ${currentPath}[${slotKey}] = ${attr.compilerKeyedSlot};`);
        } else {
          lines.push(
            `  ${state.helperNames.bindEvent}(${currentPath}, "${attr.eventName}", ${attr.code});`,
          );
        }
      }
    }
  }

  const children = node.children;
  const stableChildrenName = needsStableChildrenSnapshot(children)
    ? state.allocateName("_children")
    : undefined;
  const liveChildrenName =
    stableChildrenName === undefined &&
    state.compilerKeyedRowContext !== undefined &&
    needsCompilerKeyedLiveChildrenAlias(children)
      ? state.allocateName("_keyedChildren")
      : undefined;
  let childIndex = 0;

  if (stableChildrenName !== undefined) {
    lines.push(`  const ${stableChildrenName} = Array.from(${currentPath}.childNodes);`);
  } else if (liveChildrenName !== undefined) {
    lines.push(`  const ${liveChildrenName} = ${currentPath}.childNodes;`);
  }

  let sawStaticText = false;
  let sawComponentMutation = false;

  for (let sourceChildIndex = 0; sourceChildIndex < children.length; sourceChildIndex += 1) {
    const child = children[sourceChildIndex] as JsxNodeIr;
    if (child.kind === "text") {
      sawStaticText = true;
      childIndex += 1;
      continue;
    }

    const usesLiveChildPath =
      stableChildrenName === undefined ||
      (child.kind !== "component" &&
        !sawComponentMutation &&
        usesLiveInsertionAnchor(child) &&
        !sawStaticText);
    const childPath = usesLiveChildPath
      ? liveChildrenName !== undefined
        ? `${liveChildrenName}[${childIndex}]`
        : state.compilerKeyedRowContext !== undefined &&
            stableChildrenName === undefined &&
            childIndex === 0
          ? `${currentPath}.firstChild`
          : `${currentPath}.childNodes[${childIndex}]`
      : `${stableChildrenName}[${childIndex}]`;

    if (child.kind === "expr") {
      if (child.renderMode === "dynamic") {
        lines.push(
          `  ${state.helperNames.insertDynamic}(${currentPath}, ${childPath}, () => (${child.code})${emitDynamicOptions(state.debugLabel)});`,
        );
        childIndex += 1;
        continue;
      }

      const textVar = state.allocateName(`_text_${state.textIndex}`);
      const initialTextValueVar =
        child.renderMode === "compiler-keyed-initial-text"
          ? state.allocateName(`_textValue_${state.textIndex}`)
          : undefined;
      const reuseTemplateTextNode = canReuseTemplateTextNode(children, sourceChildIndex);
      state.textIndex += 1;
      if (reuseTemplateTextNode) {
        lines.push(`  const ${textVar} = ${childPath};`);
      } else if (initialTextValueVar === undefined) {
        lines.push(`  const ${textVar} = document.createTextNode("");`);
      } else {
        lines.push(`  const ${initialTextValueVar} = (${child.code});`);
        lines.push(
          `  const ${textVar} = document.createTextNode(typeof ${initialTextValueVar} === "string" ? ${initialTextValueVar} : ${initialTextValueVar} == null ? "" : String(${initialTextValueVar}));`,
        );
      }
      if (!reuseTemplateTextNode) {
        lines.push(`  ${childPath}.replaceWith(${textVar});`);
      }
      if (reuseTemplateTextNode && initialTextValueVar !== undefined) {
        lines.push(`  const ${initialTextValueVar} = (${child.code});`);
        lines.push(
          `  ${textVar}.data = typeof ${initialTextValueVar} === "string" ? ${initialTextValueVar} : ${initialTextValueVar} == null ? "" : String(${initialTextValueVar});`,
        );
      }
      if (child.renderMode === "compiler-keyed-cell-text") {
        if (
          state.compilerKeyedRowContext === undefined ||
          child.compilerKeyedProperty === undefined
        ) {
          throw new Error("Missing compiler keyed row context for optimized cell text.");
        }
        lines.push(
          `  ${state.helperNames.bindCompilerKeyedCellText}(${state.compilerKeyedRowContext}, ${textVar}, ${JSON.stringify(child.compilerKeyedProperty)});`,
        );
      } else if (child.renderMode === "compiler-keyed-text") {
        if (state.compilerKeyedRowContext === undefined) {
          throw new Error("Missing compiler keyed row context for optimized text.");
        }
        if (child.compilerKeyedProperty === undefined) {
          lines.push(
            `  ${state.helperNames.bindCompilerKeyedText}(${state.compilerKeyedRowContext}, ${textVar}, () => (${child.code}));`,
          );
        } else {
          lines.push(
            `  ${state.helperNames.bindCompilerKeyedPropertyText}(${state.compilerKeyedRowContext}, ${textVar}, ${JSON.stringify(child.compilerKeyedProperty)});`,
          );
        }
      } else if (child.renderMode !== "compiler-keyed-initial-text") {
        lines.push(`  ${state.helperNames.bindText}(${textVar}, () => (${child.code}));`);
      }
      childIndex += 1;
      continue;
    }

    if (child.kind === "conditional") {
      const ownerScopedMemo = isOwnerScopedMemoConditional(child, state);
      lines.push(
        `  ${ownerScopedMemo ? state.helperNames.insertMemoDynamic : state.helperNames.insertDynamic}(${currentPath}, ${childPath}, () => ${emitConditionalRenderValueExpression(child, state)}${emitDynamicOptions(state.debugLabel)});`,
      );
      childIndex += 1;
      continue;
    }

    if (child.kind === "list") {
      const parameters = emitListParameters(child);
      const optionEntries: string[] = [];
      const eventPrograms = child.compiledSingleNode?.eventPrograms;
      const eventSlotKeys = eventPrograms?.map(() => state.allocateName("_keyedEventSlot"));

      if (eventSlotKeys !== undefined) {
        for (const slotKey of eventSlotKeys) {
          lines.push(`  const ${slotKey} = Symbol();`);
        }
      }

      if (child.keyCode !== undefined) {
        optionEntries.push(`key: (${parameters}) => (${child.keyCode})`);
      }

      if (child.keyCode !== undefined && listReadsNestedItemObject(child, child.itemName)) {
        optionEntries.push("nestedObjectFallback: true");
      }

      if (child.compiledSingleNode?.selectedClass !== undefined) {
        optionEntries.push(
          `compilerSelectedClass: { className: ${JSON.stringify(child.compiledSingleNode.selectedClass.className)}, initialClassValue: "", source: ${child.compiledSingleNode.selectedClass.sourceCode} }`,
        );
      }
      if (eventPrograms !== undefined && eventSlotKeys !== undefined) {
        optionEntries.push(
          `compilerEvents: ${emitCompilerKeyedEventPrograms(eventPrograms, child.itemName, eventSlotKeys)}`,
        );
        optionEntries.push("deferEventPromotion: false");
      }
      if (child.compiledSingleNode?.ownsTextCleanup === true) {
        optionEntries.push("compilerOwnsTextCleanup: true");
      }

      const options = optionEntries.length === 0 ? "" : `, { ${optionEntries.join(", ")} }`;
      if (child.compiledSingleNode === undefined) {
        lines.push(
          `  ${state.helperNames.bindList}(${currentPath}, ${childPath}, () => (${child.itemsCode}), ${emitListRenderer(child, parameters, state)}${options});`,
        );
      } else {
        const templateName = state.allocateName("_keyedTemplate");
        lines.push(
          `  const ${templateName} = ${state.helperNames.createTemplateElement}(${JSON.stringify(renderStaticHtml(child.compiledSingleNode.root))});`,
        );
        lines.push(
          `  ${state.helperNames.bindCompilerKeyedSingleNodeList}(${currentPath}, ${childPath}, () => (${child.itemsCode}), ${emitCompilerKeyedSingleNodeRenderer(child, templateName, state, eventSlotKeys)}${options});`,
        );
      }
      childIndex += 1;
      continue;
    }

    if (child.kind === "async-boundary") {
      lines.push(emitAsyncBoundarySetup(child, childPath, state));
      childIndex += 1;
      continue;
    }

    const previousCompilerKeyedElementPath = state.compilerKeyedElementPath;
    state.compilerKeyedElementPath =
      state.compilerKeyedRowContext !== undefined && usesLiveChildPath ? childPath : undefined;
    lines.push(emitSetup(child, childPath, state));
    state.compilerKeyedElementPath = previousCompilerKeyedElementPath;
    if (child.kind === "component") {
      sawComponentMutation = true;
    }
    childIndex += 1;
  }

  return lines.filter(Boolean).join("\n");
}

function shouldCacheCompilerKeyedElementPath(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  path: string,
  state: EmitSetupState,
): boolean {
  if (state.compilerKeyedRowContext === undefined || state.compilerKeyedElementPath !== path) {
    return false;
  }

  let pathUses = 0;

  for (const attr of node.attributes) {
    if (attr.kind === "event" && attr.compilerKeyedSlot !== undefined) {
      pathUses += 1;
    }
  }

  for (const child of node.children) {
    if (child.kind === "expr" && child.renderMode !== "dynamic") {
      pathUses += 1;
    }
  }

  return pathUses > 1;
}

function needsCompilerKeyedLiveChildrenAlias(children: readonly JsxNodeIr[]): boolean {
  let setupChildCount = 0;

  for (const child of children) {
    if (compilerKeyedNodeHasSetup(child)) {
      setupChildCount += 1;
      if (setupChildCount > 1) {
        return true;
      }
    }
  }

  return false;
}

function compilerKeyedNodeHasSetup(node: JsxNodeIr): boolean {
  if (node.kind === "text") {
    return false;
  }

  if (node.kind === "element") {
    return (
      node.attributes.some((attribute) => attribute.kind !== "static-attr") ||
      node.children.some(compilerKeyedNodeHasSetup)
    );
  }

  if (node.kind === "fragment") {
    return node.children.some(compilerKeyedNodeHasSetup);
  }

  return true;
}

function usesLiveInsertionAnchor(child: JsxNodeIr): boolean {
  return (
    child.kind === "component" ||
    (child.kind === "expr" && child.renderMode === "dynamic") ||
    child.kind === "conditional" ||
    child.kind === "list" ||
    child.kind === "async-boundary"
  );
}

function hasLiveChildListMutation(children: readonly JsxNodeIr[]): boolean {
  return children.some(usesLiveInsertionAnchor);
}

function needsStableChildrenSnapshot(children: readonly JsxNodeIr[]): boolean {
  if (!hasLiveChildListMutation(children)) {
    return false;
  }

  let sawStaticText = false;

  for (const child of children) {
    if (child.kind === "text") {
      sawStaticText = true;
      continue;
    }

    const usesDirectLivePath =
      child.kind !== "component" && usesLiveInsertionAnchor(child) && !sawStaticText;

    if (!usesDirectLivePath) {
      return true;
    }
  }

  return false;
}

function emitRenderValueExpression(
  children: JsxNodeIr[],
  state: EmitSetupState,
  ownerScopedMemo = false,
): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitNodeRenderValueExpression(children[0] as JsxNodeIr, state, ownerScopedMemo);
  }

  return `[${children
    .map((child) => emitNodeRenderValueExpression(child, state, ownerScopedMemo))
    .join(", ")}]`;
}

function emitAsyncBoundarySetup(
  node: Extract<JsxNodeIr, { kind: "async-boundary" }>,
  childPath: string,
  state: EmitSetupState,
): string {
  // Without a stable id the server has no way to tell the client what it
  // resolved. Leave the placeholder comment in place so the server-rendered
  // subtree (preserved via the hydration marker skip) remains the source of
  // truth. The resolved buttons inside it stay non-interactive in that case.
  if (node.awaitId === undefined) {
    return "";
  }

  const valueName = node.valueName;
  const renderChildren = emitRenderValueExpression(node.children, state);
  const awaitIdLiteral = JSON.stringify(node.awaitId);

  return [
    `  {`,
    `    const _awaitStore = globalThis.__mreactAwaitData;`,
    `    const _awaitEntry = _awaitStore === undefined ? undefined : _awaitStore[${awaitIdLiteral}];`,
    `    if (_awaitEntry !== undefined) {`,
    `      const ${valueName} = _awaitEntry.value;`,
    `      const _resolvedAwaitContent = ${renderChildren};`,
    `      if (_resolvedAwaitContent != null) {`,
    `        ${childPath}.replaceWith(_resolvedAwaitContent);`,
    `      }`,
    `    }`,
    `  }`,
  ].join("\n");
}

function emitNodeRenderValueExpression(
  node: JsxNodeIr,
  state: EmitSetupState,
  ownerScopedMemo = false,
): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "component") {
    const inlineMemo = state.inlineMemoComponents.get(node.name);

    if (ownerScopedMemo && inlineMemo !== undefined) {
      const memoProps = state.allocateName("_memoProps");
      const propsCode = emitPropsObject(node.props, node.children, state, false);
      const compareArgument =
        inlineMemo.compareCode === undefined ? "" : `, ${inlineMemo.compareCode}`;
      return `${state.helperNames.createMemo}(${node.name}, ${propsCode}, (${memoProps}) => ${node.name}(${memoProps})${compareArgument})`;
    }

    return emitComponentCall(
      node.name,
      node.props,
      node.children,
      state,
      node.clientReference === undefined
        ? undefined
        : { moduleId: node.clientReference.moduleId, name: node.name },
    );
  }

  if (node.kind === "fragment") {
    if (node.bodyStatements !== undefined && node.bodyStatements.length > 0) {
      const valueExpression = emitRenderValueExpression(node.children, state);

      return [
        "(() => {",
        ...node.bodyStatements.map((statement) => `  ${statement}`),
        `  return ${valueExpression};`,
        "})()",
      ].join("\n");
    }

    return emitRenderValueExpression(node.children, state);
  }

  if (node.kind === "conditional") {
    return emitConditionalRenderValueExpression(node, state);
  }

  if (node.kind === "list") {
    const parameters = emitListParameters(node);
    const options = emitListOptions(node, parameters);

    return `${state.helperNames.createList}(() => (${node.itemsCode}), ${emitListRenderer(node, parameters, state)}${options})`;
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  const templateName = state.allocateName("_dynamicTemplate");
  const fragmentName = state.allocateName("_dynamicFragment");
  const rootName = state.allocateName("_dynamicRoot");
  const templateHtml = JSON.stringify(renderStaticHtml(node));
  const setup = emitSetup(node, rootName, state);
  const setupLines = setup === "" ? [] : setup.split("\n");

  return [
    "(() => {",
    `  const ${templateName} = ${state.helperNames.createTemplate}(${templateHtml});`,
    `  const ${fragmentName} = ${templateName}();`,
    `  const ${rootName} = ${fragmentName}.firstChild;`,
    ...setupLines,
    `  return ${rootName};`,
    "})()",
  ].join("\n");
}

function isOwnerScopedMemoConditional(
  node: Extract<JsxNodeIr, { kind: "conditional" }>,
  state: EmitSetupState,
): boolean {
  const branches = [node.whenTrue, node.whenFalse];
  return (
    branches.some(
      (branch) =>
        branch.length === 1 &&
        branch[0]?.kind === "component" &&
        state.inlineMemoComponents.has(branch[0].name),
    ) &&
    branches.every(
      (branch) =>
        branch.length === 0 ||
        (branch.length === 1 &&
          branch[0]?.kind === "component" &&
          state.inlineMemoComponents.has(branch[0].name)),
    )
  );
}

function treeUsesOwnerScopedMemo(
  node: JsxNodeIr,
  inlineMemoComponentNames: ReadonlySet<string>,
): boolean {
  if (
    node.kind === "conditional" &&
    isOwnerScopedMemoBranches(node.whenTrue, node.whenFalse, inlineMemoComponentNames)
  ) {
    return true;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some((child) =>
      treeUsesOwnerScopedMemo(child, inlineMemoComponentNames),
    );
  }

  if (node.kind === "list" || node.kind === "element" || node.kind === "fragment") {
    return node.children.some((child) =>
      treeUsesOwnerScopedMemo(child, inlineMemoComponentNames),
    );
  }

  return false;
}

function isOwnerScopedMemoBranches(
  whenTrue: readonly JsxNodeIr[],
  whenFalse: readonly JsxNodeIr[],
  inlineMemoComponentNames: ReadonlySet<string>,
): boolean {
  const branches = [whenTrue, whenFalse];
  return (
    branches.some(
      (branch) =>
        branch.length === 1 &&
        branch[0]?.kind === "component" &&
        inlineMemoComponentNames.has(branch[0].name),
    ) &&
    branches.every(
      (branch) =>
        branch.length === 0 ||
        (branch.length === 1 &&
          branch[0]?.kind === "component" &&
          inlineMemoComponentNames.has(branch[0].name)),
    )
  );
}

function emitConditionalRenderValueExpression(
  node: Extract<JsxNodeIr, { kind: "conditional" }>,
  state: EmitSetupState,
): string {
  const ownerScopedMemo = isOwnerScopedMemoConditional(node, state);
  const whenTrue = emitRenderValueExpression(node.whenTrue, state, ownerScopedMemo);
  const whenFalse = emitRenderValueExpression(node.whenFalse, state, ownerScopedMemo);

  if (node.conditionValueName === undefined) {
    return `((${node.conditionCode}) ? ${whenTrue} : ${whenFalse})`;
  }

  return `(() => { const ${node.conditionValueName} = (${node.conditionCode}); return ${node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`;
}

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  state: EmitSetupState,
): string {
  const valueExpression = emitRenderValueExpression(node.children, state);

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitCompilerKeyedSingleNodeRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  templateName: string,
  state: EmitSetupState,
  eventSlotKeys: readonly string[] | undefined,
): string {
  const root = node.compiledSingleNode?.root;
  if (root === undefined) {
    throw new Error("Missing compiled single-node root.");
  }
  const rootName = state.allocateName("_keyedRoot");
  const eventPrograms = node.compiledSingleNode?.eventPrograms;
  const setup = emitSetup(root, rootName, {
    ...state,
    compilerKeyedEventSlotKeys:
      eventPrograms === undefined || eventSlotKeys === undefined
        ? undefined
        : new Map(
            eventPrograms.map((program, index) => [
              program.eventName,
              eventSlotKeys[index] as string,
            ]),
          ),
    compilerKeyedRowContext: node.itemName,
  });
  const setupLines = setup === "" ? [] : setup.split("\n");
  return [
    `(${node.itemName}) => {`,
    `  const ${rootName} = ${templateName}();`,
    ...setupLines,
    `  return ${rootName};`,
    "}",
  ].join("\n");
}

function emitCompilerKeyedEventPrograms(
  programs: NonNullable<
    Extract<JsxNodeIr, { kind: "list" }>["compiledSingleNode"]
  >["eventPrograms"],
  rowName: string,
  eventSlotKeys: readonly string[],
): string {
  if (programs === undefined) {
    return "[]";
  }

  return `[${programs
    .map(
      (program, programIndex) =>
        `{ type: ${JSON.stringify(program.eventName)}, slotKey: ${eventSlotKeys[programIndex]}, dispatch: (slot, ${rowName}, event, currentTarget) => { switch (slot) { ${program.handlers
          .map((handler, slot) => `case ${slot}: return (${handler}).call(currentTarget, event);`)
          .join(" ")} } } }`,
    )
    .join(", ")}]`;
}

function emitListOptions(node: Extract<JsxNodeIr, { kind: "list" }>, parameters: string): string {
  const optionEntries: string[] = [];

  if (node.keyCode !== undefined) {
    optionEntries.push(`key: (${parameters}) => (${node.keyCode})`);
  }

  if (node.keyCode !== undefined && listReadsNestedItemObject(node, node.itemName)) {
    optionEntries.push("nestedObjectFallback: true");
  }

  return optionEntries.length === 0 ? "" : `, { ${optionEntries.join(", ")} }`;
}

function emitListParameters(node: Extract<JsxNodeIr, { kind: "list" }>): string {
  return [node.itemName, node.indexName, node.arrayName]
    .filter((name): name is string => name !== undefined)
    .join(", ");
}

function emitComponentCall(
  name: string,
  props: ComponentPropIr[],
  children: JsxNodeIr[],
  state: EmitSetupState,
  clientReference?: { moduleId: string; name: string } | undefined,
): string {
  if (
    clientReference !== undefined &&
    state.clientBoundaryHelperName !== undefined &&
    isCompatClientReferenceModuleId(clientReference.moduleId)
  ) {
    return `${state.clientBoundaryHelperName}(${JSON.stringify(clientReference.name)}, ${emitPropsObject(props, children, state)})`;
  }

  return `${name}(${emitPropsObject(props, children, state)})`;
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[],
  state: EmitSetupState,
  reactiveGetters = true,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitRenderValueExpression(prop.children, state)}`;
    }

    if (reactiveGetters && shouldEmitReactiveComponentPropGetter(prop.code)) {
      return `get ${emitGetterPropName(prop.name)}() { return (${prop.code}); }`;
    }

    return `${emitPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(`children: ${emitRenderValueExpression(children, state)}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function emitGetterPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : `[${JSON.stringify(name)}]`;
}

function shouldEmitReactiveComponentPropGetter(code: string): boolean {
  if (!/\.\s*get\s*\(/.test(code)) {
    return false;
  }

  return !/^\s*(?:async\s*)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(code);
}

function createNameAllocator(reservedNames: readonly string[]): NameAllocator {
  const usedNames = new Set(reservedNames);

  return (baseName: string, extraReservedNames: readonly string[] = []): string => {
    const reservedNames = new Set(extraReservedNames);
    let name = baseName;
    let index = 1;

    while (usedNames.has(name) || reservedNames.has(name)) {
      name = `${baseName}$${index}`;
      index += 1;
    }

    usedNames.add(name);
    return name;
  };
}

function isCompatClientReferenceModuleId(moduleId: string): boolean {
  return /\.compat(?:\.mreact)?(?:\.[cm]?[jt]sx?)?$/.test(moduleId);
}

type NameAllocator = (baseName: string, extraReservedNames?: readonly string[]) => string;

function visit(node: JsxNodeIr, fn: (node: JsxNodeIr) => void): void {
  fn(node);

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      visit(child, fn);
    }
  }

  if (node.kind === "list") {
    if (node.compiledSingleNode === undefined) {
      for (const child of node.children) {
        visit(child, fn);
      }
    } else {
      visit(node.compiledSingleNode.root, fn);
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

  // Async-boundary children participate in client-side rendering when the
  // boundary has an awaitId (hydration data path). Traverse them so their
  // runtime imports (bindList / bindText / bindEvent / etc.) are included.
  if (node.kind === "async-boundary") {
    for (const child of node.children) {
      visit(child, fn);
    }
    if (node.placeholderChildren !== undefined) {
      for (const child of node.placeholderChildren) {
        visit(child, fn);
      }
    }
    if (node.catchChildren !== undefined) {
      for (const child of node.catchChildren) {
        visit(child, fn);
      }
    }
  }
}
