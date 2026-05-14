import {
  transform as compile,
  type ClientReferenceMetadata,
  type ServerBootstrapMode,
  type ServerOutputMode,
  type TransformInput,
} from "@reckona/mreact-compiler";
import type { Plugin } from "vite";
import { formatDiagnostic } from "./diagnostics.js";

export interface ModularReactViteOptions {
  include?: RegExp;
  mode?: "reactive" | "compat";
  serverOutput?: ServerOutputMode;
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string | (() => string);
  serverBootstrapSrc?: string;
  serverHydration?: boolean;
  reactSuspenseRevealScriptSrc?: string;
  onFlightClientReferences?: (
    filename: string,
    entries: ClientReferenceMetadata[],
  ) => void;
}

export function modularReact(options: ModularReactViteOptions = {}): Plugin {
  const include = options.include ?? /\.[cm]?[jt]sx$/;

  return {
    name: "modular-react",
    enforce: "pre",
    transform(code, id, transformOptions) {
      const filename = stripQuery(id);

      if (!include.test(filename)) {
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

      if (transformOptions?.ssr === true && options.serverBootstrapNonce !== undefined) {
        input.serverBootstrapNonce =
          typeof options.serverBootstrapNonce === "function"
            ? options.serverBootstrapNonce()
            : options.serverBootstrapNonce;
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

      if (
        transformOptions?.ssr === true &&
        output.metadata.clientReferenceManifest !== undefined
      ) {
        options.onFlightClientReferences?.(filename, output.metadata.clientReferenceManifest);
      }

      for (const diagnostic of output.diagnostics) {
        const message = formatDiagnostic(filename, diagnostic);

        if (diagnostic.level === "error") {
          this.error(message);
        } else {
          this.warn(message);
        }
      }

      return {
        code: output.code,
        map: output.map ?? null,
      };
    },
  };
}

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}
