import { markoAdapter } from "./marko.js";
import { mreactAdapter } from "./mreact.js";
import { qwikAdapter } from "./qwik.js";
import { reactAdapter } from "./react.js";
import { solidAdapter } from "./solid.js";
import type { PrimitiveAdapter } from "../types.js";

export const primitiveAdapters: PrimitiveAdapter[] = [
  markoAdapter,
  qwikAdapter,
  reactAdapter,
  solidAdapter,
  mreactAdapter,
];
