/** Shared wire format for independently hydrated compat roots. */
export function emitCompatSsrBoundaryHelper(name: string): string {
  return `function ${name}$compat(name, props, render, children, hasChildren) {
  const escapedName = String(name).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  let serializable = !${name}$hasNonSerializableProps(props);
  let json = "{}";
  try { if (serializable) json = JSON.stringify(props ?? {}) ?? "{}"; } catch { serializable = false; }
  const escapedJson = json.replaceAll("<", "\\\\u003c").replaceAll("&", "\\\\u0026").replaceAll(">", "\\\\u003e");
  const propsHtml = '<script type="application/json" data-mreact-client-boundary-props="' + escapedName + '">' + escapedJson + '</script>';
  if (!serializable || hasChildren) return '<template data-mreact-client-boundary="' + escapedName + '"' + (serializable ? '' : ' data-mreact-client-boundary-nonserializable="true"') + '></template>' + children + propsHtml;
  const id = "compat-" + globalThis.crypto.randomUUID();
  const html = render("", id, JSON.parse(json));
  return '<template data-mreact-client-boundary="' + escapedName + '" data-mreact-client-boundary-fallback="component" data-mreact-compat-resume="' + id + '"></template><!--mreact-h:start:' + id + '-->' + html + '<!--mreact-h:end:' + id + '-->' + propsHtml;
}`;
}
