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
    .replace(/(?<![A-Za-z0-9_$)\]])\(\(([^()]+)\) =>/g, "($1) =>")
    .replace(/children: ([A-Za-z_$][\w$.]*)/g, "children: ($1)");
}
export function allocateOxcServerRenderValuePlaceholder(code: string, ast?: unknown): string {
  const baseName = "__mreactServerRenderValue$compiler";
  const canonicalText = collectOxcCanonicalText(ast);
  let name = baseName;
  let index = 1;

  while (code.includes(name) || canonicalText.some((value) => value.includes(name))) {
    name = `${baseName}$${index}`;
    index += 1;
  }

  return name;
}

function collectOxcCanonicalText(ast: unknown): string[] {
  const text: string[] = [];
  const pending = [ast];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      text.push(current);
      continue;
    }
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) pending.push(current[index]);
      continue;
    }

    for (const value of Object.values(current)) pending.push(value);
  }

  return text;
}
