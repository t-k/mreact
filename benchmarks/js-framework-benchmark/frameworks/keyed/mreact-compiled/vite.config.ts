import { formatDiagnostic, transform } from "@reckona/mreact-compiler";
import { defineConfig, type Plugin } from "vite";

function mreactCompiler(): Plugin {
  return {
    name: "mreact-compiler",
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
        mode: "reactive",
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
  plugins: [mreactCompiler()],
  define: {
    __MREACT_CLIENT_DEVTOOLS__: "false",
    "process.env.NODE_ENV": '"production"',
  },
  build: {
    emptyOutDir: true,
    minify: "oxc",
    rolldownOptions: {
      input: "src/index.ts",
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
