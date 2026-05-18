import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface WorkspacePackageFileOptions {
  currentFileUrl: string;
  entry: string;
  monorepoDir: string;
  packageName: string;
  sourceExtension?: "ts" | "tsx" | undefined;
}

export function workspacePackageFile(options: WorkspacePackageFileOptions): string {
  const currentDir = dirname(fileURLToPath(options.currentFileUrl));
  const packageRoot = dirname(currentDir);
  const packagesOrScopeDir = dirname(packageRoot);
  const packageDir = publishedPackageDir(packageRoot, options.packageName) ?? options.monorepoDir;
  const entryFile = currentDir.endsWith(`${sep}dist`)
    ? `dist/${options.entry}.js`
    : `src/${options.entry}.${options.sourceExtension ?? "ts"}`;

  return join(packagesOrScopeDir, packageDir, entryFile);
}

function publishedPackageDir(packageRoot: string, packageName: string): string | undefined {
  if (basename(packageRoot) !== "mreact-router") {
    return undefined;
  }

  const parts = packageName.split("/");

  return parts.length === 2 && parts[0] === "@reckona" ? parts[1] : undefined;
}
