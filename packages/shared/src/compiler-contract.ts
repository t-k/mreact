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
  serverAwaitHydration?: boolean;
  reactSuspenseRevealScriptSrc?: string;
  components: ComponentMetadata[];
  imports: RuntimeImport[];
  clientReferences?: string[];
  clientReferenceManifest?: ClientReferenceMetadata[];
  serverReferences?: string[];
  eventHydrationManifest?: EventHydrationManifestMetadata;
  /** Opt-in decisions made while emitting a reactive client module. */
  clientSpecializations?: ClientSpecializationMetadata[];
  /** Opt-in per-component lowering decisions made while emitting a compat client module. */
  compatLowering?: CompatLoweringMetadata[];
}

/** Execution path chosen by the compat client emitter for a component. */
export type CompatLoweringPath =
  | "reactive-dom-block"
  | "prop-reactive-dom-block"
  | "root-list-reactive-dom-block"
  | "vdom-direct-text"
  | "vdom";

/** Stable machine-readable reason why a compat component did not lower to a reactive DOM block. */
export type CompatLoweringReason =
  | "dev-mode"
  | "class-component"
  | "unsupported-root-kind"
  | "root-has-key"
  | "unsupported-parameters"
  | "prop-alias-rewrite-unsupported"
  | "has-body-statements"
  | "no-dynamic-part"
  | "unsupported-child-component"
  | "unsupported-dynamic-attribute"
  | "unsupported-jsx-node"
  | "root-has-dynamic-attributes"
  | "no-direct-state-text-child"
  | "state-used-outside-direct-text"
  | "root-list-missing-key"
  | "root-list-unsupported-expression"
  | "root-list-multiple-children"
  | "root-list-no-direct-state-binding"
  | "root-list-item-not-component"
  | "root-list-item-not-same-module"
  | "root-list-item-not-prop-block"
  | "root-list-param-shadowing";

/** One compat client component lowering decision collected for an opt-in transform report. */
export interface CompatLoweringMetadata {
  /** Component function name in the module. */
  component: string;
  /** Exported binding name (`default`, named export, or local component name). */
  exportName: string;
  /** Execution path selected by the compat client emitter. */
  path: CompatLoweringPath;
  /** Whether the component was lowered to a fine-grained reactive DOM block. */
  optimized: boolean;
  /** Whether the component fell back to the compat VDOM reconciler. */
  fallback: boolean;
  /** Stable reason codes explaining why reactive DOM lowering did not apply. */
  reasons: CompatLoweringReason[];
  /** Concrete blocking constructs found in the component, when available. */
  details?: string[];
  /** Actionable guidance for avoiding VDOM fallback or isolating fallback boundaries. */
  suggestions?: string[];
  /** Runtime imports required specifically by this component's emitted output. */
  runtimeImports: RuntimeImport[];
  /** Original root JSX source location, when available. */
  loc?: SourceLocation;
}

/** One reactive client emitter decision collected for an opt-in transform report. */
export interface ClientSpecializationMetadata {
  /** The candidate specialization checked at this emitted site. */
  name: "branchInsertion" | "compilerKeyedList" | "directCellText" | "elementProperty" | "selectBinding";
  /** Whether the specialized helper was selected. */
  applied: boolean;
  /** Canonical name of the helper chosen by the emitter. */
  helper: string;
  /** Why the specialized helper was not selected, when known. */
  reason?: "disabled" | "owner-scoped-memo" | "list-producing-branch" | "no-key" | "not-single-node-eligible" | "not-native-cell-read" | "svg-namespace" | "unsupported-property" | "spread-attribute" | "dynamic-multiple";
  /** Original JSX location; synthesized IR nodes may have no source location. */
  loc?: SourceLocation;
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
