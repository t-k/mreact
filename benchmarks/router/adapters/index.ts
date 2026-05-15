import { markoRunAdapter } from "./marko-run.js";
import { mreactAppRouterAdapter } from "./mreact-app-router.js";
import { nextAppRouterAdapter } from "./next-app-router.js";
import { qwikCityAdapter } from "./qwik-city.js";
import { solidStartAdapter } from "./solid-start.js";
import { tanstackStartAdapter } from "./tanstack-start.js";
import type { RouterBenchmarkAdapter } from "../types.js";

export const routerBenchmarkAdapters: RouterBenchmarkAdapter[] = [
  markoRunAdapter,
  qwikCityAdapter,
  solidStartAdapter,
  tanstackStartAdapter,
  nextAppRouterAdapter,
  mreactAppRouterAdapter,
];
