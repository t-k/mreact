import { dirname, relative, sep } from "node:path";

export function prependTailwindSourceDirectives(options: {
  code: string;
  cssFile: string;
  sourceDirs: readonly string[];
}): string {
  if (!isTailwindCssEntry(options.code)) {
    return options.code;
  }

  const cssDir = dirname(options.cssFile);
  const directives = [...new Set(options.sourceDirs)]
    .map((sourceDir) => `${tailwindSourceDirective(cssDir, sourceDir)}\n`)
    .join("");

  if (directives.length === 0) {
    return options.code;
  }

  const insertionIndex = leadingCssPreludeEnd(options.code);
  const prefix = options.code.slice(0, insertionIndex);
  const suffix = options.code.slice(insertionIndex);
  const lineEnding = suffix.startsWith("\r\n") ? "\r\n" : "\n";
  const existingLineEnding = suffix.startsWith(lineEnding) ? lineEnding : "";
  const separator = insertionIndex === 0 ? "" : existingLineEnding || lineEnding;
  const formattedDirectives = directives.replaceAll("\n", lineEnding);
  return `${prefix}${separator}${formattedDirectives}${suffix.slice(existingLineEnding.length)}`;
}

function leadingCssPreludeEnd(code: string): number {
  let cursor = 0;
  let lastRuleEnd = 0;

  for (;;) {
    cursor = skipCssTrivia(code, cursor);
    const ruleEnd = consumeLeadingCssRule(code, cursor);
    if (ruleEnd === undefined) {
      return lastRuleEnd;
    }

    lastRuleEnd = ruleEnd;
    cursor = ruleEnd;
  }
}

function skipCssTrivia(code: string, start: number): number {
  let cursor = start;
  while (cursor < code.length) {
    if (/\s/u.test(code[cursor] ?? "")) {
      cursor += 1;
      continue;
    }

    if (code.startsWith("/*", cursor)) {
      const commentEnd = code.indexOf("*/", cursor + 2);
      if (commentEnd < 0) {
        return code.length;
      }
      cursor = commentEnd + 2;
      continue;
    }

    break;
  }

  return cursor;
}

function consumeLeadingCssRule(code: string, start: number): number | undefined {
  const match = /^@(charset|import|layer)\b/iu.exec(code.slice(start));
  const ruleName = match?.[1]?.toLowerCase();
  if (match === null || ruleName === undefined) {
    return undefined;
  }

  let quote: '"' | "'" | undefined;
  let parentheses = 0;
  for (let cursor = start + match[0].length; cursor < code.length; cursor += 1) {
    const character = code[cursor];
    if (character === undefined) {
      return undefined;
    }

    if (quote !== undefined) {
      if (character === "\\") {
        cursor += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (code.startsWith("/*", cursor)) {
      const commentEnd = code.indexOf("*/", cursor + 2);
      if (commentEnd < 0) {
        return undefined;
      }
      cursor = commentEnd + 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (character === ";" && parentheses === 0) {
      return cursor + 1;
    }
    if (character === "{" && parentheses === 0) {
      if (ruleName !== "layer") {
        return undefined;
      }

      const blockEnd = consumeCssBlock(code, cursor);
      if (blockEnd === undefined || !isCssTrivia(code.slice(cursor + 1, blockEnd - 1))) {
        return undefined;
      }
      return blockEnd;
    }
    if (character === "}" && parentheses === 0) {
      return undefined;
    }
  }

  return undefined;
}

function consumeCssBlock(code: string, start: number): number | undefined {
  let depth = 1;
  let quote: '"' | "'" | undefined;
  for (let cursor = start + 1; cursor < code.length; cursor += 1) {
    const character = code[cursor];
    if (character === undefined) {
      return undefined;
    }

    if (quote !== undefined) {
      if (character === "\\") {
        cursor += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (code.startsWith("/*", cursor)) {
      const commentEnd = code.indexOf("*/", cursor + 2);
      if (commentEnd < 0) {
        return undefined;
      }
      cursor = commentEnd + 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
  }

  return undefined;
}

function isCssTrivia(value: string): boolean {
  return skipCssTrivia(value, 0) === value.length;
}

function isTailwindCssEntry(code: string): boolean {
  return (
    /@import\s+(?:url\()?["']tailwindcss(?:\/[^"']*)?["']\)?/u.test(code) ||
    /@tailwind\s+(?:base|components|utilities)\b/u.test(code)
  );
}

function tailwindSourceDirective(cssDir: string, sourceDir: string): string {
  const relativeSourceDir = relative(cssDir, sourceDir).split(sep).join("/");
  const normalizedSourceDir =
    relativeSourceDir === ""
      ? "."
      : relativeSourceDir.startsWith(".")
        ? relativeSourceDir
        : `./${relativeSourceDir}`;

  return `@source ${JSON.stringify(`${normalizedSourceDir}/**/*.{js,jsx,ts,tsx,mdx}`)};`;
}
