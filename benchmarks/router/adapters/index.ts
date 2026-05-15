import { markoRunAdapter } from "./marko-run.js";
import {
  mreactAppRouterAdapter,
  mreactAppRouterLogEnabledAdapter,
} from "./mreact-app-router.js";
import { nextAppRouterAdapter } from "./next-app-router.js";
import { qwikCityAdapter } from "./qwik-city.js";
import { qwikRouterV2Adapter } from "./qwik-router-v2.js";
import { solidStartAdapter } from "./solid-start.js";
import { tanstackStartAdapter } from "./tanstack-start.js";
import type { RouterBenchmarkAdapter } from "../types.js";

export const routerBenchmarkAdapters: RouterBenchmarkAdapter[] = [
  markoRunAdapter,
  qwikCityAdapter,
  qwikRouterV2Adapter,
  solidStartAdapter,
  tanstackStartAdapter,
  nextAppRouterAdapter,
  mreactAppRouterAdapter,
  mreactAppRouterLogEnabledAdapter,
];
