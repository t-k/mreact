import type { PrimitiveCaseDefinition } from "./types.js";

export const primitiveCases: PrimitiveCaseDefinition[] = [
  {
    name: "create 1k rows",
    description: "Creates 1,000 DOM rows from an empty host and validates the final DOM.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "replace all 1k rows",
    description: "Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "update every 10th in 10k rows",
    description:
      "Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.",
    count: 10_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "select row in 10k rows",
    description:
      "Selects one row in a 10,000-row list by toggling selection attributes without changing row text.",
    count: 10_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "append 1k rows to 10k rows",
    description:
      "Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.",
    count: 10_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "remove row from 1k rows",
    description: "Removes one keyed row from the middle of an existing 1,000-row list.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "clear 10k rows",
    description: "Clears an existing 10,000-row list and validates that no row elements remain.",
    count: 10_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "keyed reverse 1k rows",
    description: "Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "create 1k event targets",
    description:
      "Creates 1,000 button event targets and measures initial interactive wiring cost without dispatching events.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "text binding update 1k",
    description: "Updates one reactive text value that is bound to 1,000 text nodes.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "computed fan-out 1k",
    description:
      "Updates one source value that fans out through a derived value into 1,000 displayed text nodes.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "computed fan-in 1k",
    description:
      "Updates the inputs feeding one aggregate and validates one derived aggregate text output. Caveat: this is not a direct cross-framework source-write comparison because mreact, Solid, and Solid v2 update 1,000 fine-grained sources, while React, Marko, and Qwik update one array/props payload.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "source write 1k",
    description:
      "Updates 1,000 fine-grained source values without subscribers, derived values, DOM writes, or framework-level re-render work, then validates the final source values. Frameworks without an equivalent source primitive report this case as unsupported.",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "repeated create update clear memory",
    description:
      "Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.",
    count: 1_000,
    metric: "memory",
    unit: "bytes",
  },
];
