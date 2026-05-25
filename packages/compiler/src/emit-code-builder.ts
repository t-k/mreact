export interface CodeBuilder {
  section(code: string | undefined, options?: CodeBuilderSectionOptions): void;
  toString(): string;
}

export interface CodeBuilderSectionOptions {
  leadingBlankLines?: number;
}

export function createCodeBuilder(): CodeBuilder {
  const sections: string[] = [];

  return {
    section(code, options = {}) {
      if (code === undefined || code === "") {
        return;
      }

      const leadingBlankLines = options.leadingBlankLines ?? 1;
      const prefix = sections.length === 0 ? "" : "\n".repeat(leadingBlankLines + 1);
      sections.push(`${prefix}${code}`);
    },
    toString() {
      return sections.length === 0 ? "\n" : `${sections.join("")}\n`;
    },
  };
}
