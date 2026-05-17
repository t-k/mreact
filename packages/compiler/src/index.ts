export {
  collectJsxComponentRootNames,
  collectStaticImportReferences,
  collectStaticModuleSpecifiers,
  collectTopLevelValueExportNames,
  hasClientRuntimeSyntax,
  hasModuleDirective,
  hasTopLevelExportDeclaration,
  stripTopLevelExportDeclarations,
} from "./internal.js";
export type { StaticImportReference } from "./internal.js";
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
