import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { rechartsFixtures } from "./fixtures.js";
import { rechartsPublicComponentFeatures } from "./public-features.js";
import type { CompatFixture } from "./types.js";

export type PropCoverageStatus = "vrt_covered" | "interaction_covered" | "debt";
export type PropRiskCategory =
  | "accessibility"
  | "animation"
  | "custom-renderer"
  | "data-domain"
  | "interaction"
  | "layout"
  | "style";

export interface RechartsComponentApi {
  component: string;
  propType: string;
  sourcePath: string;
  props: string[];
}

export interface RechartsPropCoverageRow {
  component: string;
  prop: string;
  riskCategory: PropRiskCategory;
  status: PropCoverageStatus;
  fixtureIds: string[];
}

interface TypeExport {
  exportedName: string;
  sourceName: string;
  modulePath: string;
}

interface ModuleDeclarations {
  declarations: Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>;
  imports: Map<string, { modulePath: string; sourceName: string }>;
}

const labRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(labRoot, "../..");
const rechartsTypesRoot = join(repoRoot, "node_modules", "recharts", "types");
const moduleCache = new Map<string, ModuleDeclarations>();

const categoricalChartComponents = new Set([
  "LineChart",
  "BarChart",
  "PieChart",
  "RadarChart",
  "ScatterChart",
  "AreaChart",
  "RadialBarChart",
  "ComposedChart",
  "FunnelChart",
]);

const propTypeFallbacks = new Map<string, { modulePath: string; sourceName: string }>([
  ["Sankey", { modulePath: "./chart/Sankey", sourceName: "SankeyProps" }],
  ["SunburstChart", { modulePath: "./chart/SunburstChart", sourceName: "SunburstChartProps" }],
]);

const ignoredInheritedPropTypes = new Set([
  "PresentationAttributesAdaptChildEvent",
  "PresentationAttributesWithProps",
]);

export function getRechartsApiSurface(): RechartsComponentApi[] {
  const typeExports = getIndexTypeExports();

  return rechartsPublicComponentFeatures.map((component) => {
    const resolvedType = resolveComponentPropType(component, typeExports);
    const props = extractProps(resolvedType.modulePath, resolvedType.sourceName);

    return {
      component,
      propType: resolvedType.sourceName,
      sourcePath: `${resolvedType.modulePath}.d.ts`,
      props,
    };
  });
}

export function buildRechartsApiCoverage(
  fixtures: CompatFixture[] = rechartsFixtures,
): RechartsPropCoverageRow[] {
  const covered = new Map<string, Map<string, string[]>>();

  for (const fixture of fixtures) {
    for (const [component, props] of Object.entries(fixture.coveredProps ?? {})) {
      const componentCoverage = covered.get(component) ?? new Map<string, string[]>();
      for (const prop of props) {
        const fixtureIds = componentCoverage.get(prop) ?? [];
        fixtureIds.push(fixture.id);
        componentCoverage.set(prop, fixtureIds);
      }
      covered.set(component, componentCoverage);
    }
  }

  return getRechartsApiSurface().flatMap((componentApi) =>
    componentApi.props.map((prop) => {
      const fixtureIds = covered.get(componentApi.component)?.get(prop) ?? [];
      const status =
        fixtureIds.length === 0
          ? "debt"
          : fixtures.some(
                (fixture) => fixtureIds.includes(fixture.id) && (fixture.interactions?.length ?? 0) > 0,
              )
            ? "interaction_covered"
            : "vrt_covered";

      return {
        component: componentApi.component,
        prop,
        riskCategory: classifyPropRisk(prop),
        status,
        fixtureIds,
      };
    }),
  );
}

