import { mreactAdapter } from "./mreact.js";
import { reactAdapter } from "./react.js";
import { solidAdapter } from "./solid.js";
import type { PrimitiveAdapter } from "../types.js";

export const primitiveAdapters: PrimitiveAdapter[] = [
  reactAdapter,
  solidAdapter,
  mreactAdapter,
];
