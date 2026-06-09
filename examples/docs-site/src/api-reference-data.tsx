import apiProjectJson from "./generated/api-reference.json" with { type: "json" };
import { sitePath } from "./site-path.js";

const enum TypeDocKind {
  Project = 1,
  Module = 2,
  Namespace = 4,
  Variable = 32,
  Function = 64,
  Interface = 256,
  Property = 1024,
  Method = 2048,
  CallSignature = 4096,
  TypeAlias = 2097152,
  Reference = 4194304,
}

interface TypeDocGroup {
  readonly children?: readonly number[];
  readonly title: string;
}

interface TypeDocReflection {
  readonly children?: readonly TypeDocReflection[];
  readonly defaultValue?: string;
  readonly flags?: {
    readonly isConst?: boolean;
    readonly isOptional?: boolean;
    readonly isRest?: boolean;
    readonly isStatic?: boolean;
  };
  readonly groups?: readonly TypeDocGroup[];
  readonly id: number;
  readonly kind: number;
  readonly name: string;
  readonly parameters?: readonly TypeDocReflection[];
  readonly readme?: readonly TypeDocCommentPart[];
  readonly signatures?: readonly TypeDocReflection[];
  readonly sources?: readonly TypeDocSource[];
  readonly target?: number;
  readonly type?: TypeDocType;
  readonly typeParameters?: readonly TypeDocReflection[];
}

interface TypeDocProject extends TypeDocReflection {
  readonly packageVersion?: string;
  readonly schemaVersion?: string;
}

interface TypeDocSource {
  readonly fileName: string;
  readonly line: number;
  readonly url?: string;
}

interface TypeDocCommentPart {
  readonly kind?: string;
  readonly text?: string;
}

interface TypeDocType {
  readonly asserts?: boolean;
  readonly checkType?: TypeDocType;
  readonly declaration?: TypeDocReflection;
  readonly element?: TypeDocType;
  readonly elements?: readonly TypeDocType[];
  readonly elementType?: TypeDocType;
  readonly extendsType?: TypeDocType;
  readonly falseType?: TypeDocType;
  readonly head?: string;
  readonly indexType?: TypeDocType;
  readonly isOptional?: boolean;
  readonly name?: string;
  readonly objectType?: TypeDocType;
  readonly operator?: string;
  readonly parameter?: string;
  readonly parameterType?: TypeDocType;
  readonly queryType?: TypeDocType;
  readonly tail?: readonly (readonly [TypeDocType, string])[];
  readonly target?: number | { readonly qualifiedName?: string };
  readonly targetType?: TypeDocType;
  readonly templateType?: TypeDocType;
  readonly trueType?: TypeDocType;
  readonly type: string;
  readonly typeArguments?: readonly TypeDocType[];
  readonly types?: readonly TypeDocType[];
  readonly value?: boolean | number | string | null;
}

interface ApiModule {
  readonly displayName: string;
  readonly entries: readonly ApiEntry[];
  readonly entrySeparator: "." | "..";
  readonly node: TypeDocReflection;
  readonly packageName: string;
  readonly path: readonly string[];
  readonly slug: string;
}

interface ApiEntry {
  readonly kindLabel: string;
  readonly node: TypeDocReflection;
  readonly module: ApiModule;
  readonly path: readonly string[];
}

export type ApiPage =
  | {
      readonly kind: "index";
      readonly modules: readonly ApiModule[];
      readonly packageSummaries: readonly ApiPackageSummary[];
      readonly title: string;
    }
  | {
      readonly entryGroups: readonly ApiEntryGroup[];
      readonly kind: "module";
      readonly module: ApiModule;
      readonly title: string;
    }
  | {
      readonly entry: ApiEntry;
      readonly kind: "entry";
      readonly title: string;
    };

interface ApiPackageSummary {
  readonly entryCount: number;
  readonly modules: readonly ApiModule[];
  readonly name: string;
}

interface ApiEntryGroup {
  readonly entries: readonly ApiEntry[];
  readonly title: string;
}

const apiProject = apiProjectJson as TypeDocProject;
const apiModules = buildApiModules(apiProject);
const apiEntries = apiModules.flatMap((module) => module.entries);
const apiPagesByPath = new Map<string, ApiPage>([
  ...apiModules.map((module) => [
    module.path.join("/"),
    {
      entryGroups: groupEntries(module.entries),
      kind: "module" as const,
      module,
      title: module.displayName,
    },
  ] as const),
  ...apiEntries.map((entry) => [
    entry.path.join("/"),
    {
      entry,
      kind: "entry" as const,
      title: `${entry.node.name} | ${entry.module.displayName}`,
    },
  ] as const),
]);

export function apiReferenceIndexPage(): ApiPage {
  return {
    kind: "index",
    modules: apiModules,
    packageSummaries: summarizePackages(apiModules),
    title: "API Reference",
  };
}

