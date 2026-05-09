import type { Diagnostic } from "./types.js";

export function unsupportedTargetDiagnostic(target: string): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_TARGET",
    message: `Compile target '${target}' is not supported in Phase 3.`,
  };
}

export function unsupportedComponentReferenceDiagnostic(
  name: string,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_COMPONENT_REFERENCE",
    message: `Component reference '${name}' is not supported in Phase 3.`,
  };
}

export function unsupportedSpreadAttributeDiagnostic(): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
    message: "JSX spread attributes are not supported in Phase 3.",
  };
}

export function unsupportedServerEventHandlerDiagnostic(
  name: string,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    message: `Event handler '${name}' cannot be emitted by the Phase 5 server target.`,
  };
}

export function unsupportedServerDynamicAttributeDiagnostic(
  name: string,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE",
    message: `Dynamic attribute '${name}' cannot be emitted by the Phase 5 server target.`,
  };
}
