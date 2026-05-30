import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  server: {
    port: 3013,
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
    // Pre-bundle the React-ecosystem libraries at server start so the dev
    // server does not discover them mid-session and trigger a full-page reload
    // (which would otherwise drop in-progress form input during navigation).
    include: [
      "recharts",
      "lexical",
      "@lexical/rich-text",
      "@lexical/react/LexicalComposer",
      "@lexical/react/LexicalRichTextPlugin",
      "@lexical/react/LexicalContentEditable",
      "@lexical/react/LexicalHistoryPlugin",
      "@lexical/react/LexicalErrorBoundary",
      "@lexical/react/LexicalOnChangePlugin",
      "@lexical/react/LexicalComposerContext",
      "@conform-to/react",
      "@conform-to/zod",
      "zod",
    ],
  },
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "app",
      publicDir: "public",
      importPolicy: {
        allowedPackages: ["better-sqlite3"],
      },
    }),
  ],
});
