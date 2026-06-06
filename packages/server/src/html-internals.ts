const attributeEscapePattern = /["&<>]/;
const scriptJsonEscapePattern = /[<\u2028\u2029]/;

export function escapeAttribute(value: string): string {
  return escapeString(value, attributeEscapePattern, attributeReplacement);
}

export function serializeScriptJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError("Cannot serialize undefined as script JSON");
  }

  return escapeString(json, scriptJsonEscapePattern, scriptJsonReplacement);
}

export function renderNonceAttribute(nonce: string | undefined): string {
  return nonce === undefined ? "" : ` nonce="${escapeAttribute(nonce)}"`;
}

export function isPromiseLikeUnknown(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function escapeString(
  value: string,
  pattern: RegExp,
  replacementForCode: (code: number) => string | undefined,
): string {
  const match = pattern.exec(value);

  if (match === null) {
    return value;
  }

  let escaped = "";
  let lastIndex = 0;
  let index = match.index;

  for (; index < value.length; index += 1) {
    const replacement = replacementForCode(value.charCodeAt(index));

    if (replacement === undefined) {
      continue;
    }

    if (lastIndex !== index) {
      escaped += value.substring(lastIndex, index);
    }

    escaped += replacement;
    lastIndex = index + 1;
  }

  return lastIndex === index ? escaped : escaped + value.substring(lastIndex, index);
}

function attributeReplacement(code: number): string | undefined {
  switch (code) {
    case 34:
      return "&quot;";
    case 38:
      return "&amp;";
    case 60:
      return "&lt;";
    case 62:
      return "&gt;";
    default:
      return undefined;
  }
}

function scriptJsonReplacement(code: number): string | undefined {
  switch (code) {
    case 60:
      return "\\u003c";
    case 8232:
      return "\\u2028";
    case 8233:
      return "\\u2029";
    default:
      return undefined;
  }
}
