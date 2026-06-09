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

  return directives.length === 0 ? options.code : `${directives}${options.code}`;
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
