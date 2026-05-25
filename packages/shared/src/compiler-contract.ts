export const compilerOutputContractVersion = 1;

export type ServerOutputMode = "string" | "stream";

export interface HtmlSink {
  append(chunk: string): void;
  backpressure?(): Promise<void>;
  defer?(task: PromiseLike<void>): void;
  signal?: AbortSignal;
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

export type CompileTarget = "client" | "server";
export type ServerBootstrapMode = "none" | "out-of-order-reorder";
export type CompilerFrontend = "oxc";

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
