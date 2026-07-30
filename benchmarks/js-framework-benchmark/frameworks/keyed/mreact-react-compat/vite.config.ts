import { formatDiagnostic, transform } from "@reckona/mreact-compiler";
import { defineConfig, type Plugin } from "vite";

function mreactCompatCompiler(): Plugin {
  return {
    name: "mreact-compat-compiler",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".tsx")) {
        return null;
      }

      const output = transform({
        code,
        filename: id,
        target: "client",
        dev: false,
        mode: "compat",
      });
      const errors = output.diagnostics.filter((diagnostic) => diagnostic.level === "error");

      if (errors.length > 0) {
        throw new Error(errors.map((diagnostic) => formatDiagnostic(id, diagnostic)).join("\n"));
      }

      return { code: output.code, map: output.map ?? null };
    },
  };
}

export default defineConfig({
  plugins: [mreactCompatCompiler()],
  define: {
    __MREACT_CLIENT_DEVTOOLS__: "false",
    "process.env.NODE_ENV": '"production"',
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/main.tsx",
      fileName: () => "main.js",
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
