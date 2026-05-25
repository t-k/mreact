export type NestedAppendEmitter<Part> = (
  parts: readonly Part[],
  sinkName: string,
  compatRenderToStringHelperName: string,
) => string;

export interface BoundaryLoweringContext<Part> {
  compatRenderToStringHelperName: string;
  emitNestedAppendStatements: NestedAppendEmitter<Part>;
  sinkName: string;
}

export interface AsyncBoundaryPart<Part> {
  awaitId?: string;
  catchName?: string;
  catchParts?: readonly Part[];
  parts: readonly Part[];
  valueCode: string;
  valueName: string;
}

export interface OutOfOrderBoundaryPart<Part> extends AsyncBoundaryPart<Part> {
  id: string;
  hydration: boolean;
  placeholderParts: readonly Part[];
  placeholderTagCode?: string;
}

export interface ReactSuspenseBoundaryPart<Part> {
  parts: readonly Part[];
}

export interface ReactSuspenseOutOfOrderBoundaryPart<Part> extends AsyncBoundaryPart<Part> {
  boundaryId: string;
  fallbackParts: readonly Part[];
  nonce?: string;
  scriptSrc?: string;
  segmentId: string;
}

export function emitAsyncBoundary<Part>(
  part: AsyncBoundaryPart<Part>,
  context: BoundaryLoweringContext<Part> & {
    asyncBoundaryHelperName: string;
  },
): string {
  const optionFields: string[] = [];

  if (part.catchName !== undefined && part.catchParts !== undefined) {
    optionFields.push(
      `catch: (${context.sinkName}, ${part.catchName}) => {\n${context.emitNestedAppendStatements(part.catchParts, context.sinkName, context.compatRenderToStringHelperName)}\n  }`,
    );
  }

  if (part.awaitId !== undefined) {
    optionFields.push(`hydrationAwaitId: ${JSON.stringify(part.awaitId)}`);
  }

  const optionsExpression = optionFields.length === 0 ? "" : `, { ${optionFields.join(", ")} }`;

  return [
    `  await ${context.asyncBoundaryHelperName}(${context.sinkName}, (${part.valueCode}), async (${context.sinkName}, ${part.valueName}) => {`,
    context.emitNestedAppendStatements(
      part.parts,
      context.sinkName,
      context.compatRenderToStringHelperName,
    ),
    `  }${optionsExpression});`,
  ].join("\n");
}

export function emitOutOfOrderBoundary<Part>(
  part: OutOfOrderBoundaryPart<Part>,
  context: BoundaryLoweringContext<Part> & {
    outOfOrderBoundaryHelperName: string;
  },
): string {
  const catchOption =
    part.catchName === undefined || part.catchParts === undefined
      ? ""
      : `,\n  catch: (${context.sinkName}, ${part.catchName}) => {\n${context.emitNestedAppendStatements(part.catchParts, context.sinkName, context.compatRenderToStringHelperName)}\n  }`;

  const hydrationAwaitIdOption =
    part.awaitId === undefined ? "" : `,\n  hydrationAwaitId: ${JSON.stringify(part.awaitId)}`;
  const placeholderTagOption =
    part.placeholderTagCode === undefined ? "" : `,\n  placeholderTag: (${part.placeholderTagCode})`;

  return [
    `  ${context.outOfOrderBoundaryHelperName}(${context.sinkName}, ${JSON.stringify(part.id)}, (${part.valueCode}), async (${context.sinkName}, ${part.valueName}) => {`,
    context.emitNestedAppendStatements(
      part.parts,
      context.sinkName,
      context.compatRenderToStringHelperName,
    ),
    `  }, {`,
    ...(part.hydration ? [`  hydration: true,`] : []),
    `  placeholder: (${context.sinkName}) => {`,
    context.emitNestedAppendStatements(
      part.placeholderParts,
      context.sinkName,
      context.compatRenderToStringHelperName,
    ),
    `  }${catchOption}${hydrationAwaitIdOption}${placeholderTagOption}`,
    `  });`,
  ].join("\n");
}

export function emitReactSuspenseBoundary<Part>(
  part: ReactSuspenseBoundaryPart<Part>,
  context: BoundaryLoweringContext<Part> & {
    reactSuspenseBoundaryHelperName: string;
  },
): string {
  return [
    `  await ${context.reactSuspenseBoundaryHelperName}(${context.sinkName}, async (${context.sinkName}) => {`,
    context.emitNestedAppendStatements(
      part.parts,
      context.sinkName,
      context.compatRenderToStringHelperName,
    ),
    `  });`,
  ].join("\n");
}

export function emitReactSuspenseOutOfOrderBoundary<Part>(
  part: ReactSuspenseOutOfOrderBoundaryPart<Part>,
  context: BoundaryLoweringContext<Part> & {
    reactSuspenseOutOfOrderBoundaryHelperName: string;
  },
): string {
  const options = [
    `  fallback: (${context.sinkName}) => {`,
    context.emitNestedAppendStatements(
      part.fallbackParts,
      context.sinkName,
      context.compatRenderToStringHelperName,
    ),
    `  },`,
    ...(part.catchName === undefined || part.catchParts === undefined
      ? []
      : [
          `  catch: (${context.sinkName}, ${part.catchName}) => {`,
          context.emitNestedAppendStatements(
            part.catchParts,
            context.sinkName,
            context.compatRenderToStringHelperName,
          ),
          `  },`,
        ]),
    ...(part.nonce === undefined ? [] : [`  nonce: ${JSON.stringify(part.nonce)},`]),
    ...(part.scriptSrc === undefined ? [] : [`  src: ${JSON.stringify(part.scriptSrc)},`]),
  ];

  return [
    `  ${context.reactSuspenseOutOfOrderBoundaryHelperName}(${context.sinkName}, ${JSON.stringify(part.boundaryId)}, ${JSON.stringify(part.segmentId)}, (${part.valueCode}), async (${context.sinkName}, ${part.valueName}) => {`,
    context.emitNestedAppendStatements(
      part.parts,
      context.sinkName,
      context.compatRenderToStringHelperName,
    ),
    `  }, {`,
    ...options,
    `  });`,
  ].join("\n");
}
