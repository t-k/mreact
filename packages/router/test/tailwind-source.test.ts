import { describe, expect, test } from "vitest";
import { prependTailwindSourceDirectives } from "../src/tailwind-source.js";

describe("prependTailwindSourceDirectives", () => {
  test("places source directives after the leading CSS prelude", () => {
    const code = `@charset "UTF-8";
@import "tailwindcss";
@layer reset;

:root { color-scheme: light; }
`;

    expect(
      prependTailwindSourceDirectives({
        code,
        cssFile: "/project/src/styles/global.css",
        sourceDirs: ["/project/src"],
      }),
    ).toBe(`@charset "UTF-8";
@import "tailwindcss";
@layer reset;
@source "../**/*.{js,jsx,ts,tsx,mdx}";

:root { color-scheme: light; }
`);
  });

  test("keeps source directives at the start when no prelude is present", () => {
    expect(
      prependTailwindSourceDirectives({
        code: "@tailwind utilities;\n",
        cssFile: "/project/src/global.css",
        sourceDirs: ["/project/src"],
      }),
    ).toBe('@source "./**/*.{js,jsx,ts,tsx,mdx}";\n@tailwind utilities;\n');
  });

  test("handles URL imports and empty layer blocks in the prelude", () => {
    const code = `@charset "UTF-8";\r
@import url("tailwindcss");\r
@layer reset {}\r
\r
main { color: red; }\r
`;

    expect(
      prependTailwindSourceDirectives({
        code,
        cssFile: "/project/src/styles/global.css",
        sourceDirs: ["/project/src"],
      }),
    ).toBe(`@charset "UTF-8";\r
@import url("tailwindcss");\r
@layer reset {}\r
@source "../**/*.{js,jsx,ts,tsx,mdx}";\r
\r
main { color: red; }\r
`);
  });
});
