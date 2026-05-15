export function escapeHtmlText(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function escapeHtmlAttribute(value: unknown): string {
  return escapeHtmlText(value).replaceAll("\"", "&quot;");
}

export function escapeHtmlQuotedAttribute(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
}
