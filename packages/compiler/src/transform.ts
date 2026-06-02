import { emitClient } from "./emit-client.js";
import { emitCompat } from "./emit-compat.js";
import { emitServer } from "./emit-server.js";
import { emitServerStream } from "./emit-server-stream.js";
import { analyzeCompilerModuleContextWithOxc, analyzeWithOxc } from "./oxc.js";
import type { ComponentIr, JsxNodeIr } from "./ir.js";
import type { AnalyzeToIrInput, AnalyzeToIrOutput, CompilerModuleContext } from "./internal.js";
import type { AnalyzeModuleOptions } from "./types.js";
import type {
  ClientReferenceMetadata,
  EventHydrationEntryMetadata,
  ModuleMetadata,
  TransformInput,
  TransformOutput,
} from "./types.js";

export function transform(input: TransformInput): TransformOutput {
  return transformWithAnalyzer(input, (analyzeTarget, analyzeOptions) =>
    analyzeWithOxc({
      code: input.code,
      filename: input.filename,
      target: analyzeTarget,
      options: analyzeOptions,
    }),
  );
}

export function transformCompilerModuleContext(
  input: TransformInput & { moduleContext: CompilerModuleContext },
): TransformOutput {
  if (input.moduleContext.code !== input.code || input.moduleContext.filename !== input.filename) {
    throw new Error("Transform input moduleContext must match the input code and filename.");
  }

  return transformWithAnalyzer(input, (analyzeTarget, analyzeOptions) =>
    analyzeCompilerModuleContextWithOxc(input.moduleContext, {
      target: analyzeTarget,
      options: analyzeOptions,
    }),
  );
}

