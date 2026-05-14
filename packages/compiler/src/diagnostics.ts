import type { Diagnostic, SourceLocation } from "./types.js";

export function unsupportedComponentReferenceDiagnostic(
  name: string,
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_COMPONENT_REFERENCE",
    message: `Component reference '${name}' is not a supported same-module component.`,
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unsupportedSpreadAttributeDiagnostic(
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
    message: "JSX spread attributes cannot be emitted by the server target.",
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unsupportedServerEventHandlerDiagnostic(
  name: string,
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    message: `Event handler '${name}' cannot be emitted by the server target.`,
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unsupportedServerDynamicAttributeDiagnostic(
  name: string,
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE",
    message: `Dynamic attribute '${name}' cannot be emitted by the server target.`,
    ...(loc === undefined ? {} : { loc }),
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

export function unsupportedAwaitInnerComponentDiagnostic(
  name: string,
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_AWAIT_INNER_COMPONENT",
    message: `Component reference '${name}' cannot be emitted inside an <Await> renderer until compat boundary hydration lowering is implemented.`,
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unserializableAwaitValueDiagnostic(
  reason: string,
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "warn",
    code: "MR_UNSERIALIZABLE_AWAIT_VALUE",
    message:
      `<Await value={...}> contains a non-JSON-serializable value (${reason}). ` +
      `The wire format uses JSON.stringify, so the client-side renderer will receive a different shape ` +
      `after the round-trip. See docs/mreact_router.md "<Await> value の制約".`,
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unsupportedBodyStatementJsxDiagnostic(
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_BODY_STATEMENT_JSX",
    message:
      "JSX inside component body statements is not lowered yet. Move the JSX into the return tree or create it with runtime helpers.",
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unsupportedTopLevelJsxInitializerDiagnostic(
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_TOP_LEVEL_JSX_INITIALIZER",
    message:
      "Top-level variable initializers that contain JSX are not lowered yet. Move the JSX into a function component declaration or a component body statement.",
    ...(loc === undefined ? {} : { loc }),
  };
}

export function invalidJsxExpressionDiagnostic(
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "error",
    code: "MR_INVALID_JSX_EXPRESSION",
    message:
      "JSX expression is empty or unparseable. To include literal braces in text, use &#123; / &#125; or {'{'} / {'}'} escapes.",
    ...(loc === undefined ? {} : { loc }),
  };
}
