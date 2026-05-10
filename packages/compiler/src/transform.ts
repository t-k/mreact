import { analyzeModule } from "./analyze.js";
import { emitClient } from "./emit-client.js";
import { emitCompat } from "./emit-compat.js";
import { emitServer } from "./emit-server.js";
import { emitServerStream } from "./emit-server-stream.js";
import { unsupportedCompatServerTargetDiagnostic } from "./diagnostics.js";
import type { ComponentIr, JsxNodeIr } from "./ir.js";
import { parseSource } from "./parse.js";
import type {
  EventHydrationEntryMetadata,
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
  const events = collectEventHydrationEntries(analyzed.ir.components);

  if (events.length > 0) {
    metadata.eventHydrationManifest = {
      version: 1,
      events,
    };
  }

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
    map: input.sourceMap === true ? createSourceMap(input, emitted.code) : null,
    diagnostics,
    metadata,
  };
}

function createSourceMap(input: TransformInput, outputCode: string): string {
  return JSON.stringify({
    version: 3,
    file: `${input.filename}.js`,
    sources: [input.filename],
    sourcesContent: [input.code],
    names: [],
    mappings: createLineMappings(outputCode, input.code),
  });
}

function createLineMappings(outputCode: string, sourceCode: string): string {
  const generatedLineCount = outputCode.split("\n").length;
  const sourceLineCount = Math.max(1, sourceCode.split("\n").length);
  const lines: string[] = [];
  let previousOriginalLine = 0;

  for (let lineIndex = 0; lineIndex < generatedLineCount; lineIndex += 1) {
    const originalLine = Math.min(lineIndex, sourceLineCount - 1);
    const originalLineDelta = originalLine - previousOriginalLine;
    previousOriginalLine = originalLine;
    lines.push(
      `${encodeVlq(0)}${encodeVlq(0)}${encodeVlq(originalLineDelta)}${encodeVlq(0)}`,
    );
  }

  return lines.join(";");
}

const sourceMapBase64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = "";

  do {
    let digit = vlq & 31;
    vlq >>>= 5;

    if (vlq > 0) {
      digit |= 32;
    }

    encoded += sourceMapBase64[digit] ?? "";
  } while (vlq > 0);

  return encoded;
}

function collectEventHydrationEntries(
  components: readonly ComponentIr[],
): EventHydrationEntryMetadata[] {
  return components.flatMap((component) => {
    const entries: EventHydrationEntryMetadata[] = [];
    collectEventsFromNode(component.root, component.name, "0", entries);
    return entries;
  });
}

function collectEventsFromNode(
  node: JsxNodeIr,
  componentName: string,
  path: string,
  entries: EventHydrationEntryMetadata[],
): void {
  if (node.kind === "element") {
    for (const attr of node.attributes) {
      if (attr.kind === "event") {
        entries.push({
          id: `${componentName}:${path}`,
          event: attr.eventName,
          handler: attr.code,
        });
      }
    }
  }

  for (const [index, child] of getNodeChildren(node).entries()) {
    collectEventsFromNode(child, componentName, `${path}.${index}`, entries);
  }
}

function getNodeChildren(node: JsxNodeIr): readonly JsxNodeIr[] {
  if (node.kind === "element" || node.kind === "fragment") {
    return node.children;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse];
  }

  if (node.kind === "list") {
    return node.children;
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ];
  }

  return [];
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
