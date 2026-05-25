import type {
  ClientReferenceMetadata as SharedClientReferenceMetadata,
  CompileTarget as SharedCompileTarget,
  CompilerFrontend as SharedCompilerFrontend,
  ComponentMetadata as SharedComponentMetadata,
  Diagnostic as SharedDiagnostic,
  DiagnosticSuggestion as SharedDiagnosticSuggestion,
  EventHydrationEntryMetadata as SharedEventHydrationEntryMetadata,
  EventHydrationManifestMetadata as SharedEventHydrationManifestMetadata,
  ModuleMetadata as SharedModuleMetadata,
  RuntimeImport as SharedRuntimeImport,
  ServerBootstrapMode as SharedServerBootstrapMode,
  ServerOutputMode as SharedServerOutputMode,
  SourceLocation as SharedSourceLocation,
  TransformOutput as SharedTransformOutput,
} from "@reckona/mreact-shared/compiler-contract";

export type CompileTarget = SharedCompileTarget;
export type ServerOutputMode = SharedServerOutputMode;
export type ServerBootstrapMode = SharedServerBootstrapMode;
export type ParserMode = "oxc";
export type CompilerFrontend = SharedCompilerFrontend;

export type BodyStatementJsxMode = "dom-node" | "compat-object" | "server-string" | "unsupported";

export interface AnalyzeModuleOptions {
  topLevelJsx?: "diagnostic" | "compat-object" | "server-string";
  bodyStatementJsx?: BodyStatementJsxMode;
  serverOutput?: ServerOutputMode;
  awaitCompatComponents?: "diagnostic" | "lower";
  clientBoundaryImports?: readonly string[];
  compatReactNodeReturn?: boolean;
  compatReactNodeReturnRenderMode?: "react-node";
}

export interface TransformInput {
  code: string;
  filename: string;
  target: CompileTarget;
  dev: boolean;
  sourceMap?: boolean;
  mode?: "auto" | "reactive" | "compat";
  parser?: ParserMode;
  serverOutput?: ServerOutputMode;
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string;
  serverBootstrapSrc?: string;
  serverHydration?: boolean;
  serverAwaitHydration?: boolean;
  clientBoundaryImports?: readonly string[];
  serverEscape?: ServerEscapeOptions;
  reactSuspenseRevealScriptSrc?: string;
}

export interface ServerEscapeOptions {
  batchImportName: string;
  batchImportSource: string;
}

export type TransformOutput = SharedTransformOutput;
export type Diagnostic = SharedDiagnostic;
export type DiagnosticSuggestion = SharedDiagnosticSuggestion;
export type SourceLocation = SharedSourceLocation;
export type ModuleMetadata = SharedModuleMetadata;
export type CompilerMetadata = SharedModuleMetadata["compiler"];
export type ClientReferenceMetadata = SharedClientReferenceMetadata;
export type ComponentMetadata = SharedComponentMetadata;
export type RuntimeImport = SharedRuntimeImport;
export type EventHydrationManifestMetadata = SharedEventHydrationManifestMetadata;
export type EventHydrationEntryMetadata = SharedEventHydrationEntryMetadata;
