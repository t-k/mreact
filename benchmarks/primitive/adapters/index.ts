import { analogPrimitiveAdapter } from "./analog.js";
import { angularPrimitiveAdapter } from "./angular.js";
import { markoAdapter } from "./marko.js";
import { mreactAdapter } from "./mreact.js";
import { nuxtPrimitiveAdapter } from "./nuxt.js";
import { qwikAdapter } from "./qwik.js";
import { qwikV2Adapter } from "./qwik-v2.js";
import { reactAdapter } from "./react.js";
import { reactCompatAdapter } from "./react-compat.js";
import { solidAdapter } from "./solid.js";
import { solidV2Adapter } from "./solid-v2.js";
import { sveltePrimitiveAdapter } from "./svelte.js";
import { svelteKitPrimitiveAdapter } from "./svelte-kit.js";
import { vuePrimitiveAdapter } from "./vue.js";
import type { PrimitiveAdapter } from "../types.js";

export const primitiveAdapters: PrimitiveAdapter[] = [
  markoAdapter,
  vuePrimitiveAdapter,
  nuxtPrimitiveAdapter,
  sveltePrimitiveAdapter,
  svelteKitPrimitiveAdapter,
  angularPrimitiveAdapter,
  analogPrimitiveAdapter,
  qwikAdapter,
  qwikV2Adapter,
  reactAdapter,
  reactCompatAdapter,
  solidAdapter,
  solidV2Adapter,
  mreactAdapter,
];
