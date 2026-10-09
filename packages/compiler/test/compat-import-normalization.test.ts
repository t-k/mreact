import { describe, expect, test, vi } from "vitest";
import { createCompilerModuleContextWithOxc } from "../src/compiler-module-context.js";
import { transform, transformCompilerModuleContext } from "../src/transform.js";
import { normalizeCompatPublicHookImports } from "../src/compat-import-normalization.js";
import { parseSync } from "oxc-parser";

vi.mock("oxc-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("oxc-parser")>();
  return { ...actual, parseSync: vi.fn(actual.parseSync) };
});

const compile = (code: string) =>
  transform({ code, filename: "Counter.compat.tsx", target: "client", mode: "compat", dev: false });

describe("compat public default hook import normalization", () => {
  test("uses named hooks from the same public entrypoint", () => {
    const output = compile(
      'import React, { memo } from "@reckona/mreact"; export function Counter() { const [count] = React.useState(0); React.useEffect(() => {}, []); return <button>{count}</button>; }',
    );
    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("import React");
    expect(output.code).not.toContain("React.useState");
    expect(output.code).not.toContain("React.useEffect");
    expect(output.code).toMatch(/import \{ memo \} from "@reckona\/mreact"/);
    expect(output.code).toMatch(/useState as _react_useState/);
    expect(output.code).toMatch(/useEffect as _react_useEffect/);
    expect(output.code).toContain("_react_useState(0)");
  });

  test("keeps original module context and allocates aliases across nested scopes", () => {
    const code =
      'import R from "@reckona/mreact"; function other(_react_useState) { return _react_useState; } export function Counter() { const [count] = R.useState(0); return <span>{count}</span>; }';
    const moduleContext = createCompilerModuleContextWithOxc({
      code,
      filename: "Counter.compat.tsx",
    });
    const output = transformCompilerModuleContext({
      code,
      filename: moduleContext.filename,
      moduleContext,
      target: "client",
      mode: "compat",
      dev: false,
    });
    expect(output.code).toContain("useState as _react_useState$1");
    expect(output.code).toContain("_react_useState$1(0)");
    expect(moduleContext.code).toBe(code);
    expect(output.code).toBe(compile(code).code);
  });

  test.each([
    "const passed = React;",
    "const hook = React.useState;",
    'const hook = React["useState"];',
    'const useState = "useState"; React[useState](0);',
    "new React.useState(0);",
    "consume(React.useState);",
    "React.useState = replacement;",
    "delete React.useState;",
    "({hook: React.useState} = replacement);",
    "for (React.useState of replacements) {}",
    "React.useState?.(0);",
    "React?.useState(0);",
    "function shadow(React) { return React.useState(0); }",
    'const value = eval("React.useState");',
    "const value = React.default;",
  ])("keeps the whole default binding when usage is unproven: %s", (statement) => {
    const output = compile(
      `import React from "@reckona/mreact"; ${statement} export function Counter() { const [count] = React.useState(0); return <span>{count}</span>; }`,
    );
    expect(output.code).toContain('import React from "@reckona/mreact"');
    expect(output.code).toContain("React.useState(0)");
  });

  test.each(["@reckona/mreact-compat", "react", "unrelated"])(
    "preserves default objects from %s",
    (source) => {
      expect(
        compile(
          `import React from "${source}"; export function Counter() { const [count] = React.useState(0); return <span>{count}</span>; }`,
        ).code,
      ).toContain(`import React from "${source}"`);
    },
  );

  test("preserves namespace imports and unknown APIs", () => {
    expect(
      compile(
        'import * as React from "@reckona/mreact"; export function Counter() { const [count] = React.useState(0); return <span>{count}</span>; }',
      ).code,
    ).toContain("import * as React");
    expect(
      compile(
        'import React from "@reckona/mreact"; export function Counter() { const value = React.unknown(); return <span>{value}</span>; }',
      ).code,
    ).toContain("import React");
  });

  test("supports non-ASCII input and repeated hook calls", () => {
    const output = compile(
      'import React from "@reckona/mreact"; const label = "😀"; export function Counter() { const [a] = React.useState(0); const [b] = React.useState(1); return <span>{label}{a}{b}</span>; }',
    );
    expect(output.code).not.toContain("import React");
    expect(output.code.match(/useState as /g)).toHaveLength(1);
    expect(output.code).toContain("_react_useState(0)");
    expect(output.code).toContain("_react_useState(1)");
  });

  test.each([
    "useState",
    "useReducer",
    "useRef",
    "useMemo",
    "useCallback",
    "useEffect",
    "useLayoutEffect",
  ])("normalizes the proven %s hook", (hook) => {
    const source = `import React from '@reckona/mreact'; React.${hook}(value);`;
    const output = normalizeCompatPublicHookImports(source);
    expect(output).toBe(
      `import { ${hook} as _react_${hook} } from "@reckona/mreact"; _react_${hook}(value);`,
    );
    expect(parseSync("output.js", output).errors).toEqual([]);
  });

  test("preserves other default sources in a mixed module", () => {
    const source =
      'import { memo } from "@reckona/mreact"; import React from "@reckona/mreact-compat"; React.useState(0);';
    expect(normalizeCompatPublicHookImports(source)).toBe(source);
  });

  test("does not rewrite malformed, attributed, or unused default imports", () => {
    for (const source of [
      'import React from "@reckona/mreact"; React.useState(0); const [',
      'import React from "@reckona/mreact"; React.useState(0); return 1;',
      'import React from "@reckona/mreact" with { type: "json" }; React.useState(0);',
      'import React from "@reckona/mreact"; const label = "value";',
    ]) {
      expect(normalizeCompatPublicHookImports(source)).toBe(source);
    }
  });

  test("distinguishes an imported binding from a property with the same name", () => {
    const source =
      'import useState from "@reckona/mreact"; other.useState(0); useState.useState(0);';
    expect(normalizeCompatPublicHookImports(source)).toBe(source);
  });

  test("preserves namespace specifiers alongside a default import", () => {
    const source =
      'import React, * as API from "@reckona/mreact"; React.useState(0); API.useState(1);';
    const output = normalizeCompatPublicHookImports(source);
    expect(output).toBe(
      'import * as API from "@reckona/mreact";\nimport { useState as _react_useState } from "@reckona/mreact"; _react_useState(0); API.useState(1);',
    );
  });

  test("keeps multiple aliases unique and generated JavaScript valid", () => {
    const output = normalizeCompatPublicHookImports(
      'import R from "@reckona/mreact"; import S from "@reckona/mreact"; R.useState(0); S.useState(1);',
    );
    expect(output).toContain("useState as _react_useState$1");
    expect(parseSync("output.js", output).errors).toEqual([]);
    const mixed = normalizeCompatPublicHookImports(
      'import R, { memo, useRef as ref } from "@reckona/mreact"; R.useState(0); R.useEffect(effect, []);',
    );
    expect(mixed).toContain('import { memo, useRef as ref } from "@reckona/mreact";');
    expect(parseSync("output.js", mixed).errors).toEqual([]);
  });

  test("avoids an extra parse when the public entrypoint is absent", () => {
    vi.mocked(parseSync).mockClear();
    const source = 'import { jsx } from "@reckona/mreact-compat/jsx-runtime"; jsx("span", {});';
    expect(normalizeCompatPublicHookImports(source)).toBe(source);
    expect(parseSync).not.toHaveBeenCalled();
  });
});
