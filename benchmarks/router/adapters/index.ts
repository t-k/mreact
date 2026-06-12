import { markoRunAdapter } from "./marko-run.js";
import { analogAdapter } from "./analog.js";
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
import { svelteKitAdapter } from "./svelte-kit.js";
import { tanstackStartAdapter } from "./tanstack-start.js";
import { tanstackStartSolidAdapter } from "./tanstack-start-solid.js";
import type { RouterBenchmarkAdapter } from "../types.js";

export const routerBenchmarkAdapters: RouterBenchmarkAdapter[] = [
  markoRunAdapter,
  nuxtAdapter,
  svelteKitAdapter,
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
