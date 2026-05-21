import type {
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport } from "./types.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitClient(ir: ModuleIr): EmitResult {
  const imports = collectImports(ir);
  const helperNames = allocateRuntimeHelperNames(ir, imports[0]?.specifiers ?? []);
  const importLine =
    imports[0]?.specifiers.length === 0 ? "" : emitRuntimeImportLine(imports, helperNames);
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(ir);
  const moduleAllocator = createNameAllocator([]);
  const components = ir.components
    .map((component) => emitComponent(component, moduleAllocator, helperNames))
    .join("\n\n");

  return {
    code: `${[importLine, userImports, moduleStatements].filter(Boolean).join("\n")}\n\n${components}\n`,
    imports,
  };
}

type RuntimeHelperName =
  | "bindList"
  | "bindEvent"
  | "bindProp"
  | "bindSpreadProps"
  | "bindText"
  | "createTemplate"
  | "insertDynamic";

type RuntimeHelperNames = Record<RuntimeHelperName, string>;

function allocateRuntimeHelperNames(
  ir: ModuleIr,
  specifiers: readonly string[],
): RuntimeHelperNames {
  const allocator = createNameAllocator([
    ...ir.moduleBindingNames,
    ...ir.components.flatMap((component) => [
      component.name,
      component.exportName,
      ...component.bindingNames,
    ]),
  ]);
  const helperNames: RuntimeHelperNames = {
    bindList: "bindList",
    bindEvent: "bindEvent",
    bindProp: "bindProp",
    bindSpreadProps: "bindSpreadProps",
    bindText: "bindText",
    createTemplate: "createTemplate",
    insertDynamic: "insertDynamic",
  };

  for (const specifier of specifiers) {
    const helper = specifier as RuntimeHelperName;

    if (ir.moduleBindingNames.includes(helper)) {
      helperNames[helper] = allocator(`_${helper}`);
    }
  }

  return helperNames;
}

function emitRuntimeImportLine(
  imports: RuntimeImport[],
  helperNames: RuntimeHelperNames,
): string {
  const specifiers = imports[0]?.specifiers ?? ["createTemplate"];
  const importedNames = specifiers.map((specifier) => {
    const helper = specifier as RuntimeHelperName;
    const localName = helperNames[helper];

    return localName === specifier ? specifier : `${specifier} as ${localName}`;
  });

  return `import { ${importedNames.join(", ")} } from "@reckona/mreact-reactive-dom";`;
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

  for (const component of ir.components) {
    visit(component.root, (node) => {
      if (node.kind === "expr") {
        specifiers.add(
          node.renderMode === "dynamic" ? "insertDynamic" : "bindText",
        );
      }

      if (node.kind === "conditional") {
        specifiers.add("insertDynamic");
      }

      if (node.kind === "list") {
        specifiers.add("bindList");
      }

      if (node.kind === "element") {
        for (const attr of node.attributes) {
          if (attr.kind === "dynamic-attr") {
            specifiers.add("bindProp");
          }

          if (attr.kind === "spread-attr") {
            specifiers.add("bindSpreadProps");
          }

          if (attr.kind === "event") {
            specifiers.add("bindEvent");
          }
        }
      }
    });
  }

  return [
    {
      source: "@reckona/mreact-reactive-dom",
      specifiers: Array.from(specifiers).sort(),
    },
  ];
}

function emitComponent(
  component: ComponentIr,
  moduleAllocator: NameAllocator,
  helperNames: RuntimeHelperNames,
): string {
  const templateName = moduleAllocator(
    "_tmpl_" + component.name,
    component.bindingNames,
  );
  const allocator = createNameAllocator([...component.bindingNames, templateName]);
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");

  if (component.root.kind === "component") {
    const state = { allocateName: allocator, textIndex: 0, helperNames };
    return [
      `${component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
      ...body,
      `  return ${emitComponentCall(component.root.name, component.root.props, component.root.children, state)};`,
      `}`,
    ].join("\n");
  }

  if (component.root.kind === "conditional") {
    const state = { allocateName: allocator, textIndex: 0, helperNames };
    const fragmentName = allocator("_fragment");
    const markerName = allocator("_marker");
    return [
      `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
      ...body,
      `  const ${fragmentName} = document.createDocumentFragment();`,
      `  const ${markerName} = document.createComment("");`,
      `  ${fragmentName}.append(${markerName});`,
      `  ${helperNames.insertDynamic}(${fragmentName}, ${markerName}, () => ${emitNodeRenderValueExpression(component.root, state)});`,
      `  return ${fragmentName};`,
      `}`,
    ].join("\n");
  }

  const fragmentName = allocator("_fragment");
  const rootName = allocator("_root");
  const templateHtml = escapeTemplateHtml(renderStaticHtml(component.root));
  const setup = emitSetup(component.root, rootName, {
    allocateName: allocator,
    textIndex: 0,
    helperNames,
  });
  return [
    `const ${templateName} = ${helperNames.createTemplate}("${templateHtml}");`,
    `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
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
    return node.children.map(renderStaticHtml).join("");
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
  const children = node.children.map(renderStaticHtml).join("");

  return `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
}

interface EmitSetupState {
  allocateName: (baseName: string) => string;
  textIndex: number;
  helperNames: RuntimeHelperNames;
}

