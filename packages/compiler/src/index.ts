/** Collects identifier reference names from a module, excluding declarations. */
export { collectIdentifierReferenceNames } from "./internal.js";

/** Collects root component names referenced by JSX elements in a module. */
export { collectJsxComponentRootNames } from "./internal.js";

/** Analyzes a route module for directives, static imports, exports, references, and render reachability. */
export { collectClientRouteModuleAnalysis } from "./internal.js";

/** Collects form action expression references and their source spans from a module. */
export { collectFormActionExpressionReferences } from "./internal.js";

/** Collects named form action references and their source spans from a module. */
export { collectFormActionReferences } from "./internal.js";

/** Collects unique named form action references from a module. */
export { collectFormActionReferenceNames } from "./internal.js";

/** Collects static export declarations and their exported names. */
export { collectStaticExportReferences } from "./internal.js";

/** Collects static import declarations and their local binding names. */
export { collectStaticImportReferences } from "./internal.js";

/** Collects module specifier strings from static import and export declarations. */
export { collectStaticModuleSpecifiers } from "./internal.js";

/** Collects render reachability information for top-level exports in a module. */
export { collectTopLevelExportRenderInfo } from "./internal.js";

/** Collects value export names declared at the top level of a module. */
export { collectTopLevelValueExportNames } from "./internal.js";

/** Converts selected top-level export declarations into non-exported declarations. */
export { demoteTopLevelExportDeclarations } from "./internal.js";

/** Checks whether a module contains syntax that requires client runtime execution. */
export { hasClientRuntimeSyntax } from "./internal.js";

/** Checks whether a module begins with a specific directive string. */
export { hasModuleDirective } from "./internal.js";

/** Checks whether a module declares any of the given names as top-level exports. */
export { hasTopLevelExportDeclaration } from "./internal.js";

/** Removes top-level export declarations for selected names while preserving their values where possible. */
export { stripTopLevelExportDeclarations } from "./internal.js";

/** Removes unused static value imports while preserving side-effect and type-only imports. */
export { stripUnusedStaticValueImports } from "./internal.js";

/** Describes a static export declaration and the names it exports. */
export type { StaticExportReference } from "./internal.js";

/** Describes one specifier inside a static export declaration. */
export type { StaticExportSpecifierReference } from "./internal.js";

/** Describes a form action expression reference and both wrapper and expression source spans. */
export type { FormActionExpressionReference } from "./internal.js";

/** Describes a named form action reference and its source span. */
export type { FormActionReference } from "./internal.js";

/** Describes a static import declaration and the local names it introduces. */
export type { StaticImportReference } from "./internal.js";

/** Describes one specifier inside a static import declaration. */
export type { StaticImportSpecifierReference } from "./internal.js";

/** Summarizes route-module imports, exports, directives, references, and reachable render roots. */
export type { ClientRouteModuleAnalysis } from "./internal.js";

/** Describes a static import declaration with its individual specifiers. */
export type { ClientRouteStaticImportReference } from "./internal.js";

/** Describes render and client-runtime reachability for one top-level export. */
export type { TopLevelExportRenderInfo } from "./internal.js";
export { analyzeBoundaryGraph } from "./boundary-graph.js";
export type {
  BoundaryClassification,
  BoundaryGraphClientBoundary,
  BoundaryGraphEntry,
  BoundaryGraphEntryKind,
  BoundaryGraphExport,
  BoundaryGraphInput,
  BoundaryGraphModule,
  BoundaryGraphResult,
  BoundaryGraphServerActionSite,
  BoundaryGraphTraceEvent,
  BoundaryGraphTraceKind,
  BoundaryGraphTraceReason,
} from "./boundary-graph.js";
export { formatDiagnostic } from "./diagnostics.js";
export { transform } from "./transform.js";
export type {
  CompileTarget,
  CompilerFrontend,
  CompilerMetadata,
  ClientReferenceMetadata,
  ComponentMetadata,
  Diagnostic,
  ModuleMetadata,
  ServerBootstrapMode,
  ServerEscapeOptions,
  RuntimeImport,
  ServerOutputMode,
  SourceLocation,
  TransformInput,
  TransformOutput,
} from "./types.js";
