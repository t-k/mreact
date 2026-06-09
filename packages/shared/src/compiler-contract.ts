/** Version number for the compiler output metadata contract consumed by runtime packages. */
export const compilerOutputContractVersion = 1;

/** Server rendering mode requested for transformed component output. */
export type ServerOutputMode = "string" | "stream";

/** Receives HTML chunks and deferred work while server rendering. */
export interface HtmlSink {
  append(chunk: string): void;
  backpressure?(): Promise<void>;
  defer?(task: PromiseLike<void>): void;
  signal?: AbortSignal;
}

/** Complete source transform result emitted by a compiler frontend. */
export interface TransformOutput {
  code: string;
  map?: string | null;
  diagnostics: Diagnostic[];
  metadata: ModuleMetadata;
}

/** Compiler diagnostic reported for a transformed source module. */
export interface Diagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  loc?: SourceLocation;
  suggestion?: DiagnosticSuggestion;
}

/** Suggested action or reference attached to a compiler diagnostic. */
export interface DiagnosticSuggestion {
  title: string;
  replacement?: string;
  link?: string;
}

/** One-based source location used by compiler diagnostics. */
export interface SourceLocation {
  line: number;
  column: number;
}

/** Metadata that describes the transformed module and its runtime dependencies. */
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

/** Compilation target used to select client or server output. */
export type CompileTarget = "client" | "server";
/** Bootstrap script mode requested by server output metadata. */
export type ServerBootstrapMode = "none" | "out-of-order-reorder";
/** Compiler frontend implementation that produced a transform result. */
export type CompilerFrontend = "oxc";

/** Compiler implementation metadata stored with a transform result. */
export interface CompilerMetadata {
  frontend: CompilerFrontend;
  typescriptFallback: boolean;
}

/** Client component export recorded for React Flight manifests. */
export interface ClientReferenceMetadata {
  name: string;
  moduleId: string;
  exportName: string;
}

/** Component export discovered by the compiler for runtime registration. */
export interface ComponentMetadata {
  name: string;
  exportName: string;
}

/** Runtime import required by transformed source output. */
export interface RuntimeImport {
  source: string;
  specifiers: string[];
}

/** Event hydration manifest metadata emitted with transformed server output. */
export interface EventHydrationManifestMetadata {
  version: 1;
  events: EventHydrationEntryMetadata[];
}

/** Event handler hydration entry recorded by the compiler. */
export interface EventHydrationEntryMetadata {
  id: string;
  event: string;
  handler: string;
}
