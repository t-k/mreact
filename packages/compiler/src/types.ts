export type CompileTarget = "client" | "server";

export interface TransformInput {
  code: string;
  filename: string;
  target: CompileTarget;
  dev: boolean;
  sourceMap?: boolean;
  mode?: "auto" | "reactive" | "compat";
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
}

export interface SourceLocation {
  line: number;
  column: number;
}

export interface ModuleMetadata {
  filename: string;
  target: CompileTarget;
  components: ComponentMetadata[];
  imports: RuntimeImport[];
  clientReferences?: string[];
  serverReferences?: string[];
}

export interface ComponentMetadata {
  name: string;
  exportName: string;
}

export interface RuntimeImport {
  source: string;
  specifiers: string[];
}
