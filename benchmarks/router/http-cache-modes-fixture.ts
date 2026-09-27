import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeHttpCacheModeFixture(appDir: string): Promise<void> {
  const items = `[${Array.from({ length: 1_000 }, (_item, index) => index).join(",")}]`;
  await mkdir(join(appDir, "cacheable"), { recursive: true });
  await mkdir(join(appDir, "uncached"), { recursive: true });
  await writeFile(join(appDir, "layout.tsx"),
    'export default function Layout() { return <html lang="en"><body><Slot /></body></html>; }\n');
  for (const [route, policy] of [
    ["cacheable", "sMaxAge: 60"],
    ["uncached", "maxAge: 0"],
  ]) {
    await writeFile(join(appDir, route, "page.tsx"), `import { cacheControl } from "@reckona/mreact-router";
const items = ${items};
export default function Page() {
  cacheControl({ ${policy} });
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}
`);
  }
}
