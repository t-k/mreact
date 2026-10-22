import { createCompilerModuleContext } from "@reckona/mreact-compiler/internal";
import type { StaticMiddlewareConfig } from "./middleware.js";

// Keep parsing off repeated request paths without retaining arbitrary source
// volumes. Only build/render import this module; edge middleware stays light.
const configCache = new Map<string, StaticMiddlewareConfig>();
const unknownConfig: StaticMiddlewareConfig = { hasMatcher: true };

export function parseStaticMiddlewareConfig(code: string): StaticMiddlewareConfig {
  const cached = configCache.get(code);
  if (cached !== undefined) return cached;
  const result = readConfig(code);
  if (code.length <= 65_536) {
    if (configCache.size >= 64) configCache.delete(configCache.keys().next().value!);
    configCache.set(code, result);
  }
  return result;
}

function readConfig(code: string): StaticMiddlewareConfig {
  const parsed = createCompilerModuleContext({ code, filename: "middleware.ts" });
  if (parsed.parseErrors.length > 0) return unknownConfig;
  if (configMayEscape(parsed.program)) return unknownConfig;
  const body = node(parsed.program).body;
  if (!Array.isArray(body)) return unknownConfig;
  for (const statement of body) {
    const exported = node(statement);
    if (exported.type !== "ExportNamedDeclaration") continue;
    const declaration = node(exported.declaration);
    if (declaration.type !== "VariableDeclaration" || declaration.kind !== "const") continue;
    if (!Array.isArray(declaration.declarations)) continue;
    for (const entry of declaration.declarations) {
      const declarator = node(entry);
      if (node(declarator.id).name !== "config") continue;
      let value = node(declarator.init);
      while (value.type === "TSAsExpression" || value.type === "TSSatisfiesExpression") {
        value = node(value.expression);
      }
      if (value.type !== "ObjectExpression" || !Array.isArray(value.properties)) return unknownConfig;
      const result: StaticMiddlewareConfig = { hasMatcher: false };
      const seen = new Set<string>();
      for (const entry of value.properties) {
        const property = node(entry);
        if (property.type !== "Property" || property.computed || property.method || property.kind !== "init") return unknownConfig;
        const key = node(property.key);
        const name = key.type === "Identifier" ? key.name : key.value;
        if (typeof name !== "string" || seen.has(name)) return unknownConfig;
        seen.add(name);
        const propValue = node(property.value);
        if (name === "id") {
          const id = readString(propValue);
          if (id !== undefined) result.id = id;
        } else if (name === "matcher") {
          result.hasMatcher = true;
          const matcher = readString(propValue);
          if (matcher !== undefined) result.matcher = matcher;
          else if (propValue.type === "ArrayExpression" && Array.isArray(propValue.elements)) {
            const items = propValue.elements.map((item) => readString(node(item)));
            if (items.every((item): item is string => item !== undefined)) result.matcher = items;
          }
        }
      }
      return result;
    }
  }
  // Aliased exports and other declarations must be evaluated by the module.
  return unknownConfig;
}

function readString(value: Record<string, unknown>): string | undefined {
  return value.type === "Literal" && typeof value.value === "string" ? value.value : undefined;
}

function node(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function configMayEscape(program: unknown): boolean {
  const pending = [program];
  let references = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (typeof current === "object" && current !== null) {
      const value = node(current);
      if (value.type === "Identifier") {
        if (value.name === "eval") return true;
        if (value.name === "config" && ++references > 1) return true;
      }
      pending.push(...Object.values(value));
    }
  }
  return false;
}