function transformWithAnalyzer(
  input: TransformInput,
  analyze: (target: AnalyzeToIrInput["target"], options: AnalyzeModuleOptions) => AnalyzeToIrOutput,
): TransformOutput {
  const mode = input.mode ?? "reactive";
  const serverOutput = input.serverOutput ?? "string";
  const serverBootstrap = input.serverBootstrap ?? "none";
  const analyzeTarget = mode === "compat" ? "client" : input.target;
  const bodyStatementJsx =
    input.target === "server"
      ? "server-string"
      : mode === "compat" && input.target === "client"
        ? "compat-object"
        : "dom-node";
  const analyzeOptions = {
    topLevelJsx:
      mode === "compat" && input.target === "client"
        ? "compat-object"
        : input.target === "server"
          ? "server-string"
          : "diagnostic",
    bodyStatementJsx,
    ...(input.target === "server" ? { serverOutput } : {}),
    awaitCompatComponents:
      input.target === "server" && serverOutput === "stream" ? "lower" : "diagnostic",
    clientBoundaryImports: input.clientBoundaryImports ?? [],
    clientBoundaryFallbackImports: input.clientBoundaryFallbackImports ?? [],
    compatReactNodeReturn: mode === "compat",
    ...(mode === "compat" && input.target === "server"
      ? { compatReactNodeReturnRenderMode: "react-node" as const }
      : {}),
  } as const;
  const analyzed = analyze(analyzeTarget, analyzeOptions);
  const diagnostics = [...analyzed.diagnostics];
  const emitted =
    mode === "compat" && input.target === "client"
      ? emitCompat(analyzed.ir, { dev: input.dev })
      : input.target === "server"
        ? serverOutput === "stream"
          ? emitServerStream(analyzed.ir, {
              ...createServerOptions(
                serverBootstrap,
                input.serverBootstrapNonce,
                input.serverBootstrapSrc,
                input.serverHydration,
                input.reactSuspenseRevealScriptSrc,
              ),
              ...(input.serverAwaitHydration === true
                ? { serverAwaitHydration: true as const }
                : {}),
              dynamicAttributes: mode === "compat" ? "drop" : "emit",
              escape: input.serverEscape,
            })
          : emitServer(analyzed.ir, {
              ...createServerOptions(
                serverBootstrap,
                input.serverBootstrapNonce,
                input.serverBootstrapSrc,
                input.serverHydration,
              ),
              dynamicAttributes: mode === "compat" ? "drop" : "emit",
              escape: input.serverEscape,
            })
        : emitClient(analyzed.ir);

  const metadata: ModuleMetadata = {
    filename: input.filename,
    target: input.target,
    compiler: {
      frontend: "oxc",
      typescriptFallback: false,
    },
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
  const clientReferences = collectClientReferences(analyzed.ir.components);

  if (clientReferences.length > 0) {
    metadata.clientReferences = clientReferences;
  }
  const clientReferenceManifest = collectClientReferenceManifest(analyzed.ir.components);

  if (clientReferenceManifest.length > 0) {
    metadata.clientReferenceManifest = clientReferenceManifest;
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

    if (input.reactSuspenseRevealScriptSrc !== undefined) {
      metadata.reactSuspenseRevealScriptSrc = input.reactSuspenseRevealScriptSrc;
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
  const generatedMap = createSegmentMappings(outputCode, input.code);

  return JSON.stringify({
    version: 3,
    file: `${input.filename}.js`,
    sources: [input.filename],
    sourcesContent: [input.code],
    names: generatedMap.names,
    mappings: generatedMap.mappings,
  });
}

interface GeneratedSourceMap {
  mappings: string;
  names: string[];
}

function createSegmentMappings(outputCode: string, sourceCode: string): GeneratedSourceMap {
  const generatedLines = outputCode.split("\n");
  const sourceLines = sourceCode.split("\n");
  const lines: string[] = [];
  const names: string[] = [];
  const nameIndexes = new Map<string, number>();
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;
  let previousNameIndex = 0;
  const searchState: SourceMapSearchState = { tokenOffsets: new Map() };

  for (const [lineIndex, generatedLine] of generatedLines.entries()) {
    let previousGeneratedColumn = 0;
    const segments = collectSourceMapSegments(generatedLine, lineIndex, sourceLines, searchState);

    lines.push(
      segments
        .map((segment) => {
          const fields = [
            encodeVlq(segment.generatedColumn - previousGeneratedColumn),
            encodeVlq(0 - previousSourceIndex),
            encodeVlq(segment.sourceLine - previousSourceLine),
            encodeVlq(segment.sourceColumn - previousSourceColumn),
          ];

          if (segment.name !== undefined) {
            const nameIndex = getSourceMapNameIndex(segment.name, names, nameIndexes);
            fields.push(encodeVlq(nameIndex - previousNameIndex));
            previousNameIndex = nameIndex;
          }

          const encoded = fields.join("");
          previousGeneratedColumn = segment.generatedColumn;
          previousSourceIndex = 0;
          previousSourceLine = segment.sourceLine;
          previousSourceColumn = segment.sourceColumn;
          return encoded;
        })
        .join(","),
    );
  }

  return { mappings: lines.join(";"), names };
}

interface SourceMapSegment {
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
  name?: string;
}

interface SourceMapSearchState {
  tokenOffsets: Map<string, number>;
}

function collectSourceMapSegments(
  generatedLine: string,
  generatedLineIndex: number,
  sourceLines: readonly string[],
  searchState: SourceMapSearchState,
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
    const bindPropAttribute = /bindProp\([^,]+,\s+"([^"]+)"/.exec(generatedLine)?.[1];
    const sourceLocation =
      bindPropAttribute === undefined
        ? undefined
        : (findSourceLocation(
            sourceLines,
            `${bindPropAttribute}={${dynamicExpression}}`,
            searchState,
          ) ??
          findSourceLocation(
            sourceLines,
            `${bindPropAttribute}="${dynamicExpression}"`,
            searchState,
          ));
    const fallbackSourceLocation =
      findSourceLocation(sourceLines, `{${dynamicExpression}}`, searchState) ??
      findJsxExpressionTokenLocation(sourceLines, dynamicExpression) ??
      findSourceLocation(sourceLines, dynamicExpression, searchState);
    const resolvedSourceLocation = sourceLocation ?? fallbackSourceLocation;

    if (generatedColumn >= 0 && resolvedSourceLocation !== undefined) {
      const sourceColumnOffset =
        bindPropAttribute !== undefined && sourceLocation !== undefined
          ? bindPropAttribute.length + 2
          : sourceLines[resolvedSourceLocation.line]?.startsWith("{", resolvedSourceLocation.column)
            ? 1
            : 0;

      segments.push({
        generatedColumn,
        sourceLine: resolvedSourceLocation.line,
        sourceColumn: resolvedSourceLocation.column + sourceColumnOffset,
        ...(isIdentifierName(dynamicExpression) ? { name: dynamicExpression } : {}),
      });

      for (const identifier of collectIdentifierReferences(dynamicExpression)) {
        segments.push({
          generatedColumn: generatedColumn + identifier.column,
          sourceLine: resolvedSourceLocation.line,
          sourceColumn: resolvedSourceLocation.column + sourceColumnOffset + identifier.column,
          name: identifier.name,
        });
      }
    }
  }

  return dedupeAndSortSegments(segments);
}

function getSourceMapNameIndex(
  name: string,
  names: string[],
  indexes: Map<string, number>,
): number {
  const existing = indexes.get(name);

  if (existing !== undefined) {
    return existing;
  }

  const index = names.length;
  names.push(name);
  indexes.set(name, index);
  return index;
}

function isIdentifierName(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function collectIdentifierReferences(expression: string): { name: string; column: number }[] {
  const references: { name: string; column: number }[] = [];
  const seen = new Set<string>();
  const identifierPattern = /\b[A-Za-z_$][\w$]*\b/g;

  for (const match of expression.matchAll(identifierPattern)) {
    const name = match[0];
    const column = match.index ?? 0;

    if (sourceMapIgnoredIdentifiers.has(name) || seen.has(`${name}:${column}`)) {
      continue;
    }

    references.push({ name, column });
    seen.add(`${name}:${column}`);
  }

  return references;
}

const sourceMapIgnoredIdentifiers = new Set(["false", "null", "true", "undefined"]);

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
  searchState?: SourceMapSearchState,
): { line: number; column: number } | undefined {
  const source = sourceLines.join("\n");
  const start = searchState?.tokenOffsets.get(token) ?? 0;
  let offset = source.indexOf(token, start);

  if (offset < 0 && start > 0) {
    offset = source.indexOf(token);
  }

  if (offset < 0) {
    return undefined;
  }

  searchState?.tokenOffsets.set(token, offset + token.length);
  return sourceOffsetToLineColumn(sourceLines, offset);
}

function sourceOffsetToLineColumn(
  sourceLines: readonly string[],
  offset: number,
): { line: number; column: number } {
  let remaining = offset;

  for (const [line, sourceLine] of sourceLines.entries()) {
    if (remaining <= sourceLine.length) {
      return { line, column: remaining };
    }

    remaining -= sourceLine.length + 1;
  }

  return {
    line: Math.max(0, sourceLines.length - 1),
    column: sourceLines.at(-1)?.length ?? 0,
  };
}

function findJsxExpressionTokenLocation(
  sourceLines: readonly string[],
  token: string,
): { line: number; column: number } | undefined {
  let insideJsxExpression = false;

  for (const [line, sourceLine] of sourceLines.entries()) {
    if (sourceLine.includes("<") && sourceLine.includes("{")) {
      insideJsxExpression = true;
    }

    if (insideJsxExpression) {
      const column = sourceLine.indexOf(token);

      if (column >= 0) {
        return { line, column };
      }
    }

    if (sourceLine.includes("}")) {
      insideJsxExpression = false;
    }
  }

  return undefined;
}

function dedupeAndSortSegments(segments: readonly SourceMapSegment[]): SourceMapSegment[] {
  const byGeneratedColumn = new Map<number, SourceMapSegment>();

  for (const segment of segments) {
    byGeneratedColumn.set(segment.generatedColumn, segment);
  }

  return Array.from(byGeneratedColumn.values()).sort(
    (left, right) => left.generatedColumn - right.generatedColumn,
  );
}

const sourceMapBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
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

function collectClientReferences(components: readonly ComponentIr[]): string[] {
  const references = new Set<string>();

  for (const component of components) {
    collectClientReferencesFromNode(component.root, references);
  }

  return Array.from(references);
}

function collectClientReferenceManifest(
  components: readonly ComponentIr[],
): ClientReferenceMetadata[] {
  const references = new Map<string, ClientReferenceMetadata>();

  for (const component of components) {
    collectClientReferenceManifestFromNode(component.root, references);
  }

  return Array.from(references.values());
}

function collectClientReferenceManifestFromNode(
  node: JsxNodeIr,
  references: Map<string, ClientReferenceMetadata>,
): void {
  if (node.kind === "component" && node.clientReference !== undefined) {
    references.set(
      `${node.name}:${node.clientReference.moduleId}:${node.clientReference.exportName}`,
      {
        name: node.name,
        moduleId: node.clientReference.moduleId,
        exportName: node.clientReference.exportName,
      },
    );
  }

  for (const child of getNodeChildren(node)) {
    collectClientReferenceManifestFromNode(child, references);
  }

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          collectClientReferenceManifestFromNode(child, references);
        }
      }
    }
  }
}

function collectClientReferencesFromNode(node: JsxNodeIr, references: Set<string>): void {
  if (
    node.kind === "component" &&
    node.runtime === "compat" &&
    node.clientReference !== undefined
  ) {
    references.add(node.name);
  }

  for (const child of getNodeChildren(node)) {
    collectClientReferencesFromNode(child, references);
  }

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          collectClientReferencesFromNode(child, references);
        }
      }
    }
  }
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
    return [...node.children, ...(node.placeholderChildren ?? []), ...(node.catchChildren ?? [])];
  }

  return [];
}

function createServerOptions(
  serverBootstrap: NonNullable<TransformInput["serverBootstrap"]>,
  serverBootstrapNonce?: string,
  serverBootstrapSrc?: string,
  serverHydration?: boolean,
  reactSuspenseRevealScriptSrc?: string,
) {
  return {
    serverBootstrap,
    ...(serverBootstrapNonce === undefined ? {} : { serverBootstrapNonce }),
    ...(serverBootstrapSrc === undefined ? {} : { serverBootstrapSrc }),
    ...(serverHydration === undefined ? {} : { serverHydration }),
    ...(reactSuspenseRevealScriptSrc === undefined ? {} : { reactSuspenseRevealScriptSrc }),
  };
}
