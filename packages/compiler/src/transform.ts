import { analyzeModule } from "./analyze.js";
import { emitClient } from "./emit-client.js";
import { emitCompat } from "./emit-compat.js";
import { emitServer } from "./emit-server.js";
import { emitServerStream } from "./emit-server-stream.js";
import { unsupportedCompatServerTargetDiagnostic } from "./diagnostics.js";
import { parseSource } from "./parse.js";
import type {
  ModuleMetadata,
  TransformInput,
  TransformOutput,
} from "./types.js";

export function transform(input: TransformInput): TransformOutput {
  const sourceFile = parseSource(input.code, input.filename);
  const mode = input.mode ?? "reactive";
  const serverOutput = input.serverOutput ?? "string";
  const serverBootstrap = input.serverBootstrap ?? "none";
  const analyzed = analyzeModule(
    sourceFile,
    mode === "compat" ? "client" : input.target,
  );
  const diagnostics = [...analyzed.diagnostics];
  const emitted =
    mode === "compat" && input.target === "server"
      ? {
          code: "",
          imports: [],
        }
      : mode === "compat"
        ? emitCompat(analyzed.ir)
        : input.target === "server"
          ? serverOutput === "stream"
            ? emitServerStream(
                analyzed.ir,
                createServerStreamOptions(
                  serverBootstrap,
                  input.serverBootstrapNonce,
                  input.serverBootstrapSrc,
                ),
              )
            : emitServer(analyzed.ir)
          : emitClient(analyzed.ir);

  if (mode === "compat" && input.target === "server") {
    diagnostics.push(unsupportedCompatServerTargetDiagnostic());
  }

  const metadata: ModuleMetadata = {
    filename: input.filename,
    target: input.target,
    components: analyzed.ir.components.map((component) => ({
      name: component.name,
      exportName: component.exportName,
    })),
    imports: emitted.imports,
  };

  if (input.target === "server") {
    metadata.serverOutput = serverOutput;

    if (serverBootstrap !== "none") {
      metadata.serverBootstrap = serverBootstrap;
    }

    if (input.serverBootstrapNonce !== undefined) {
      metadata.serverBootstrapNonce = input.serverBootstrapNonce;
    }

    if (input.serverBootstrapSrc !== undefined) {
      metadata.serverBootstrapSrc = input.serverBootstrapSrc;
    }
  }

  return {
    code: emitted.code,
    diagnostics,
    metadata,
  };
}

function createServerStreamOptions(
  serverBootstrap: NonNullable<TransformInput["serverBootstrap"]>,
  serverBootstrapNonce?: string,
  serverBootstrapSrc?: string,
) {
  return {
    serverBootstrap,
    ...(serverBootstrapNonce === undefined ? {} : { serverBootstrapNonce }),
    ...(serverBootstrapSrc === undefined ? {} : { serverBootstrapSrc }),
  };
}
