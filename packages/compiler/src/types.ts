export type CompileTarget = "client" | "server";
export type ServerOutputMode = "string" | "stream";
export type ServerBootstrapMode = "none" | "out-of-order-reorder";
export type ParserMode = "oxc";
export type CompilerFrontend = "oxc";

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

export interface TransformOutput {
  code: string;
  map?: string | null;
  diagnostics: Diagnostic[];
  metadata: ModuleMetadata;
}

export interface Diagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  loc?: SourceLocation;
  suggestion?: DiagnosticSuggestion;
}

export interface DiagnosticSuggestion {
  title: string;
  replacement?: string;
  link?: string;
}

export interface SourceLocation {
  line: number;
  column: number;
}

export interface ModuleMetadata {
  filename: string;
  target: CompileTarget;
  compiler: CompilerMetadata;
  serverOutput?: ServerOutputMode;
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string;
  serverBootstrapSrc?: string;
  serverHydration?: boolean;
  reactSuspenseRevealScriptSrc?: string;
  components: ComponentMetadata[];
  imports: RuntimeImport[];
  clientReferences?: string[];
  clientReferenceManifest?: ClientReferenceMetadata[];
  serverReferences?: string[];
  eventHydrationManifest?: EventHydrationManifestMetadata;
}

export interface CompilerMetadata {
  frontend: CompilerFrontend;
  typescriptFallback: boolean;
}

export interface ClientReferenceMetadata {
  name: string;
  moduleId: string;
  exportName: string;
}

export interface ComponentMetadata {
  name: string;
  exportName: string;
}

export interface RuntimeImport {
  source: string;
  specifiers: string[];
}

export interface EventHydrationManifestMetadata {
  version: 1;
  events: EventHydrationEntryMetadata[];
}

export interface EventHydrationEntryMetadata {
  id: string;
  event: string;
  handler: string;
}