export function apiPageForPath(path: readonly string[]): ApiPage | undefined {
  return apiPagesByPath.get(path.join("/"));
}

export function allApiPagePaths(): Array<{ apiPath: string[] }> {
  return [...apiPagesByPath.keys()].map((path) => ({ apiPath: path.split("/") }));
}

export function apiLinkForEntry(entry: ApiEntry): string {
  return sitePath(`api/${entry.path.join("/")}`);
}

export function ApiReferencePage(props: { readonly page: ApiPage }) {
  return (
    <article class="doc-article api-reference">
      <p class="eyebrow">Reference</p>
      {props.page.kind === "index" ? <ApiIndex page={props.page} /> : undefined}
      {props.page.kind === "module" ? <ApiModuleView page={props.page} /> : undefined}
      {props.page.kind === "entry" ? <ApiEntryView page={props.page} /> : undefined}
    </article>
  );
}

function ApiIndex(props: { readonly page: Extract<ApiPage, { readonly kind: "index" }> }) {
  return (
    <>
      <h1>{props.page.title}</h1>
      <p>
        Browse exported APIs by package. Use these pages when you need exact function signatures,
        option shapes, return types, or source links.
      </p>
      <div class="api-summary-grid">
        {props.page.packageSummaries.map((summary) => (
          <section class="api-summary-card" key={summary.name}>
            <h2>{summary.name}</h2>
            <p>
              {summary.entryCount} exports across {summary.modules.length}{" "}
              {summary.modules.length === 1 ? "module" : "modules"}.
            </p>
            <ul>
              {summary.modules.slice(0, 8).map((module) => (
                <li key={module.slug}>
                  <a href={sitePath(`api/${module.path.join("/")}`)}>{module.displayName}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function ApiModuleView(props: { readonly page: Extract<ApiPage, { readonly kind: "module" }> }) {
  return (
    <>
      <ApiBreadcrumbs items={[["API Reference", sitePath("api")]]} current={props.page.module.displayName} />
      <h1>{props.page.module.displayName}</h1>
      <p>
        {props.page.module.entries.length} public{" "}
        {props.page.module.entries.length === 1 ? "export" : "exports"}.
      </p>
      {props.page.entryGroups.map((group) => (
        <section class="api-entry-group" key={`${props.page.module.slug}-${group.title}`}>
          <h2>{group.title}</h2>
          <div class="api-entry-grid">
            {group.entries.map((entry) => (
              <a class="api-entry-card" href={apiLinkForEntry(entry)} key={entry.path.join("/")}>
                <span class="api-entry-kind">{entry.kindLabel}</span>
                <strong>{entry.node.name}</strong>
                <code>{escapeCodeText(signaturePreview(entry.node))}</code>
              </a>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function ApiEntryView(props: { readonly page: Extract<ApiPage, { readonly kind: "entry" }> }) {
  const entry = props.page.entry;
  const source = sourceFor(entry.node);
  const members = membersFor(entry.node);

  return (
    <>
      <ApiBreadcrumbs
        items={[
          ["API Reference", sitePath("api")],
          [entry.module.displayName, sitePath(`api/${entry.module.path.join("/")}`)],
        ]}
        current={entry.node.name}
      />
      <h1>{entry.node.name}</h1>
      <p class="api-entry-meta">
        <span>{entry.kindLabel}</span>
        <span>{entry.module.displayName}</span>
        {source === "" ? undefined : (
          <a href={source} rel="noreferrer">
            Source
          </a>
        )}
      </p>
      <div class="code-block">
        <pre>
          <code>{escapeCodeText(signatureBlock(entry.node))}</code>
        </pre>
      </div>
      {members.length === 0 ? undefined : (
        <section class="api-entry-group">
          <h2>Members</h2>
          <div class="api-member-list">
            {members.map((member) => (
              <div class="api-member-row" key={member.id}>
                <code>{escapeCodeText(memberSignature(member))}</code>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ApiBreadcrumbs(props: {
  readonly current: string;
  readonly items: readonly (readonly [label: string, href: string])[];
}) {
  return (
    <nav class="api-breadcrumbs" aria-label="API breadcrumbs">
      {props.items.map((item) => {
        const label = item[0];
        const itemHref = item[1];

        return (
          <span key={itemHref}>
            <a href={itemHref}>{label}</a>
            <span aria-hidden="true">/</span>
          </span>
        );
      })}
      <span>{props.current}</span>
    </nav>
  );
}

function buildApiModules(project: TypeDocProject): readonly ApiModule[] {
  return (project.children ?? []).flatMap((packageNode) => {
    const nestedModules = (packageNode.children ?? []).filter((child) => child.kind === TypeDocKind.Module);

    if (nestedModules.length === 0) {
      return [apiModuleFor(packageNode, packageNode, undefined)];
    }

    return nestedModules.map((moduleNode) => apiModuleFor(packageNode, moduleNode, moduleNode.name));
  });
}

function apiModuleFor(
  packageNode: TypeDocReflection,
  moduleNode: TypeDocReflection,
  moduleName: string | undefined,
): ApiModule {
  const slug = moduleSlug(packageNode.name, moduleName);
  const entrySeparator = moduleName === "" ? ".." : ".";
  const module: Omit<ApiModule, "entries"> = {
    displayName: moduleName === undefined || moduleName === "" ? packageNode.name : `${packageNode.name}/${moduleName}`,
    entrySeparator,
    node: moduleNode,
    packageName: packageNode.name,
    path: ["modules", `${slug}.html`],
    slug,
  };

  return {
    ...module,
    entries: (moduleNode.children ?? [])
      .filter(isRenderableEntry)
      .map((entry) => apiEntryFor(module as ApiModule, entry))
      .sort(compareEntries),
  };
}

function apiEntryFor(module: ApiModule, node: TypeDocReflection): ApiEntry {
  const entrySlug = `${module.slug}${module.entrySeparator}${node.name}`;

  return {
    kindLabel: kindLabelFor(node.kind),
    module,
    node,
    path: [directoryForKind(node.kind), `${entrySlug}.html`],
  };
}

function summarizePackages(modules: readonly ApiModule[]): readonly ApiPackageSummary[] {
  const summaries = new Map<string, ApiPackageSummary>();
  for (const module of modules) {
    const current = summaries.get(module.packageName);
    summaries.set(module.packageName, {
      entryCount: (current?.entryCount ?? 0) + module.entries.length,
      modules: [...(current?.modules ?? []), module],
      name: module.packageName,
    });
  }

  return [...summaries.values()];
}

function groupEntries(entries: readonly ApiEntry[]): readonly ApiEntryGroup[] {
  const groups = new Map<string, ApiEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.kindLabel) ?? [];
    group.push(entry);
    groups.set(entry.kindLabel, group);
  }

  return [...groups.entries()].map(([title, groupedEntries]) => ({ entries: groupedEntries, title }));
}

function isRenderableEntry(reflection: TypeDocReflection): boolean {
  return (
    reflection.name !== "" &&
    [
      TypeDocKind.Namespace,
      TypeDocKind.Variable,
      TypeDocKind.Function,
      TypeDocKind.Interface,
      TypeDocKind.TypeAlias,
      TypeDocKind.Reference,
    ].includes(reflection.kind)
  );
}

function compareEntries(left: ApiEntry, right: ApiEntry): number {
  return left.kindLabel.localeCompare(right.kindLabel) || left.node.name.localeCompare(right.node.name);
}

function moduleSlug(packageName: string, moduleName: string | undefined): string {
  const packageSlug = packageName.replace("@", "_").replaceAll("/", "_");
  if (moduleName === undefined || moduleName === "") {
    return packageSlug;
  }

  return `${packageSlug}.${moduleName.replaceAll("/", "_")}`;
}

function directoryForKind(kind: number): string {
  switch (kind) {
    case TypeDocKind.Function:
      return "functions";
    case TypeDocKind.Interface:
      return "interfaces";
    case TypeDocKind.TypeAlias:
      return "types";
    default:
      return "variables";
  }
}

function kindLabelFor(kind: number): string {
  switch (kind) {
    case TypeDocKind.Function:
      return "Function";
    case TypeDocKind.Interface:
      return "Interface";
    case TypeDocKind.TypeAlias:
      return "Type Alias";
    case TypeDocKind.Namespace:
      return "Namespace";
    case TypeDocKind.Reference:
      return "Re-export";
    default:
      return "Variable";
  }
}

function signaturePreview(reflection: TypeDocReflection): string {
  return signatureBlock(reflection).replaceAll("\n", " ");
}

function escapeCodeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function signatureBlock(reflection: TypeDocReflection): string {
  if (reflection.kind === TypeDocKind.Function) {
    return (reflection.signatures ?? []).map((signature) => functionSignature(reflection.name, signature)).join("\n");
  }

  if (reflection.kind === TypeDocKind.Interface) {
    return `interface ${reflection.name}`;
  }

  if (reflection.kind === TypeDocKind.TypeAlias) {
    return `type ${reflection.name} = ${formatType(reflection.type)}`;
  }

  return `const ${reflection.name}: ${formatType(reflection.type)}`;
}

function functionSignature(name: string, signature: TypeDocReflection): string {
  const typeParameters = formatTypeParameters(signature.typeParameters ?? []);
  const parameters = (signature.parameters ?? []).map(parameterSignature).join(", ");

  return `function ${name}${typeParameters}(${parameters}): ${formatType(signature.type)}`;
}

function parameterSignature(parameter: TypeDocReflection): string {
  const rest = parameter.flags?.isRest === true ? "..." : "";
  const optional = parameter.flags?.isOptional === true ? "?" : "";

  return `${rest}${parameter.name}${optional}: ${formatType(parameter.type)}`;
}

function memberSignature(member: TypeDocReflection): string {
  if (member.kind === TypeDocKind.Method) {
    return (member.signatures ?? []).map((signature) => functionSignature(member.name, signature)).join("\n");
  }

  const optional = member.flags?.isOptional === true ? "?" : "";

  return `${member.name}${optional}: ${formatType(member.type)}`;
}

function formatTypeParameters(parameters: readonly TypeDocReflection[]): string {
  if (parameters.length === 0) {
    return "";
  }

  return `<${parameters.map((parameter) => parameter.name).join(", ")}>`;
}

function formatType(type: TypeDocType | undefined, depth = 0): string {
  if (type === undefined) {
    return "unknown";
  }

  if (depth > 4) {
    return "...";
  }

  switch (type.type) {
    case "array":
      return `${formatType(type.elementType, depth + 1)}[]`;
    case "conditional":
      return `${formatType(type.checkType, depth + 1)} extends ${formatType(type.extendsType, depth + 1)} ? ${formatType(type.trueType, depth + 1)} : ${formatType(type.falseType, depth + 1)}`;
    case "indexedAccess":
      return `${formatType(type.objectType, depth + 1)}[${formatType(type.indexType, depth + 1)}]`;
    case "inferred":
      return `infer ${type.name ?? "T"}`;
    case "intrinsic":
      return type.name ?? "unknown";
    case "intersection":
      return (type.types ?? []).map((childType) => formatType(childType, depth + 1)).join(" & ");
    case "literal":
      return JSON.stringify(type.value);
    case "mapped":
      return `{ [${type.parameter ?? "K"} in ${formatType(type.parameterType, depth + 1)}]: ${formatType(type.templateType, depth + 1)} }`;
    case "namedTupleMember":
      return `${type.name}${type.isOptional === true ? "?" : ""}: ${formatType(type.element, depth + 1)}`;
    case "optional":
      return `${formatType(type.elementType, depth + 1)} | undefined`;
    case "predicate":
      return `${type.asserts === true ? "asserts " : ""}${type.name ?? "value"} is ${formatType(type.targetType, depth + 1)}`;
    case "query":
      return `typeof ${formatType(type.queryType, depth + 1)}`;
    case "reference":
      return `${type.name ?? "unknown"}${formatTypeArguments(type.typeArguments ?? [], depth + 1)}`;
    case "reflection":
      return formatReflectionType(type.declaration);
    case "rest":
      return `...${formatType(type.elementType, depth + 1)}`;
    case "templateLiteral":
      return "`" + `${type.head ?? ""}${(type.tail ?? []).map(([childType, text]) => "${" + formatType(childType, depth + 1) + "}" + text).join("")}` + "`";
    case "tuple":
      return `[${(type.elements ?? []).map((childType) => formatType(childType, depth + 1)).join(", ")}]`;
    case "typeOperator":
      return `${type.operator ?? "keyof"} ${formatType(typeTarget(type.target), depth + 1)}`;
    case "union":
      return (type.types ?? []).map((childType) => formatType(childType, depth + 1)).join(" | ");
    default:
      return type.name ?? type.type;
  }
}

function typeTarget(target: TypeDocType["target"]): TypeDocType | undefined {
  if (typeof target !== "object" || target === null || !("type" in target)) {
    return undefined;
  }

  return target as TypeDocType;
}

function formatTypeArguments(types: readonly TypeDocType[], depth: number): string {
  if (types.length === 0) {
    return "";
  }

  return `<${types.map((type) => formatType(type, depth)).join(", ")}>`;
}

function formatReflectionType(declaration: TypeDocReflection | undefined): string {
  const callSignatures = declaration?.signatures ?? [];
  if (callSignatures.length > 0) {
    return callSignatures.map((signature) => functionSignature("", signature).replace("function ", "")).join(" | ");
  }

  const children = declaration?.children ?? [];
  if (children.length === 0) {
    return "object";
  }

  return `{ ${children.slice(0, 8).map((child) => memberSignature(child)).join("; ")}${children.length > 8 ? "; ..." : ""} }`;
}

function membersFor(reflection: TypeDocReflection): readonly TypeDocReflection[] {
  return (reflection.children ?? []).filter((child) =>
    [TypeDocKind.Property, TypeDocKind.Method].includes(child.kind),
  );
}

function sourceFor(reflection: TypeDocReflection): string {
  const source = reflection.sources?.[0] ?? reflection.signatures?.[0]?.sources?.[0];

  return source?.url ?? "";
}
