export type PrimitiveBrowserFramework = "mreact" | "mreact react-compat";

export type PrimitiveBrowserCaseName =
  | "browser create 1k rows"
  | "browser update every 10th in 10k rows"
  | "browser select row in 10k rows"
  | "browser clear 10k rows";

export interface PrimitiveBrowserCaseDefinition {
  name: PrimitiveBrowserCaseName;
  count: number;
  description: string;
}

export const primitiveBrowserFrameworks: PrimitiveBrowserFramework[] = [
  "mreact",
  "mreact react-compat",
];

export const primitiveBrowserCases: PrimitiveBrowserCaseDefinition[] = [
  {
    name: "browser create 1k rows",
    count: 1_000,
    description:
      "Creates 1,000 keyed DOM rows in real Chromium, mirroring the primitive create case without happy-dom.",
  },
  {
    name: "browser update every 10th in 10k rows",
    count: 10_000,
    description:
      "Updates every tenth row in a 10,000-row keyed DOM in real Chromium, exposing real DOM update costs hidden by happy-dom.",
  },
  {
    name: "browser select row in 10k rows",
    count: 10_000,
    description:
      "Toggles selection attributes for one row in a 10,000-row keyed DOM in real Chromium.",
  },
  {
    name: "browser clear 10k rows",
    count: 10_000,
    description:
      "Clears a 10,000-row keyed DOM in real Chromium to validate happy-dom clear rankings against browser behavior.",
  },
];