export function renderApiCoverageMarkdown(fixtures: CompatFixture[] = rechartsFixtures): string {
  const rows = buildRechartsApiCoverage(fixtures);
  const total = rows.length;
  const covered = rows.filter((row) => row.status !== "debt").length;
  const debt = total - covered;
  const byComponent = groupRowsByComponent(rows);
  const byRiskCategory = groupRowsByRiskCategory(rows);

  const componentRows = Array.from(byComponent.entries())
    .map(([component, componentRowsForName]) => {
      const componentCovered = componentRowsForName.filter((row) => row.status !== "debt").length;
      return `| ${component} | ${componentCovered} | ${componentRowsForName.length} | ${componentRowsForName.length - componentCovered} |`;
    })
    .join("\n");

  const debtRows = rows
    .filter((row) => row.status === "debt")
    .slice(0, 200)
    .map((row) => `| ${row.component} | ${row.prop} | ${row.riskCategory} | debt |  |`)
    .join("\n");

  const riskRows = Array.from(byRiskCategory.entries())
    .map(([riskCategory, riskRowsForName]) => {
      const riskCovered = riskRowsForName.filter((row) => row.status !== "debt").length;
      return `| ${riskCategory} | ${riskCovered} | ${riskRowsForName.length} | ${riskRowsForName.length - riskCovered} |`;
    })
    .join("\n");

  return `# Recharts API Coverage

Props are extracted from \`node_modules/recharts/types\` and compared with fixture-declared \`coveredProps\`. Standard React/SVG inherited attributes are intentionally excluded; this ledger tracks Recharts-specific exported props.

Total props: ${total}
Covered props: ${covered}
Coverage debt: ${debt}

## Component Summary

| Component | Covered props | Total props | Debt |
|---|---:|---:|---:|
${componentRows}

## Risk Category Summary

| Risk category | Covered props | Total props | Debt |
|---|---:|---:|---:|
${riskRows}

## Coverage Debt

| Component | Prop | Risk category | Status | Fixture |
|---|---|---|---|---|
${debtRows}
`;
}

function classifyPropRisk(prop: string): PropRiskCategory {
  if (
    prop.startsWith("on") ||
    prop === "trigger" ||
    prop === "active" ||
    prop === "activeDot" ||
    prop === "activeBar" ||
    prop === "activeShape" ||
    prop === "activeIndex" ||
    prop === "cursor"
  ) {
    return "interaction";
  }
  if (prop.toLowerCase().includes("animation") || prop === "animateNewValues") {
    return "animation";
  }
  if (
    prop === "content" ||
    prop === "formatter" ||
    prop === "labelFormatter" ||
    prop === "tickFormatter" ||
    prop === "shape" ||
    prop === "dot" ||
    prop === "tick" ||
    prop === "label" ||
    prop === "labelLine" ||
    prop === "valueAccessor"
  ) {
    return "custom-renderer";
  }
  if (
    prop.toLowerCase().includes("radius") ||
    prop.toLowerCase().includes("width") ||
    prop.toLowerCase().includes("height") ||
    prop === "layout" ||
    prop === "margin" ||
    prop === "padding" ||
    prop === "position" ||
    prop === "offset" ||
    prop === "angle" ||
    prop === "cx" ||
    prop === "cy" ||
    prop === "x" ||
    prop === "y"
  ) {
    return "layout";
  }
  if (
    prop.toLowerCase().includes("data") ||
    prop.toLowerCase().includes("domain") ||
    prop === "scale" ||
    prop === "ticks" ||
    prop === "range" ||
    prop === "syncId" ||
    prop === "syncMethod"
  ) {
    return "data-domain";
  }
  if (prop === "accessibilityLayer" || prop === "role" || prop === "tabIndex" || prop === "rootTabIndex") {
    return "accessibility";
  }

  return "style";
}

function getIndexTypeExports(): TypeExport[] {
  const indexPath = join(rechartsTypesRoot, "index.d.ts");
  const source = readSourceFile(indexPath);
  const exports: TypeExport[] = [];

  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.isTypeOnly &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      for (const element of statement.exportClause.elements) {
        exports.push({
          exportedName: element.name.text,
          sourceName: element.propertyName?.text ?? element.name.text,
          modulePath: statement.moduleSpecifier.text,
        });
      }
    }
  }

  return exports;
}

function resolveComponentPropType(
  component: string,
  typeExports: TypeExport[],
): { modulePath: string; sourceName: string } {
  if (categoricalChartComponents.has(component)) {
    return { modulePath: "./chart/generateCategoricalChart", sourceName: "CategoricalChartProps" };
  }

  const fallback = propTypeFallbacks.get(component);
  if (fallback !== undefined) {
    return fallback;
  }

  const exportedName = component === "Symbols" ? "SymbolsProps" : `${component}Props`;
  const match = typeExports.find((typeExport) => typeExport.exportedName === exportedName);
  if (match === undefined) {
    return { modulePath: "./index", sourceName: exportedName };
  }

  return { modulePath: match.modulePath, sourceName: match.sourceName };
}

function extractProps(modulePath: string, typeName: string): string[] {
  const props = Array.from(collectProps(typeName, normalizeModulePath(modulePath), new Set())).sort();

  return props.filter((prop) => !prop.startsWith("_"));
}

function readSourceFile(filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);
}