function emitSetup(
  node: JsxNodeIr,
  path: string,
  state: EmitSetupState,
): string {
  const lines: string[] = [];

  if (
    node.kind !== "element" &&
    node.kind !== "fragment" &&
    node.kind !== "component"
  ) {
    return "";
  }

  if (node.kind === "component") {
    const componentVar = state.allocateName("_component");
    lines.push(
      `  const ${componentVar} = ${emitComponentCall(node.name, node.props, node.children, state)};`,
    );
    lines.push(
      `  ${path}.replaceWith(${componentVar});`,
    );
    return lines.join("\n");
  }

  if (node.kind === "element") {
    for (const attr of node.attributes) {
      if (attr.kind === "dynamic-attr") {
        lines.push(
          `  ${state.helperNames.bindProp}(${path}, "${attr.name}", () => (${attr.code}));`,
        );
      }

      if (attr.kind === "spread-attr") {
        lines.push(
          `  ${state.helperNames.bindSpreadProps}(${path}, () => (${attr.code}));`,
        );
      }

      if (attr.kind === "event") {
        lines.push(
          `  ${state.helperNames.bindEvent}(${path}, "${attr.eventName}", ${attr.code});`,
        );
      }
    }
  }

  const children = node.children;
  const stableChildrenName = hasLiveChildListMutation(children)
    ? state.allocateName("_children")
    : undefined;
  let childIndex = 0;

  if (stableChildrenName !== undefined) {
    lines.push(`  const ${stableChildrenName} = Array.from(${path}.childNodes);`);
  }

  for (const child of children) {
    if (child.kind === "text") {
      childIndex += 1;
      continue;
    }

    const childPath = stableChildrenName === undefined || usesLiveInsertionAnchor(child)
      ? `${path}.childNodes[${childIndex}]`
      : `${stableChildrenName}[${childIndex}]`;

    if (child.kind === "expr") {
      if (child.renderMode === "dynamic") {
        lines.push(
          `  ${state.helperNames.insertDynamic}(${path}, ${childPath}, () => (${child.code}));`,
        );
        childIndex += 1;
        continue;
      }

      const textVar = state.allocateName(`_text_${state.textIndex}`);
      state.textIndex += 1;
      lines.push(`  const ${textVar} = document.createTextNode("");`);
      lines.push(`  ${childPath}.replaceWith(${textVar});`);
      lines.push(
        `  ${state.helperNames.bindText}(${textVar}, () => (${child.code}));`,
      );
      childIndex += 1;
      continue;
    }

    if (child.kind === "conditional") {
      lines.push(
        `  ${state.helperNames.insertDynamic}(${path}, ${childPath}, () => (${child.conditionCode}) ? ${emitRenderValueExpression(child.whenTrue, state)} : ${emitRenderValueExpression(child.whenFalse, state)});`,
      );
      childIndex += 1;
      continue;
    }

    if (child.kind === "list") {
      const parameters =
        child.indexName === undefined
          ? child.itemName
          : `${child.itemName}, ${child.indexName}`;
      const options =
        child.keyCode === undefined
          ? ""
          : `, { key: (${parameters}) => (${child.keyCode}) }`;
      lines.push(
        `  ${state.helperNames.bindList}(${path}, ${childPath}, () => (${child.itemsCode}), ${emitListRenderer(child, parameters, state)}${options});`,
      );
      childIndex += 1;
      continue;
    }

    if (child.kind === "async-boundary") {
      lines.push(emitAsyncBoundarySetup(child, childPath, state));
      childIndex += 1;
      continue;
    }

    lines.push(emitSetup(child, childPath, state));
    childIndex += 1;
  }

  return lines.filter(Boolean).join("\n");
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

function emitRenderValueExpression(
  children: JsxNodeIr[],
  state: EmitSetupState,
): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitNodeRenderValueExpression(children[0] as JsxNodeIr, state);
  }

  return `[${children
    .map((child) => emitNodeRenderValueExpression(child, state))
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
): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "component") {
    return emitComponentCall(node.name, node.props, node.children, state);
  }

  if (node.kind === "fragment") {
    return emitRenderValueExpression(node.children, state);
  }

  if (node.kind === "conditional") {
    return `((${node.conditionCode}) ? ${emitRenderValueExpression(node.whenTrue, state)} : ${emitRenderValueExpression(node.whenFalse, state)})`;
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return `(${node.itemsCode}).map(${emitListRenderer(node, parameters, state)})`;
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  const templateName = state.allocateName("_dynamicTemplate");
  const fragmentName = state.allocateName("_dynamicFragment");
  const rootName = state.allocateName("_dynamicRoot");
  const templateHtml = escapeTemplateHtml(renderStaticHtml(node));
  const setup = emitSetup(node, rootName, state);
  const setupLines = setup === "" ? [] : setup.split("\n");

  return [
    "(() => {",
    `  const ${templateName} = ${state.helperNames.createTemplate}("${templateHtml}");`,
    `  const ${fragmentName} = ${templateName}();`,
    `  const ${rootName} = ${fragmentName}.firstChild;`,
    ...setupLines,
    `  return ${rootName};`,
    "})()",
  ].join("\n");
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

function emitComponentCall(
  name: string,
  props: ComponentPropIr[],
  children: JsxNodeIr[],
  state: EmitSetupState,
): string {
  return `${name}(${emitPropsObject(props, children, state)})`;
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[],
  state: EmitSetupState,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitRenderValueExpression(prop.children, state)}`;
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

function createNameAllocator(
  reservedNames: readonly string[],
): NameAllocator {
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

type NameAllocator = (
  baseName: string,
  extraReservedNames?: readonly string[],
) => string;

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

function escapeTemplateHtml(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
