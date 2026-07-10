/** Re-exports compiler module analysis helpers from the internal compiler API. */
export {
  collectIdentifierReferenceNames,
  collectJsxComponentRootNames,
  collectClientRouteModuleAnalysis,
  collectFormActionExpressionReferences,
  collectFormActionReferences,
  collectFormActionReferenceNames,
  collectStaticExportReferences,
  collectStaticImportReferences,
  collectStaticModuleSpecifiers,
  collectTopLevelExportRenderInfo,
  collectTopLevelValueExportNames,
  demoteTopLevelExportDeclarations,
  hasClientRuntimeSyntax,
  hasModuleDirective,
  hasTopLevelExportDeclaration,
  stripTopLevelExportDeclarations,
  stripUnusedStaticValueImports,
} from "./internal.js";
/** Re-exports compiler module analysis types from the internal compiler API. */
export type {
  StaticExportReference,
  StaticExportSpecifierReference,
  FormActionExpressionReference,
  FormActionReference,
  StaticImportReference,
  StaticImportSpecifierReference,
  ClientRouteModuleAnalysis,
  ClientRouteStaticImportReference,
  TopLevelExportRenderInfo,
} from "./internal.js";
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
  ParserMode,
  ServerBootstrapMode,
  ServerEscapeOptions,
  RuntimeImport,
  ServerOutputMode,
  SourceLocation,
  TransformInput,
  TransformOutput,
} from "./types.js";
