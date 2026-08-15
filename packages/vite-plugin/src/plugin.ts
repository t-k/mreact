import {
  transform as compile,
  type ClientReferenceMetadata,
  type ServerBootstrapMode,
  type ServerOutputMode,
  type TransformInput,
} from "@reckona/mreact-compiler";
import type { Plugin } from "vite";
import { formatDiagnostic } from "./diagnostics.js";

/** Configures mreact compilation behavior for the Vite transform plugin. */
export interface ModularReactViteOptions {
  include?: RegExp | readonly RegExp[];
  mode?: "reactive" | "compat";
  serverOutput?: ServerOutputMode;
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string | (() => string);
  serverBootstrapSrc?: string;
  serverHydration?: boolean;
  reactSuspenseRevealScriptSrc?: string;
  onFlightClientReferences?: (filename: string, entries: ClientReferenceMetadata[]) => void;
}

/** Creates a Vite plugin that compiles mreact modules for client and server builds. */
export function modularReact(options: ModularReactViteOptions = {}): Plugin {
  const include = normalizeInclude(options.include ?? /\.[cm]?[jt]sx$/);
  const serverBootstrapNonce =
    typeof options.serverBootstrapNonce === "function"
      ? options.serverBootstrapNonce()
      : options.serverBootstrapNonce;

  return {
    name: "modular-react",
    enforce: "pre",
    transform(code, id, transformOptions) {
      const filename = stripQuery(id);

      if (!include.some((pattern) => matchesPattern(pattern, filename))) {
        return null;
      }

      const input: TransformInput = {
        code,
        filename,
        target: transformOptions?.ssr === true ? "server" : "client",
        dev: this.environment?.mode === "dev",
      };

      if (options.mode !== undefined) {
        input.mode = options.mode;
      }

      if (transformOptions?.ssr === true && options.serverOutput !== undefined) {
        input.serverOutput = options.serverOutput;
      }

      if (transformOptions?.ssr === true && options.serverBootstrap !== undefined) {
        input.serverBootstrap = options.serverBootstrap;
      }

      if (transformOptions?.ssr === true && serverBootstrapNonce !== undefined) {
        input.serverBootstrapNonce = serverBootstrapNonce;
      }

      if (transformOptions?.ssr === true && options.serverBootstrapSrc !== undefined) {
        input.serverBootstrapSrc = options.serverBootstrapSrc;
      }

      if (transformOptions?.ssr === true && options.serverHydration !== undefined) {
        input.serverHydration = options.serverHydration;
      }

      if (transformOptions?.ssr === true && options.reactSuspenseRevealScriptSrc !== undefined) {
        input.reactSuspenseRevealScriptSrc = options.reactSuspenseRevealScriptSrc;
      }

      const output = compile(input);

      if (transformOptions?.ssr === true && output.metadata.clientReferenceManifest !== undefined) {
        options.onFlightClientReferences?.(filename, output.metadata.clientReferenceManifest);
      }

      for (const diagnostic of output.diagnostics) {
        const message = formatDiagnostic(filename, diagnostic);
        const viteDiagnostic = {
          message,
          id: filename,
          ...(diagnostic.loc === undefined
            ? {}
            : { loc: { line: diagnostic.loc.line, column: diagnostic.loc.column } }),
        };

        if (diagnostic.level === "error") {
          this.error(viteDiagnostic);
        } else {
          this.warn(viteDiagnostic);
        }
      }

      return {
        code: output.code,
        map: output.map ?? null,
      };
    },
  };
}

function normalizeInclude(include: RegExp | readonly RegExp[]): RegExp[] {
  const patterns = include instanceof RegExp ? [include] : Array.isArray(include) ? include : [];
  if (
    (include instanceof RegExp || Array.isArray(include)) &&
    patterns.every((pattern) => pattern instanceof RegExp)
  ) {
    return patterns.map((pattern) => new RegExp(pattern.source, pattern.flags));
  }
  throw new TypeError("modularReact include must be a RegExp or an array of RegExp values.");
}

function matchesPattern(pattern: RegExp, filename: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(filename);
}

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}
