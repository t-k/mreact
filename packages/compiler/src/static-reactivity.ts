import { parseSync } from "oxc-parser";
import type { ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

/** Proves the narrow route shape whose cell updates are fully served by direct text subscriptions. */
export function hasClosedDirectCellTextRoute(ir: ModuleIr): boolean {
  if (ir.components.length !== 1) {
    return false;
  }

  const component = ir.components[0];
  if (
    component === undefined ||
    component.exportDefault !== true ||
    component.async === true ||
    component.reassigned === true ||
    component.parameters.length !== 0 ||
    component.bodyStatements.length !== 1
  ) {
    return false;
  }

  const cellName = singleLiteralCellName(component);
  if (cellName === undefined) {
    return false;
  }

  const reads = { count: 0 };
  return hasOnlyDirectCellText(component.root, cellName, reads) && reads.count > 0;
}

function singleLiteralCellName(component: ComponentIr): string | undefined {
  const statement = component.bodyStatements[0];
  const name = component.bindingNames[0];
  if (statement === undefined || name === undefined || component.bindingNames.length !== 1) {
    return undefined;
  }

  const prefix = `const ${name} = cell(`;
  if (!statement.startsWith(prefix) || !statement.endsWith(");")) {
    return undefined;
  }

  const literal = statement.slice(prefix.length, -2);
  const value = Number(literal);
  return Number.isSafeInteger(value) && String(value) === literal ? name : undefined;
}

function hasOnlyDirectCellText(
  node: JsxNodeIr,
  cellName: string,
  reads: { count: number },
): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    const value = node.facts?.value;
    if (
      node.renderMode !== undefined ||
      value?.kind !== "native-cell-read" ||
      value.binding.name !== cellName
    ) {
      return false;
    }
    reads.count += 1;
    return true;
  }

  if (node.kind !== "element" || node.namespace === "svg") {
    return false;
  }

  return (
    node.attributes.every(
      (attribute) =>
        attribute.kind === "static-attr" ||
        (attribute.kind === "event" && isArrowEventHandler(attribute.code)),
    ) && node.children.every((child) => hasOnlyDirectCellText(child, cellName, reads))
  );
}

function isArrowEventHandler(code: string): boolean {
  const parsed = parseSync("closed-cell-event.tsx", `const handler = ${code};`, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });
  if (parsed.errors.length !== 0) {
    return false;
  }

  const declaration = readArray(
    readObject(readArray(readObject(parsed.program).body)[0]).declarations,
  )[0];
  const initializer = unwrapOxcParentheses(readObject(readObject(declaration).init));
  return initializer.type === "ArrowFunctionExpression";
}

const parserStableTags = new Set([
  "article",
  "button",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "label",
  "main",
  "output",
  "p",
  "section",
  "span",
  "strong",
]);
const parserStableContainers = new Set(["article", "div", "main", "section"]);

interface AttachTarget {
  path: number[];
  tagName?: string;
  text?: true;
  events?: Array<{ name: string; code: string }>;
}

/** Emits the narrow attach entry for a fixed, parser-stable HTML route. */
export function emitClosedDirectCellAttachRoute(ir: ModuleIr): string | undefined {
  if (!hasClosedDirectCellTextRoute(ir)) {
    return undefined;
  }

  if (
    ir.userImports.length !== 1 ||
    ir.userImports[0] !== 'import { cell } from "@reckona/mreact-reactive-core";' ||
    ir.moduleStatements.some(
      (statement) =>
        statement !== "export const clientNavigation = false;" &&
        statement !== "const clientNavigation = false;",
    )
  ) {
    return undefined;
  }

  const component = ir.components[0]!;
  const cellName = component.bindingNames[0]!;
  const targets: AttachTarget[] = [];
  if (!collectAttachTargets(component.root, [], targets)) {
    return undefined;
  }

  const validation = targets.map((target, index) => {
    const path = target.path.map((childIndex) => `?.childNodes[${childIndex}]`).join("");
    const name = `_target${index}`;
    const expected =
      target.text === true
        ? `${name}?.nodeType !== 3`
        : `${name}?.nodeType !== 1 || ${name}.localName !== ${JSON.stringify(target.tagName)}`;
    return `  const ${name} = marker.firstChild${path};\n  if (${expected}) return false;`;
  });
  const bindings = targets.flatMap((target, index) => [
    ...(target.text === true ? [`  bindCellText(_target${index}, ${cellName});`] : []),
    ...(target.events ?? []).map(
      (event) => `  bindEvent(_target${index}, ${JSON.stringify(event.name)}, ${event.code});`,
    ),
  ]);
  const needsEvent = targets.some((target) => (target.events?.length ?? 0) > 0);
  return [
    ir.userImports[0],
    'import { bindCellText } from "@reckona/mreact-reactive-dom/internal";',
    ...(needsEvent ? ['import { bindEvent } from "@reckona/mreact-reactive-dom";'] : []),
    "function __mreactAttachRoute(marker) {",
    ...validation,
    `  ${component.bodyStatements[0]}`,
    ...bindings,
    "  return true;",
    "}",
  ].join("\n");
}

function collectAttachTargets(node: JsxNodeIr, path: number[], targets: AttachTarget[]): boolean {
  if (
    node.kind !== "element" ||
    node.namespace === "svg" ||
    !parserStableTags.has(node.tagName) ||
    node.keyCode !== undefined ||
    (!parserStableContainers.has(node.tagName) &&
      node.children.some((child) => child.kind === "element"))
  ) {
    return false;
  }

  const events = node.attributes.flatMap((attribute) => {
    if (attribute.kind !== "event") return [];
    if (attribute.code.includes("<") || attribute.compilerKeyedSlot !== undefined) return [];
    return [{ name: attribute.eventName, code: attribute.code }];
  });
  if (events.length !== node.attributes.filter((attribute) => attribute.kind === "event").length) {
    return false;
  }
  const targetStart = targets.length;

  if (node.children.some((child) => child.kind !== "element") && node.children.length !== 1) {
    return false;
  }

  for (const [index, child] of node.children.entries()) {
    if (child.kind === "expr") {
      targets.push({ path: [...path, index], text: true });
    } else if (child.kind === "element") {
      if (!collectAttachTargets(child, [...path, index], targets)) return false;
    } else if (child.kind !== "text") {
      return false;
    }
  }
  if (events.length > 0 || targets.length > targetStart) {
    targets.splice(targetStart, 0, {
      path,
      tagName: node.tagName,
      ...(events.length === 0 ? {} : { events }),
    });
  }
  return true;
}
