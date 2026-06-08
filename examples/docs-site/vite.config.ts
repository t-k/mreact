import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { mreactRouter } from "@reckona/mreact-router/vite";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";

const base = normalizeBasePath(process.env.MREACT_DOCS_BASE_PATH ?? "/");

export default defineConfig({
  base,
  plugins: [
    mdx({
      jsxImportSource: "@reckona/mreact",
      jsxRuntime: "automatic",
      rehypePlugins: [rehypeSlug, rehypeHighlight],
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
    }),
    tailwindcss(),
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
    }),
  ],
});

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") {
    return "/";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
