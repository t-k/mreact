export function escapeHtmlText(value: unknown): string {
  const string = String(value);
  return string.length < 128 ? escapeHtmlTextShort(string) : escapeHtmlTextReplaceAll(string);
}

export function escapeHtmlAttribute(value: unknown): string {
  const string = String(value);
  return string.length < 128
    ? escapeHtmlAttributeShort(string)
    : escapeHtmlAttributeReplaceAll(string);
}

export function escapeHtmlQuotedAttribute(value: unknown): string {
  const string = String(value);
  return string.length < 128
    ? escapeHtmlQuotedAttributeShort(string)
    : escapeHtmlQuotedAttributeReplaceAll(string);
}

function escapeHtmlTextReplaceAll(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttributeReplaceAll(value: string): string {
  return escapeHtmlTextReplaceAll(value).replaceAll("\"", "&quot;");
}

function escapeHtmlQuotedAttributeReplaceAll(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
}

function escapeHtmlTextShort(value: string): string {
  return escapeHtmlShort(value, EscapeMode.Text);
}

function escapeHtmlAttributeShort(value: string): string {
  return escapeHtmlShort(value, EscapeMode.Attribute);
}

function escapeHtmlQuotedAttributeShort(value: string): string {
  return escapeHtmlShort(value, EscapeMode.QuotedAttribute);
}

const enum EscapeMode {
  Text,
  Attribute,
  QuotedAttribute,
}

function escapeHtmlShort(value: string, mode: EscapeMode): string {
  let result = "";
  let last = 0;

  for (let index = 0; index < value.length; index += 1) {
    const replacement = escapeReplacement(value.charCodeAt(index), mode);
    if (replacement === undefined) {
      continue;
    }

    result += value.slice(last, index) + replacement;
    last = index + 1;
  }

  return last === 0 ? value : result + value.slice(last);
}

function escapeReplacement(code: number, mode: EscapeMode): string | undefined {
  if (code === 38) return "&amp;";
  if (mode !== EscapeMode.QuotedAttribute) {
    if (code === 60) return "&lt;";
    if (code === 62) return "&gt;";
  }
  if (mode !== EscapeMode.Text && code === 34) return "&quot;";
  return undefined;
}
