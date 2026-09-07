/**
 * Conservative facts the compiler proves about lowered expressions.
 *
 * The contract is deliberately small. Every field has an explicit `unknown`
 * state, and analysis only ever narrows a fact when the supporting evidence
 * comes from the parsed source. Facts are never recovered by re-reading the
 * strings the emitters produce, so an unsupported input keeps the baseline
 * generic emission instead of silently gaining an optimization.
 *
 * Supported subset today:
 * - `native-cell-read`: a zero-argument, non-optional `get()` call on an
 *   identifier that a `const` declaration bound to `cell()` imported from
 *   `@reckona/mreact-reactive-core`, where no member of that binding is
 *   assigned anywhere in the module and the name is not shadowed in scope.
 *
 * Everything else stays `unknown`.
 */

/** Names one conservative certainty level used by compiler facts. */
export type FactCertainty = "proven" | "unknown";

/** Identifies a binding by name and by the source span of the declarator that created it. */
export interface ResolvedBindingIr {
  name: string;
  start: number;
  end: number;
}

/** Describes the proven value shape of a lowered expression. */
export type ExpressionValueIr =
  | { kind: "unknown" }
  | { kind: "native-cell-read"; binding: ResolvedBindingIr };

/** Names one output phase a lowered expression can be required in. */
export type ExpressionPhaseIr = "server" | "attach" | "update" | "mount";

/** Carries the conservative facts proven about one lowered expression. */
export interface ExpressionFactsIr {
  /** Proven value shape, or `unknown` when no shape could be proven. */
  value: ExpressionValueIr;
  /** Bindings the expression is proven to read; `undefined` records unknown dependencies. */
  dependencies?: ResolvedBindingIr[];
  /** `proven` only when evaluating the expression performs no user-observable effect. */
  effectFree: FactCertainty;
  /** `contained` only when the value cannot escape the binding the compiler emits for it. */
  escape: "contained" | "unknown";
  /** Phases the expression is required in; `undefined` records unknown phase requirements. */
  phases?: ExpressionPhaseIr[];
}

/** The fact set used whenever nothing could be proven about an expression. */
export const UNKNOWN_EXPRESSION_FACTS: ExpressionFactsIr = Object.freeze({
  value: Object.freeze({ kind: "unknown" }) as ExpressionValueIr,
  effectFree: "unknown",
  escape: "unknown",
});

/** Reads the facts carried by an IR node, treating a missing record as fully unknown. */
export function readExpressionFacts(node: { facts?: ExpressionFactsIr }): ExpressionFactsIr {
  return node.facts ?? UNKNOWN_EXPRESSION_FACTS;
}

/** Discards every proven fact, for rewrites that change what an expression evaluates to. */
export function invalidateExpressionFacts(): ExpressionFactsIr {
  return UNKNOWN_EXPRESSION_FACTS;
}

/**
 * Merges two fact sets for control-flow joins such as conditional branches.
 *
 * A fact survives only when both sides agree on it. Dependencies are unioned
 * because a join may read either side, and they degrade to unknown as soon as
 * one side has unknown dependencies.
 */
export function mergeExpressionFacts(
  left: ExpressionFactsIr,
  right: ExpressionFactsIr,
): ExpressionFactsIr {
  const value = sameExpressionValue(left.value, right.value) ? left.value : { kind: "unknown" };
  const dependencies =
    left.dependencies === undefined || right.dependencies === undefined
      ? undefined
      : unionBindings(left.dependencies, right.dependencies);
  const phases =
    left.phases === undefined || right.phases === undefined
      ? undefined
      : unionPhases(left.phases, right.phases);

  return {
    value: value as ExpressionValueIr,
    ...(dependencies === undefined ? {} : { dependencies }),
    effectFree: left.effectFree === "proven" && right.effectFree === "proven" ? "proven" : "unknown",
    escape:
      left.escape === "contained" && right.escape === "contained" ? "contained" : "unknown",
    ...(phases === undefined ? {} : { phases }),
  };
}

/** Compares two resolved bindings by name and declaration span. */
export function sameResolvedBinding(left: ResolvedBindingIr, right: ResolvedBindingIr): boolean {
  return left.name === right.name && left.start === right.start && left.end === right.end;
}

function sameExpressionValue(left: ExpressionValueIr, right: ExpressionValueIr): boolean {
  if (left.kind === "native-cell-read" && right.kind === "native-cell-read") {
    return sameResolvedBinding(left.binding, right.binding);
  }

  return false;
}

function unionBindings(
  left: readonly ResolvedBindingIr[],
  right: readonly ResolvedBindingIr[],
): ResolvedBindingIr[] {
  const merged = [...left];

  for (const binding of right) {
    if (!merged.some((existing) => sameResolvedBinding(existing, binding))) {
      merged.push(binding);
    }
  }

  return merged;
}

function unionPhases(
  left: readonly ExpressionPhaseIr[],
  right: readonly ExpressionPhaseIr[],
): ExpressionPhaseIr[] {
  const merged = [...left];

  for (const phase of right) {
    if (!merged.includes(phase)) {
      merged.push(phase);
    }
  }

  return merged;
}
