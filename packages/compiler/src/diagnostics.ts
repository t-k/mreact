import type { Diagnostic, SourceLocation } from "./types.js";

/** Formats a compiler diagnostic with filename, location, code, message, and suggestion details. */
export function formatDiagnostic(
  filename: string,
  diagnostic: Diagnostic,
): string {
  const loc =
    diagnostic.loc === undefined
      ? ""
      : `:${diagnostic.loc.line}:${diagnostic.loc.column}`;
  const suggestion =
    diagnostic.suggestion === undefined
      ? ""
      : [
          ` Suggestion: ${diagnostic.suggestion.title}`,
          diagnostic.suggestion.replacement === undefined
            ? ""
            : ` Replacement: ${diagnostic.suggestion.replacement}`,
          diagnostic.suggestion.link === undefined ? "" : ` See: ${diagnostic.suggestion.link}`,
        ].join("");

  return `${filename}${loc} [${diagnostic.code}] ${diagnostic.message}${suggestion}`;
}

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

export function unsupportedServerEventHandlerDiagnostic(
  name: string,
  loc?: SourceLocation,
): Diagnostic {
  return {
    level: "warn",
    code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    message: `Server target does not emit event handler '${name}' into string HTML.`,
    suggestion: {
      title:
        "Move the handler into a client boundary, or keep it on server output only if inert HTML is intended.",
    },
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

export function unsupportedRefAttributeDiagnostic(loc?: SourceLocation): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_REF_ATTRIBUTE",
    message:
      "JSX ref attributes are only supported by compat client output. Server and reactive output cannot attach React-style refs yet.",
    ...(loc === undefined ? {} : { loc }),
  };
}

export function unsupportedCompatServerTargetDiagnostic(): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_COMPAT_SERVER_TARGET",
    message:
      "Compat mode does not support server output yet. Use the reactive server output for server-rendered routes, or compile compat components for the client boundary.",
  };
}

export function unsupportedClientAsyncComponentDiagnostic(name: string): Diagnostic {
  return {
    level: "error",
    code: "MR_ASYNC_COMPONENT_CLIENT_UNSUPPORTED",
    message: `Async component '${name}' cannot be emitted by the client target. Async components are server-only; move data fetching into a route loader with <Await>, or fetch on the client with an effect or query library.`,
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

export function unsupportedNestedAwaitDiagnostic(loc?: SourceLocation): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_NESTED_AWAIT",
    message:
      "Nested <Await> renderers are not supported by the server stream target yet. Move the inner <Await> outside the outer renderer or resolve the nested value before rendering.",
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
      `after the round-trip. Pass JSON-compatible data or serialize the value before it reaches <Await>. ` +
      `See https://github.com/t-k/mreact#streaming-loading-and-await.`,
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

export function unsupportedJsxSpreadChildDiagnostic(loc?: SourceLocation): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_JSX_SPREAD_CHILD",
    message:
      "JSX spread children are not supported yet. Pass an array expression as a normal JSX expression child instead of using `{...children}` syntax.",
    ...(loc === undefined ? {} : { loc }),
  };
}

export function invalidJsxExpressionDiagnostic(
  loc?: SourceLocation,
  context: "text" | "attribute" | "unknown" = "unknown",
): Diagnostic {
  if (context === "text") {
    return {
      level: "error",
      code: "MR_INVALID_JSX_EXPRESSION",
      message:
        "JSX text contains an empty or unparseable expression. To include literal braces in text, use &#123; / &#125; or {'{'} / {'}'} escapes.",
      suggestion: {
        title: "Escape literal braces in text as HTML entities or JSX string expressions.",
        replacement: "&#123; / &#125;",
      },
      ...(loc === undefined ? {} : { loc }),
    };
  }

  if (context === "attribute") {
    return {
      level: "error",
      code: "MR_INVALID_JSX_EXPRESSION",
      message:
        "JSX attribute expression is empty or unparseable. Attribute braces must contain a valid JavaScript expression.",
      suggestion: {
        title: "Use a valid JavaScript expression in braces, or quote literal attribute text.",
        replacement: 'title="literal text"',
      },
      ...(loc === undefined ? {} : { loc }),
    };
  }

  return {
    level: "error",
    code: "MR_INVALID_JSX_EXPRESSION",
    message:
      "JSX expression is empty or unparseable. To include literal braces in text, use &#123; / &#125; or {'{'} / {'}'} escapes.",
    suggestion: {
      title: "Check the JSX expression syntax at this location.",
    },
    ...(loc === undefined ? {} : { loc }),
  };
}
