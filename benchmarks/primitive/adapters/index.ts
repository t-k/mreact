import { angularPrimitiveAdapter } from "./angular.js";
import { markoAdapter } from "./marko.js";
import { mreactAdapter } from "./mreact.js";
import { qwikAdapter } from "./qwik.js";
import { qwikV2Adapter } from "./qwik-v2.js";
import { reactAdapter } from "./react.js";
import { reactCompatAdapter } from "./react-compat.js";
import { solidAdapter } from "./solid.js";
import { solidV2Adapter } from "./solid-v2.js";
import { sveltePrimitiveAdapter } from "./svelte.js";
import { vuePrimitiveAdapter } from "./vue.js";
import type { PrimitiveAdapter } from "../types.js";

export const primitiveAdapters: PrimitiveAdapter[] = [
  markoAdapter,
  vuePrimitiveAdapter,
  sveltePrimitiveAdapter,
  angularPrimitiveAdapter,
  qwikAdapter,
  qwikV2Adapter,
  reactAdapter,
  reactCompatAdapter,
  solidAdapter,
  solidV2Adapter,
  mreactAdapter,
];
