// Assertions kept light: the sample must not depend on upstream React
// packages, and the canonical routes from the spec must exist as files
// on disk. Behavioral testing of the router itself lives in
// packages/router/e2e.
import { access, readFile, readdir } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("mreact app-router example", () => {
  test("does not depend on react / react-dom in package.json", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("./package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies).not.toHaveProperty("react");
    expect(packageJson.dependencies).not.toHaveProperty("react-dom");
  });

  test("no source file imports react / react-dom", async () => {
    const files = await listSourceFiles(new URL("./app/", import.meta.url));
    const sources = await Promise.all(
      files.map(async (file) => ({
        file: file.pathname,
        source: await readFile(file, "utf8"),
      })),
    );
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/from\s+["']react(?:\/[^"']*)?["']/);
      expect(source, file).not.toMatch(/from\s+["']react-dom(?:\/[^"']*)?["']/);
    }
  });

  test("the canonical route files exist on disk", async () => {
    const expected = [
      "app/page.tsx",
      "app/about/page.tsx",
      "app/counter/page.tsx",
      "app/streaming/page.tsx",
      "app/streaming/loading.tsx",
      "app/server-actions/page.tsx",
      "app/server-actions/actions.ts",
      "app/server-actions/store.ts",
      "app/query/page.tsx",
      "app/forms/page.tsx",
      "app/api/contact/route.ts",
      "app/i18n/page.tsx",
      "app/i18n/$locale/page.tsx",
      "app/i18n/messages.ts",
      "app/users/$id/page.tsx",
      "app/users/data.ts",
      "app/files/$...path/page.tsx",
      "app/docs/page.tsx",
      "app/docs/routing/page.tsx",
      "app/docs/slots/page.tsx",
      "app/docs/layout.tsx",
      "app/docs/template.tsx",
      "app/docs/loading.tsx",
      "app/docs/error.tsx",
      "app/docs/not-found.tsx",
      "app/(marketing)/contact/page.tsx",
      "app/api/time/route.ts",
      "app/login/page.tsx",
      "app/admin/page.tsx",
      "app/admin/audit/page.tsx",
      "app/forbidden/page.tsx",
      "app/api/login/route.ts",
      "app/api/logout/route.ts",
      "app/middleware.ts",
      "app/session-store.ts",
      "app/layout.tsx",
      "app/error.tsx",
      "app/not-found.tsx",
    ];
    for (const path of expected) {
      await expect(access(new URL(`./${path}`, import.meta.url)), path).resolves.toBeUndefined();
    }
  });

  test("dropped routes are absent", async () => {
    const dropped = [
      "app/feed",
      "app/feed-interactive",
      "app/news",
      "app/notes",
      "app/preferences",
      "app/api/preferences",
      "app/api/refresh-session",
      "app/docs/slow",
      "app/docs/throws",
      "app/actions.ts",
    ];
    for (const path of dropped) {
      await expect(access(new URL(`./${path}`, import.meta.url)), path).rejects.toThrow();
    }
  });

  test("admin page reads the session via @reckona/mreact-auth", async () => {
    const source = await readFile(new URL("./app/admin/page.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/from\s+["']@reckona\/mreact-auth["']/);
    expect(source).toContain("getCurrentSession");
  });

  test("admin/audit page enforces the admin role via requireRole", async () => {
    const source = await readFile(new URL("./app/admin/audit/page.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/from\s+["']@reckona\/mreact-auth["']/);
    expect(source).toContain("requireRole");
    expect(source).toContain('"admin"');
  });

  test("i18n page uses detectLocale + defineMessages from the router", async () => {
    const page = await readFile(new URL("./app/i18n/page.tsx", import.meta.url), "utf8");
    const messages = await readFile(new URL("./app/i18n/messages.ts", import.meta.url), "utf8");
    expect(page).toContain("detectLocale");
    expect(messages).toContain("defineMessages");
  });

});

async function listSourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    const child = new URL(entry.name, `${directory.href}/`);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(child)));
      continue;
    }
    if (/\.[cm]?[tj]sx?$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}
