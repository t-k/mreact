import { markoRunAdapter } from "./marko-run.js";
import { analogAdapter } from "./analog.js";
import { angularAdapter } from "./angular.js";
import {
  mreactAppRouterAdapter,
  mreactAppRouterLogEnabledAdapter,
  mreactAppRouterReactCompatAdapter,
} from "./mreact-app-router.js";
import { nextAppRouterAdapter } from "./next-app-router.js";
import { nuxtAdapter } from "./nuxt.js";
import { qwikCityAdapter } from "./qwik-city.js";
import { qwikRouterV2Adapter } from "./qwik-router-v2.js";
import { solidStartAdapter } from "./solid-start.js";
import { svelteAdapter } from "./svelte.js";
import { svelteKitAdapter } from "./svelte-kit.js";
import { tanstackStartAdapter } from "./tanstack-start.js";
import { tanstackStartSolidAdapter } from "./tanstack-start-solid.js";
import { vueAdapter } from "./vue.js";
import type { RouterBenchmarkAdapter } from "../types.js";

export const routerBenchmarkAdapters: RouterBenchmarkAdapter[] = [
  markoRunAdapter,
  vueAdapter,
  nuxtAdapter,
  svelteAdapter,
  svelteKitAdapter,
  angularAdapter,
  analogAdapter,
  qwikCityAdapter,
  qwikRouterV2Adapter,
  solidStartAdapter,
  tanstackStartAdapter,
  tanstackStartSolidAdapter,
  nextAppRouterAdapter,
  mreactAppRouterAdapter,
  mreactAppRouterReactCompatAdapter,
  mreactAppRouterLogEnabledAdapter,
];
