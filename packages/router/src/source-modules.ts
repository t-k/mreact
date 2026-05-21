import { extname, join } from "node:path";

export function sourceModuleCandidates(base: string): string[] {
  if (hasSourceModuleExtension(base)) {
    return [base, ...typescriptSourceModuleCandidates(base)];
  }

  if (/\.(?:client|compat)$/.test(base)) {
    return [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.mjs`,
      `${base}.mts`,
      `${base}.cjs`,
      `${base}.cts`,
    ];
  }

  if (extname(base) !== "") {
    return [];
  }

  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mreact.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.mts`,
    `${base}.cjs`,
    `${base}.cts`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.mreact.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
    join(base, "index.mjs"),
    join(base, "index.mts"),
    join(base, "index.cjs"),
    join(base, "index.cts"),
  ];
}

function hasSourceModuleExtension(path: string): boolean {
  return /\.(?:mreact\.tsx|tsx?|jsx?|mjs|mts|cjs|cts)$/.test(path);
}

function typescriptSourceModuleCandidates(path: string): string[] {
  if (path.endsWith(".js")) {
    return [`${path.slice(0, -3)}.ts`, `${path.slice(0, -3)}.tsx`];
  }

  if (path.endsWith(".jsx")) {
    return [`${path.slice(0, -4)}.tsx`];
  }

  if (path.endsWith(".mjs")) {
    return [`${path.slice(0, -4)}.mts`];
  }

  if (path.endsWith(".cjs")) {
    return [`${path.slice(0, -4)}.cts`];
  }

  return [];
}
