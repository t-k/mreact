import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function registerPrimitiveBenchmarkAliases(parentUrl: URL): void {
  const packageAliases = {
    "@reckona/mreact-reactive-core": pathToFileURL(
      join(process.cwd(), "packages", "reactive-core", "src", "index.ts"),
    ).href,
    "@reckona/mreact-reactive-core/testing": pathToFileURL(
      join(process.cwd(), "packages", "reactive-core", "src", "testing.ts"),
    ).href,
    "@reckona/mreact-reactive-core/internal": pathToFileURL(
      join(process.cwd(), "packages", "reactive-core", "src", "internal.ts"),
    ).href,
    "@reckona/mreact-reactive-dom": pathToFileURL(
      join(process.cwd(), "packages", "reactive-dom", "src", "index.ts"),
    ).href,
    "@reckona/mreact-compat": pathToFileURL(
      join(process.cwd(), "packages", "react-compat", "src", "index.ts"),
    ).href,
  };

  register(
    `data:text/javascript,${encodeURIComponent(`
      const aliases = new Map(${JSON.stringify(Object.entries(packageAliases))});

      export async function resolve(specifier, context, nextResolve) {
        const url = aliases.get(specifier);

        if (url !== undefined) {
          return { url, shortCircuit: true };
        }

        return nextResolve(specifier, context);
      }
    `)}`,
    parentUrl,
  );
}
