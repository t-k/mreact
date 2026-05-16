import { markoAdapter } from "./marko.js";
import { mreactAdapter } from "./mreact.js";
import { qwikAdapter } from "./qwik.js";
import { qwikV2Adapter } from "./qwik-v2.js";
import { reactAdapter } from "./react.js";
import { solidAdapter } from "./solid.js";
import { solidV2Adapter } from "./solid-v2.js";
import type { PrimitiveAdapter } from "../types.js";

export const primitiveAdapters: PrimitiveAdapter[] = [
  markoAdapter,
  qwikAdapter,
  qwikV2Adapter,
  reactAdapter,
  solidAdapter,
  solidV2Adapter,
  mreactAdapter,
];
