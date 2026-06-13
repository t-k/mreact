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
      "app/virtual/page.tsx",
      "app/widgets/page.tsx",
      "app/widgets/LikeButton.client.tsx",
      "app/forms/page.tsx",
      "app/forms/valibot/page.tsx",
      "app/forms/zod/page.tsx",
      "app/api/contact/route.ts",
      "app/i18n/page.tsx",
      "app/i18n/$locale/page.tsx",
      "app/i18n/messages.ts",
      "app/analytics/page.tsx",
      "app/analytics/AnalyticsTracker.client.tsx",
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

  test("query page combines loader prefetch with client interaction", async () => {
    const source = await readFile(new URL("./app/query/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("export async function loader");
    expect(source).toContain("createQuery");
    expect(source).toContain("syncQueryClientAcrossTabs");
    expect(source).toContain("singleFlight: true");
    expect(source).toContain("refetchOnWindowFocus: true");
    expect(source).toContain("refetchOnReconnect: true");
    expect(source).toContain("onClick");
    expect(source).toContain("observer.refetch()");
  });

  test("virtual page renders bounded grid entries from @reckona/mreact-virtual", async () => {
    const source = await readFile(new URL("./app/virtual/page.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/from\s+["']@reckona\/mreact-virtual["']/);
    expect(source).toContain("createVirtualGrid");
    expect(source).toContain("virtual.entries.get()");
    expect(source).toContain("scrollByRows");
  });

  test("i18n page uses detectLocale + defineMessages from the router", async () => {
    const page = await readFile(new URL("./app/i18n/page.tsx", import.meta.url), "utf8");
    const messages = await readFile(new URL("./app/i18n/messages.ts", import.meta.url), "utf8");
    expect(page).toContain("detectLocale");
    expect(messages).toContain("defineMessages");
  });

  test("widgets page renders an imported .client.tsx island via inference", async () => {
    const page = await readFile(new URL("./app/widgets/page.tsx", import.meta.url), "utf8");
    const island = await readFile(
      new URL("./app/widgets/LikeButton.client.tsx", import.meta.url),
      "utf8",
    );
    // The page is a plain server component that imports the client island and
    // renders it as JSX. The compiler's boundary graph classifies the island
    // as a rendered-import client boundary, so the page stays server-rendered
    // while only the island hydrates — no clientBoundaryImports config and no
    // route-level directive are required.
    expect(page).toMatch(/from\s+["']\.\/LikeButton\.client\.js["']/);
    expect(page).toContain("<LikeButton");
    expect(page).not.toMatch(/^\s*["']use client["'];?\s*$/m);
    expect(page).not.toMatch(/from\s+["']@reckona\/mreact-reactive-core["']/);
    // The island is the client boundary: reactive cell + event handler.
    expect(island).toMatch(/from\s+["']@reckona\/mreact-reactive-core["']/);
    expect(island).toContain("cell(");
    expect(island).toContain("onClick");
  });

  test("analytics page injects scripts via metadata.head with a per-request CSP nonce", async () => {
    const source = await readFile(new URL("./app/analytics/page.tsx", import.meta.url), "utf8");
    // Per-request nonce via generateMetadata.
    expect(source).toContain("export function generateMetadata");
    expect(source).toContain("randomBytes");
    expect(source).toContain('"base64url"');
    // Scripts declared through metadata.head with nonce: true.
    expect(source).toContain("head:");
    expect(source).toContain("nonce: true");
    // Only script-src is hardened (style-src would break inline layout styles).
    expect(source).toContain('"script-src": ["\'self\'"]');
    expect(source).not.toContain('"style-src"');
    // CSP-safe raw block + noscript fallback.
    expect(source).toContain("application/ld+json");
    expect(source).toContain("dangerouslySetInnerHTML");
    expect(source).toContain("/analytics/ns.html");
    // Offline: points at the local stub. No network src to Google.
    expect(source).toContain("/analytics/gtm-stub.js");
    expect(source).not.toMatch(/src:.*googletagmanager\.com/);
    expect(source).not.toMatch(/src="https:\/\/www\.googletagmanager\.com/);
  });

  test("analytics tracker island uses subscribeNavigationState to push page_view", async () => {
    const source = await readFile(
      new URL("./app/analytics/AnalyticsTracker.client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(
      /from\s+["']@reckona\/mreact-router\/navigation-state["']/,
    );
    expect(source).toContain("subscribeNavigationState");
    expect(source).toMatch(/from\s+["']@reckona\/mreact-reactive-core["']/);
    expect(source).toContain("cell<");
    expect(source).toContain('event: "page_view"');
    // dataLayer carries page_path only — no PII fields.
    expect(source).toContain("page_path");
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
