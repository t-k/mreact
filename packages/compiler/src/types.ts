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

/** Names whether the compiler emits client or server output. */
export type CompileTarget = SharedCompileTarget;

/** Names the server renderer output format produced by the compiler. */
export type ServerOutputMode = SharedServerOutputMode;

/** Names how the server renderer should emit bootstrap scripts. */
export type ServerBootstrapMode = SharedServerBootstrapMode;

/** Names the parser backend used by the compiler. */
export type ParserMode = "oxc";

/** Names the frontend implementation that produced compiler metadata. */
export type CompilerFrontend = SharedCompilerFrontend;

/** Names how JSX found in component body statements should be lowered. */
export type BodyStatementJsxMode = "dom-node" | "compat-object" | "server-string" | "unsupported";

/** Configures lower-level module analysis before code emission. */
export interface AnalyzeModuleOptions {
  topLevelJsx?: "diagnostic" | "compat-object" | "server-string";
  bodyStatementJsx?: BodyStatementJsxMode;
  serverOutput?: ServerOutputMode;
  awaitCompatComponents?: "diagnostic" | "lower";
  clientBoundaryImports?: readonly string[];
  clientBoundaryFallbackImports?: readonly string[];
  compatReactNodeReturn?: boolean;
  compatReactNodeReturnRenderMode?: "react-node";
}

/** Configures a single compiler transform call. */
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
  clientBoundaryFallbackImports?: readonly string[];
  serverEscape?: ServerEscapeOptions;
  reactSuspenseRevealScriptSrc?: string;
}

/** Configures imports for the server HTML escape helper emitted by the compiler. */
export interface ServerEscapeOptions {
  batchImportName: string;
  batchImportSource: string;
}

/** Describes emitted code, source map data, diagnostics, and metadata from a transform. */
export type TransformOutput = SharedTransformOutput;

/** Describes a compiler diagnostic message. */
export type Diagnostic = SharedDiagnostic;

/** Describes a suggested fix attached to a compiler diagnostic. */
export type DiagnosticSuggestion = SharedDiagnosticSuggestion;

/** Describes a one-based source location for diagnostics and metadata. */
export type SourceLocation = SharedSourceLocation;

/** Describes metadata collected for one transformed module. */
export type ModuleMetadata = SharedModuleMetadata;

/** Describes compiler frontend metadata for one transformed module. */
export type CompilerMetadata = SharedModuleMetadata["compiler"];

/** Describes a client boundary reference discovered during compilation. */
export type ClientReferenceMetadata = SharedClientReferenceMetadata;

/** Describes one compiled component discovered in a module. */
export type ComponentMetadata = SharedComponentMetadata;

/** Describes a runtime import required by emitted compiler output. */
export type RuntimeImport = SharedRuntimeImport;

/** Describes event hydration metadata emitted for server-rendered handlers. */
export type EventHydrationManifestMetadata = SharedEventHydrationManifestMetadata;

/** Describes one event hydration entry in a compiler metadata manifest. */
export type EventHydrationEntryMetadata = SharedEventHydrationEntryMetadata;
