import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyzeCompatSsrEligibility } from "../src/compat-ssr.js";

const source = "@reckona/mreact-compat/hooks";
const safe = [
  "useState",
  "useReducer",
  "useRef",
  "useId",
  "useMemo",
  "useCallback",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
];
const cases: Array<[string, string, boolean]> = [
  ...["@reckona/mreact-compat", "react"].flatMap((entry) =>
    [...safe, "useContext", "createContext", "Fragment"].map((name): [string, string, boolean] => [
      `${entry}: ${name}`,
      `import { ${name} } from "${entry}";`,
      true,
    ]),
  ),
  ...safe.map((name): [string, string, boolean] => [
    name,
    `import { ${name} as hook } from "${source}";`,
    true,
  ]),
  ...[
    "Fragment",
    "useContext",
    "createContext",
    "useSyncExternalStore",
    "use",
    "startTransition",
    "unknownHook",
  ].map((name): [string, string, boolean] => [name, `import { ${name} } from "${source}";`, false]),
  ["default import", `import hooks from "${source}";`, false],
  ["namespace import", `import * as hooks from "${source}";`, false],
  ["side-effect import", `import "${source}";`, false],
  ["star re-export", `export * from "${source}";`, false],
  ["named re-export", `export { useState } from "${source}";`, false],
  ["mixed unsafe names", `import { useState, useSyncExternalStore } from "${source}";`, false],
  [
    "unknown sibling entry",
    'import { useState } from "@reckona/mreact-compat/hooks-extra";',
    false,
  ],
  ["mixed type import", `import { useState, type EffectCallback } from "${source}";`, true],
  ["type-only import", `import type { EffectCallback } from "${source}";`, true],
];

test.each(cases)("hooks entry SSR eligibility: %s", async (_name, imports, eligible) => {
  const root = await mkdtemp(join(tmpdir(), "mreact-hooks-entry-"));
  try {
    const filename = join(root, "Counter.compat.tsx");
    await writeFile(
      filename,
      `${imports}\nexport function Counter() { return <button>0</button>; }`,
    );
    expect((await analyzeCompatSsrEligibility(filename)).eligible).toBe(eligible);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["document.title", "Math.random()", "screen.width"])(
  "hooks entry still rejects unsafe rendering: %s",
  async (expression) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-hooks-unsafe-"));
    try {
      const filename = join(root, "Counter.compat.tsx");
      await writeFile(
        filename,
        `import { useState } from "${source}"; export function Counter() { const [value] = useState(${expression}); return <button>{value}</button>; }`,
      );
      expect((await analyzeCompatSsrEligibility(filename)).eligible).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
