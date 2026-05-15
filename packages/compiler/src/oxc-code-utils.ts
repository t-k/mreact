export function stripOxcGeneratedImports(code: string): string {
  return code
    .split("\n")
    .filter(
      (line) =>
        !/^\s*import\s+\{.*\}\s+from\s+["@']@reckona\/mreact-compat\/jsx-runtime/.test(line),
    )
    .join("\n");
}

export function normalizeOxcExpressionCode(code: string): string {
  return code
    .trim()
    .replace(/;$/, "")
    .replace(/\/\* @__PURE__ \*\/\s*/g, "")
    .replace(/children: \(\(([^()]+)\) =>/g, "children: ($1) =>")
    .replace(/\(\(([^()]+)\) =>/g, "($1) =>")
    .replace(/children: ([A-Za-z_$][\w$.]*)/g, "children: ($1)");
}
