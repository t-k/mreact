import { loadConfigFromFile, type ConfigEnv, type PluginOption, type UserConfig } from "vite";
import type { ResolvedAppRouterProject } from "./config.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import { mreactRouterConfigFromPlugins } from "./vite.js";

export interface LoadedMreactRouterViteConfig {
  importPolicy?: AppRouterImportPolicy | undefined;
  project: ResolvedAppRouterProject;
  serverPort?: number | undefined;
  viteConfig?: UserConfig | undefined;
}

export async function loadMreactRouterViteConfig(options: {
  command: ConfigEnv["command"];
  cwd: string;
  mode?: string | undefined;
}): Promise<ResolvedAppRouterProject> {
  return (await loadMreactRouterViteConfigDetails(options)).project;
}

export async function loadMreactRouterViteConfigDetails(options: {
  command: ConfigEnv["command"];
  cwd: string;
  mode?: string | undefined;
}): Promise<LoadedMreactRouterViteConfig> {
  const loaded = await loadConfigFromFile(
    {
      command: options.command,
      mode: options.mode ?? (options.command === "serve" ? "development" : "production"),
    },
    undefined,
    options.cwd,
  );

  if (loaded === null) {
    throw new Error("vite.config.ts is required for mreact-router CLI commands.");
  }

  const config = mreactRouterConfigFromPlugins(loaded.config.plugins ?? []);

  if (config === undefined) {
    throw new Error("vite.config.ts must include mreactRouter() from @reckona/mreact-router/vite.");
  }

  const serverPort = loaded.config.server?.port;
  const importPolicy = (config as ResolvedAppRouterProject & {
    importPolicy?: AppRouterImportPolicy | undefined;
  }).importPolicy;

  return {
    ...(importPolicy === undefined ? {} : { importPolicy }),
    project: config,
    ...(typeof serverPort === "number" ? { serverPort } : {}),
    viteConfig: {
      ...loaded.config,
      plugins: routeAgnosticVitePlugins(loaded.config.plugins ?? []),
    },
  };
}

function routeAgnosticVitePlugins(plugins: readonly unknown[]): PluginOption[] {
  return plugins.flat(Infinity).filter((plugin): plugin is PluginOption => {
    if (plugin === false || plugin === null || plugin === undefined) {
      return false;
    }

    return mreactRouterConfigFromPlugins([plugin]) === undefined;
  });
}
