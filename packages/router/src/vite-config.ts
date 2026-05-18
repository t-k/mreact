import { loadConfigFromFile, type ConfigEnv } from "vite";
import type { ResolvedAppRouterProject } from "./config.js";
import { mreactRouterConfigFromPlugins } from "./vite.js";

export interface LoadedMreactRouterViteConfig {
  project: ResolvedAppRouterProject;
  serverPort?: number | undefined;
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

  return {
    project: config,
    ...(typeof serverPort === "number" ? { serverPort } : {}),
  };
}
