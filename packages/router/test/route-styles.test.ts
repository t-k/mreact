import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  collectRouteCssFilesFromSources,
  createCachedRouteSourceReader,
} from "../src/route-styles.js";

describe("route stylesheet discovery", () => {
  test("reuses a request-scoped source reader across route CSS discovery", async () => {
    const appDir = "/repo/src/app";
    const layoutFile = join(appDir, "layout.tsx");
    const firstPage = join(appDir, "first", "page.tsx");
    const secondPage = join(appDir, "second", "page.tsx");
    const sources = new Map([
      [layoutFile, 'import "../global.css"; export default function Layout() { return null; }'],
      [firstPage, 'import "../../first.css"; export default function Page() { return null; }'],
      [secondPage, 'import "../../second.css"; export default function Page() { return null; }'],
    ]);
    const reads = new Map<string, number>();
    const readSource = createCachedRouteSourceReader((file) => {
      reads.set(file, (reads.get(file) ?? 0) + 1);
      return sources.get(file);
    });
    const isFile = (file: string) => sources.has(file);

    await collectRouteCssFilesFromSources({
      appDir,
      isFile,
      pageFile: firstPage,
      projectRoot: "/repo",
      readSource,
    });
    await collectRouteCssFilesFromSources({
      appDir,
      isFile,
      pageFile: secondPage,
      projectRoot: "/repo",
      readSource,
    });

    expect(reads.get(layoutFile)).toBe(1);
    expect(reads.get(firstPage)).toBe(1);
    expect(reads.get(secondPage)).toBe(1);
  });
});
