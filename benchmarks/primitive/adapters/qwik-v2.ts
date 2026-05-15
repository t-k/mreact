import { readPackageVersion } from "../../shared/env.js";
import type { PrimitiveAdapter } from "../types.js";

export const qwikV2Adapter: PrimitiveAdapter = {
  name: "qwik-v2",
  version: readPackageVersion("@qwik.dev/core"),
  cases: {},
};
