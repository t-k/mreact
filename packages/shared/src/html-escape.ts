const textEscapePattern = /[&<>]/;
const attributeEscapePattern = /["&<>]/;
const quotedAttributeEscapePattern = /["&]/;

/** Escapes text content for safe insertion between HTML tags. */
export function escapeHtmlText(value: unknown): string {
  return escapeHtml(String(value), textEscapePattern, textReplacement);
}

/** Escapes a value for safe use in an HTML attribute. */
export function escapeHtmlAttribute(value: unknown): string {
  return escapeHtml(String(value), attributeEscapePattern, attributeReplacement);
}

/** Escapes a value for safe use inside an already quoted HTML attribute. */
export function escapeHtmlQuotedAttribute(value: unknown): string {
  return escapeHtml(String(value), quotedAttributeEscapePattern, quotedAttributeReplacement);
}

function escapeHtml(
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

function textReplacement(code: number): string | undefined {
  switch (code) {
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

function attributeReplacement(code: number): string | undefined {
  if (code === 34) {
    return "&quot;";
  }

  return textReplacement(code);
}

function quotedAttributeReplacement(code: number): string | undefined {
  switch (code) {
    case 34:
      return "&quot;";
    case 38:
      return "&amp;";
    default:
      return undefined;
  }
}
