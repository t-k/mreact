import type { PluginOption } from "vite";

const pluginObjectIds = new WeakMap<object, number>();
let nextPluginObjectId = 1;

export function vitePluginsCacheKey(plugins: readonly PluginOption[] | undefined): string {
  if (plugins === undefined || plugins.length === 0) {
    return "";
  }

  return flattenVitePluginOptions(plugins)
    .map((plugin, index) => `${index}:${plugin.name ?? "<anonymous>"}:${plugin.objectId}`)
    .join("\0");
}

function flattenVitePluginOptions(
  options: readonly PluginOption[],
): Array<{ name?: string; objectId: number }> {
  const plugins: Array<{ name?: string; objectId: number }> = [];

  for (const option of options) {
    if (Array.isArray(option)) {
      plugins.push(...flattenVitePluginOptions(option));
      continue;
    }

    if (option === false || option === null || option === undefined || typeof option === "string") {
      continue;
    }

    if (typeof option === "object" && "then" in option) {
      plugins.push({ name: "<async>", objectId: pluginObjectId(option) });
      continue;
    }

    plugins.push({ name: option.name, objectId: pluginObjectId(option) });
  }

  return plugins;
}

function pluginObjectId(plugin: object): number {
  const cached = pluginObjectIds.get(plugin);

  if (cached !== undefined) {
    return cached;
  }

  const id = nextPluginObjectId;
  nextPluginObjectId += 1;
  pluginObjectIds.set(plugin, id);
  return id;
}
