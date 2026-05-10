import { analyzeModule } from "./analyze.js";
import { emitClient } from "./emit-client.js";
import { emitCompat } from "./emit-compat.js";
import { emitServer } from "./emit-server.js";
import { emitServerStream } from "./emit-server-stream.js";
import { analyzeWithOxc } from "./oxc.js";
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
  const analyzeTarget = mode === "compat" ? "client" : input.target;
  const analyzed =
    input.parser === "oxc"
      ? analyzeWithOxc({
          code: input.code,
          filename: input.filename,
          target: analyzeTarget,
        })
      : analyzeModule(sourceFile, analyzeTarget, {
          topLevelJsx:
            mode === "compat" && input.target === "client"
              ? "compat-object"
              : "diagnostic",
        });
  const diagnostics = [...analyzed.diagnostics];
  const emitted =
    mode === "compat" && input.target === "client"
      ? emitCompat(analyzed.ir)
      : input.target === "server"
        ? serverOutput === "stream"
          ? emitServerStream(
              analyzed.ir,
              createServerOptions(
                serverBootstrap,
                input.serverBootstrapNonce,
                input.serverBootstrapSrc,
                input.serverHydration,
              ),
            )
          : emitServer(analyzed.ir, createServerOptions(
              serverBootstrap,
              input.serverBootstrapNonce,
              input.serverBootstrapSrc,
              input.serverHydration,
            ))
        : emitClient(analyzed.ir);

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

    if (input.serverHydration === true) {
      metadata.serverHydration = true;
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
    mappings: createSegmentMappings(outputCode, input.code),
  });
}

function createSegmentMappings(outputCode: string, sourceCode: string): string {
  const generatedLines = outputCode.split("\n");
  const sourceLines = sourceCode.split("\n");
  const lines: string[] = [];
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;

  for (const [lineIndex, generatedLine] of generatedLines.entries()) {
    let previousGeneratedColumn = 0;
    const segments = collectSourceMapSegments(
      generatedLine,
      lineIndex,
      sourceLines,
    );

    lines.push(
      segments
        .map((segment) => {
          const encoded = [
            encodeVlq(segment.generatedColumn - previousGeneratedColumn),
            encodeVlq(0 - previousSourceIndex),
            encodeVlq(segment.sourceLine - previousSourceLine),
            encodeVlq(segment.sourceColumn - previousSourceColumn),
          ].join("");
          previousGeneratedColumn = segment.generatedColumn;
          previousSourceIndex = 0;
          previousSourceLine = segment.sourceLine;
          previousSourceColumn = segment.sourceColumn;
          return encoded;
        })
        .join(","),
    );
  }

  return lines.join(";");
}

interface SourceMapSegment {
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
}

function collectSourceMapSegments(
  generatedLine: string,
  generatedLineIndex: number,
  sourceLines: readonly string[],
): SourceMapSegment[] {
  const fallbackSourceLine = findFallbackSourceLine(generatedLine, generatedLineIndex, sourceLines);
  const segments: SourceMapSegment[] = [
    {
      generatedColumn: 0,
      sourceLine: fallbackSourceLine,
      sourceColumn: 0,
    },
  ];

  const functionMatch = /function\s+([A-Za-z_$][\w$]*)/.exec(generatedLine);
  if (functionMatch !== null && functionMatch.index !== undefined) {
    const token = `function ${functionMatch[1]}`;
    const sourceLocation = findSourceLocation(sourceLines, token);

    if (sourceLocation !== undefined) {
      segments.push({
        generatedColumn: functionMatch.index,
        sourceLine: sourceLocation.line,
        sourceColumn: sourceLocation.column,
      });
    }
  }

  const returnColumn = generatedLine.indexOf("return");
  if (returnColumn >= 0) {
    const sourceLocation = findSourceLocation(sourceLines, "return");

    if (sourceLocation !== undefined) {
      segments.push({
        generatedColumn: returnColumn,
        sourceLine: sourceLocation.line,
        sourceColumn: sourceLocation.column,
      });
    }
  }

  const templateStart = generatedLine.indexOf('createTemplate("');
  const templateTag =
    templateStart < 0
      ? undefined
      : generatedLine.slice(templateStart).match(/<[A-Za-z][\w:-]*/)?.[0];
  if (templateTag !== undefined) {
    const generatedColumn = generatedLine.indexOf(templateTag);
    const sourceLocation = findSourceLocation(sourceLines, templateTag);

    if (generatedColumn >= 0 && sourceLocation !== undefined) {
      segments.push({
        generatedColumn,
        sourceLine: sourceLocation.line,
        sourceColumn: sourceLocation.column,
      });
    }
  }

  const dynamicExpression = /=> \(([^)]+)\)/.exec(generatedLine)?.[1]?.trim();
  if (dynamicExpression !== undefined && dynamicExpression !== "") {
    const generatedColumn = generatedLine.indexOf(dynamicExpression);
    const sourceLocation =
      findSourceLocation(sourceLines, `{${dynamicExpression}}`) ??
      findSourceLocation(sourceLines, dynamicExpression);

    if (generatedColumn >= 0 && sourceLocation !== undefined) {
      segments.push({
        generatedColumn,
        sourceLine: sourceLocation.line,
        sourceColumn:
          sourceLocation.column +
          (sourceLines[sourceLocation.line]?.startsWith("{", sourceLocation.column)
            ? 1
            : 0),
      });
    }
  }

  return dedupeAndSortSegments(segments);
}

function findFallbackSourceLine(
  generatedLine: string,
  generatedLineIndex: number,
  sourceLines: readonly string[],
): number {
  const functionName = /function\s+([A-Za-z_$][\w$]*)/.exec(generatedLine)?.[1];

  if (functionName !== undefined) {
    return findSourceLocation(sourceLines, `function ${functionName}`)?.line ?? 0;
  }

  if (generatedLine.includes("createTemplate")) {
    const jsxLine = sourceLines.findIndex((line) => line.includes("<"));
    return jsxLine < 0 ? 0 : jsxLine;
  }

  if (generatedLine.includes("return")) {
    return findSourceLocation(sourceLines, "return")?.line ?? 0;
  }

  return Math.min(generatedLineIndex, Math.max(0, sourceLines.length - 1));
}

function findSourceLocation(
  sourceLines: readonly string[],
  token: string,
): { line: number; column: number } | undefined {
  for (const [line, sourceLine] of sourceLines.entries()) {
    const column = sourceLine.indexOf(token);

    if (column >= 0) {
      return { line, column };
    }
  }

  return undefined;
}

function dedupeAndSortSegments(
  segments: readonly SourceMapSegment[],
): SourceMapSegment[] {
  const byGeneratedColumn = new Map<number, SourceMapSegment>();

  for (const segment of segments) {
    byGeneratedColumn.set(segment.generatedColumn, segment);
  }

  return Array.from(byGeneratedColumn.values()).sort(
    (left, right) => left.generatedColumn - right.generatedColumn,
  );
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

function createServerOptions(
  serverBootstrap: NonNullable<TransformInput["serverBootstrap"]>,
  serverBootstrapNonce?: string,
  serverBootstrapSrc?: string,
  serverHydration?: boolean,
) {
  return {
    serverBootstrap,
    ...(serverBootstrapNonce === undefined ? {} : { serverBootstrapNonce }),
    ...(serverBootstrapSrc === undefined ? {} : { serverBootstrapSrc }),
    ...(serverHydration === undefined ? {} : { serverHydration }),
  };
}
