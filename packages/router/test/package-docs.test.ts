import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const packageDocs = [
  {
    dir: "router",
    terms: ["buildApp", "renderBuiltAppRequest", "Cloudflare Workers"],
  },
  {
    dir: "query",
    terms: ["createQueryClient", "dehydrate", "getQueryClient"],
  },
  {
    dir: "auth",
    terms: ["configureAuth", "requireRole", "getSessionClaims"],
  },
  {
    dir: "store",
    terms: ["createStore", "store.select", "createRequestStoreFactory"],
  },
  {
    dir: "forms",
    terms: ["createForm", "standard-schema", "setServerErrors"],
  },
  {
    dir: "test-utils",
    terms: ["createAppFixture", "render", "responseText"],
  },
] as const;

describe("package docs", () => {
  for (const doc of packageDocs) {
    test(`${doc.dir} README documents core APIs`, async () => {
      const file = join(process.cwd(), "packages", doc.dir, "README.md");
      await expect(access(file)).resolves.toBeUndefined();
      const source = await readFile(file, "utf8");

      for (const term of doc.terms) {
        expect(source).toContain(term);
      }
    });
  }
});
