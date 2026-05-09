import type {
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitClient(ir: ModuleIr): EmitResult {
  const imports = collectImports(ir);
  const importLine = `import { ${
    imports[0]?.specifiers.join(", ") ?? "createTemplate"
  } } from "@modular-react/reactive-dom";`;
  const components = ir.components.map(emitComponent).join("\n\n");

  return {
    code: `${importLine}\n\n${components}\n`,
    imports,
  };
}

function collectImports(ir: ModuleIr): RuntimeImport[] {
  const specifiers = new Set<string>(["createTemplate"]);

  for (const component of ir.components) {
    visit(component.root, (node) => {
      if (node.kind === "expr") {
        specifiers.add("bindText");
      }

      if (node.kind === "element") {
        for (const attr of node.attributes) {
          if (attr.kind === "dynamic-attr") {
            specifiers.add("bindProp");
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
      source: "@modular-react/reactive-dom",
      specifiers: Array.from(specifiers).sort(),
    },
  ];
}

function emitComponent(component: ComponentIr): string {
  const templateHtml = escapeTemplateHtml(renderStaticHtml(component.root));
  const setup = emitSetup(component.root, "_root", { textIndex: 0 });
  const body = component.bodyStatements.map((statement) => `  ${statement}`);

  return [
    `const _tmpl_${component.name} = createTemplate("${templateHtml}");`,
    `export function ${component.name}() {`,
    ...body,
    `  const _fragment = _tmpl_${component.name}();`,
    `  const _root = _fragment.firstChild;`,
    setup,
    `  return _root;`,
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

  if (node.kind === "fragment") {
    return node.children.map(renderStaticHtml).join("");
  }

  const attrs = node.attributes
    .filter((attr) => attr.kind === "static-attr")
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join("");
  const children = node.children.map(renderStaticHtml).join("");

  return `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
}

interface EmitSetupState {
  textIndex: number;
}

function emitSetup(
  node: JsxNodeIr,
  path: string,
  state: EmitSetupState,
): string {
  const lines: string[] = [];

  if (node.kind !== "element" && node.kind !== "fragment") {
    return "";
  }

  if (node.kind === "element") {
    for (const attr of node.attributes) {
      if (attr.kind === "dynamic-attr") {
        lines.push(`  bindProp(${path}, "${attr.name}", () => (${attr.code}));`);
      }

      if (attr.kind === "event") {
        lines.push(`  bindEvent(${path}, "${attr.eventName}", ${attr.code});`);
      }
    }
  }

  const children = node.children;
  let childIndex = 0;

  for (const child of children) {
    if (child.kind === "text") {
      childIndex += 1;
      continue;
    }

    const childPath = `${path}.childNodes[${childIndex}]`;

    if (child.kind === "expr") {
      const textVar = `_text_${state.textIndex}`;
      state.textIndex += 1;
      lines.push(`  const ${textVar} = document.createTextNode("");`);
      lines.push(`  ${childPath}.replaceWith(${textVar});`);
      lines.push(`  bindText(${textVar}, () => (${child.code}));`);
      childIndex += 1;
      continue;
    }

    lines.push(emitSetup(child, childPath, state));
    childIndex += 1;
  }

  return lines.filter(Boolean).join("\n");
}

function visit(node: JsxNodeIr, fn: (node: JsxNodeIr) => void): void {
  fn(node);

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      visit(child, fn);
    }
  }
}

function escapeTemplateHtml(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
