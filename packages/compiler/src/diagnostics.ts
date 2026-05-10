import type { Diagnostic } from "./types.js";

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

export function unsupportedCompatServerTargetDiagnostic(): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_COMPAT_SERVER_TARGET",
    message:
      "Compat mode does not support the server target in Phase 8. Use the reactive server target or wait for streaming SSR support.",
  };
}
