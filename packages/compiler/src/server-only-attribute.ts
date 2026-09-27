import { parseSync } from "oxc-parser";
import type { JsxNodeIr, ModuleIr } from "./ir.js";
import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

/** @internal Proves that evaluating one imported module can only create one primitive string export. */
export function isPureSingleStringExport(source: string, exportedName: string): boolean {
  const parsed = parseSync("server-only-attribute.ts", source, {
    astType: "ts",
    lang: "ts",
    sourceType: "module",
  });
  if (parsed.errors.length !== 0) return false;

  const program = readObject(parsed.program);
  const body = readArray(program.body);
  if (readArray(program.directives).length !== 0 || body.length !== 1) return false;

  const statement = readObject(body[0]);
  const declaration = readObject(statement.declaration);
  if (
    statement.type !== "ExportNamedDeclaration" ||
    (statement.source !== null && statement.source !== undefined) ||
    declaration.type !== "VariableDeclaration" ||
    declaration.kind !== "const"
  ) {
    return false;
  }

  const declarators = readArray(declaration.declarations);
  if (declarators.length !== 1) return false;
  const declarator = readObject(declarators[0]);
  const id = readObject(declarator.id);
  const initializer = unwrapOxcParentheses(readObject(declarator.init));
  return (
    id.type === "Identifier" &&
    id.name === exportedName &&
    initializer.type === "Literal" &&
    typeof initializer.value === "string"
  );
}

/** @internal Removes one proven SSR-only title dependency from the attach view of a route IR. */
export function eraseServerOnlyTitleImport(
  ir: ModuleIr,
  localName: string,
  importStatement: string,
): ModuleIr | undefined {
  if (
    ir.userImports.length !== 2 ||
    ir.userImports.filter((statement) => statement === importStatement).length !== 1 ||
    ir.components.length !== 1
  ) {
    return undefined;
  }

  const userImports = ir.userImports.filter((statement) => statement !== importStatement);
  if (userImports[0] !== 'import { cell } from "@reckona/mreact-reactive-core";') {
    return undefined;
  }

  let replacements = 0;
  let escaped = false;
  const escapedLocalName = localName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const mentionsName = (code: string) =>
    new RegExp(`(?:^|[^.\\w$])${escapedLocalName}(?![\\w$])`, "u").test(code);
  const visit = (node: JsxNodeIr): JsxNodeIr => {
    if (node.kind === "element") {
      if (node.keyCode !== undefined && mentionsName(node.keyCode)) escaped = true;
      return {
        ...node,
        attributes: node.attributes.map((attribute) => {
          if (
            attribute.kind === "dynamic-attr" &&
            attribute.name === "title" &&
            attribute.code === localName &&
            attribute.serialization === undefined &&
            attribute.omitServerRenderValue !== true
          ) {
            replacements += 1;
            return { kind: "static-attr" as const, name: "title", value: "" };
          }
          if ("code" in attribute && mentionsName(attribute.code)) escaped = true;
          return attribute;
        }),
        children: node.children.map(visit),
      };
    }
    if ("code" in node && mentionsName(node.code)) escaped = true;
    return node;
  };

  const component = ir.components[0]!;
  const root = visit(component.root);
  if (replacements !== 1 || escaped) return undefined;

  return {
    ...ir,
    components: [{ ...component, root }],
    userImports,
  };
}