function loadModule(modulePath: string): ModuleDeclarations {
  const normalizedPath = normalizeModulePath(modulePath);
  const cached = moduleCache.get(normalizedPath);
  if (cached !== undefined) {
    return cached;
  }

  const filePath = join(rechartsTypesRoot, `${normalizedPath}.d.ts`);
  const source = readSourceFile(filePath);
  const moduleDeclarations = {
    declarations: collectDeclarations(source),
    imports: collectImports(source, normalizedPath),
  };
  moduleCache.set(normalizedPath, moduleDeclarations);

  return moduleDeclarations;
}

function collectDeclarations(
  source: ts.SourceFile,
): Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration> {
  const declarations = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();

  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    }
  }

  return declarations;
}

function collectImports(
  source: ts.SourceFile,
  currentModulePath: string,
): Map<string, { modulePath: string; sourceName: string }> {
  const imports = new Map<string, { modulePath: string; sourceName: string }>();

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".") &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        imports.set(element.name.text, {
          modulePath: resolveModulePath(currentModulePath, statement.moduleSpecifier.text),
          sourceName: element.propertyName?.text ?? element.name.text,
        });
      }
    }
  }

  return imports;
}

function collectProps(
  typeName: string,
  modulePath: string,
  seen: Set<string>,
): Set<string> {
  const seenKey = `${modulePath}:${typeName}`;
  if (seen.has(seenKey)) {
    return new Set();
  }
  seen.add(seenKey);

  const { declarations, imports } = loadModule(modulePath);
  const declaration = declarations.get(typeName);
  if (declaration === undefined) {
    const imported = imports.get(typeName);
    if (imported !== undefined) {
      return collectProps(imported.sourceName, imported.modulePath, seen);
    }
    return new Set();
  }

  if (ts.isInterfaceDeclaration(declaration)) {
    return collectInterfaceProps(declaration, modulePath, seen);
  }

  return collectTypeNodeProps(declaration.type, modulePath, seen);
}

function collectInterfaceProps(
  declaration: ts.InterfaceDeclaration,
  modulePath: string,
  seen: Set<string>,
): Set<string> {
  const props = new Set<string>();

  for (const member of declaration.members) {
    const prop = propName(member);
    if (prop !== undefined) {
      props.add(prop);
    }
  }

  for (const heritage of declaration.heritageClauses ?? []) {
    for (const type of heritage.types) {
      const expression = type.expression;
      if (ts.isIdentifier(expression)) {
        for (const prop of collectProps(expression.text, modulePath, seen)) {
          props.add(prop);
        }
      }
    }
  }

  return props;
}

function collectTypeNodeProps(
  node: ts.TypeNode,
  modulePath: string,
  seen: Set<string>,
): Set<string> {
  if (ts.isTypeLiteralNode(node)) {
    return collectTypeLiteralProps(node);
  }

  if (ts.isIntersectionTypeNode(node)) {
    const props = new Set<string>();
    for (const type of node.types) {
      for (const prop of collectTypeNodeProps(type, modulePath, seen)) {
        props.add(prop);
      }
    }
    return props;
  }

  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    if (ignoredInheritedPropTypes.has(node.typeName.text)) {
      return new Set();
    }
    return collectProps(node.typeName.text, modulePath, seen);
  }

  return new Set();
}

function normalizeModulePath(modulePath: string): string {
  return modulePath.replace(/^\.\//, "");
}

function resolveModulePath(currentModulePath: string, importPath: string): string {
  if (!importPath.startsWith(".")) {
    return importPath;
  }

  return resolve("/", currentModulePath, "..", importPath).replace(/^\//, "");
}

function collectTypeLiteralProps(node: ts.TypeLiteralNode): Set<string> {
  const props = new Set<string>();
  for (const member of node.members) {
    const prop = propName(member);
    if (prop !== undefined) {
      props.add(prop);
    }
  }
  return props;
}

function propName(member: ts.TypeElement | ts.ClassElement): string | undefined {
  if (
    (ts.isPropertySignature(member) || ts.isMethodSignature(member)) &&
    member.name !== undefined
  ) {
    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
      return member.name.text;
    }
  }

  return undefined;
}

function groupRowsByComponent(
  rows: RechartsPropCoverageRow[],
): Map<string, RechartsPropCoverageRow[]> {
  const grouped = new Map<string, RechartsPropCoverageRow[]>();
  for (const row of rows) {
    grouped.set(row.component, [...(grouped.get(row.component) ?? []), row]);
  }
  return grouped;
}

function groupRowsByRiskCategory(
  rows: RechartsPropCoverageRow[],
): Map<PropRiskCategory, RechartsPropCoverageRow[]> {
  const grouped = new Map<PropRiskCategory, RechartsPropCoverageRow[]>();
  for (const row of rows) {
    grouped.set(row.riskCategory, [...(grouped.get(row.riskCategory) ?? []), row]);
  }
  return grouped;
}
