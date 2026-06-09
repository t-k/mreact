import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const docsSiteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(docsSiteRoot, "..", "..", "docs", "api", "index.json");
const target = join(docsSiteRoot, "src", "generated", "api-reference.json");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
