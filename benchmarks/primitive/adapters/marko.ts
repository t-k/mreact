import { createRequire } from "node:module";
import Module from "node:module";
import { dirname, join } from "node:path";
import { readPackageVersion } from "../../shared/env.js";
import {
  createRowsData,
  validateRows,
  validateRowsReversedWithNodeIdentity,
} from "../fixtures/rows.js";
import type { RowFixture } from "../fixtures/rows.js";
import { validateTextNodes } from "../fixtures/text-binding.js";
import type {
  PrimitiveAdapter,
  PrimitiveCaseResult,
  PrimitiveRunContext,
} from "../types.js";

interface MarkoTemplate<Input> {
  mount(input: Input, reference: Node, position?: "beforeend"): Marko.MountedTemplate<Input>;
}

interface MarkoCompiler {
  compileFileSync(
    filename: string,
    options: {
      babelConfig: {
        babelrc: false;
        browserslistConfigFile: false;
        configFile: false;
      };
      meta: true;
      modules: "cjs";
      output: "dom";
      sourceMaps: false;
    },
  ): {
    code: string;
  };
}

interface MutableModuleResolver {
  _resolveFilename(
    request: string,
    parent: NodeJS.Module | undefined,
    isMain: boolean,
    options?: unknown,
  ): string;
}

const require = createRequire(import.meta.url);
installMarkoDomRequireHook();
let templates:
  | {
      rows: MarkoTemplate<{ rows: RowFixture[] }>;
      text: MarkoTemplate<{ items: number[]; value: string }>;
    }
  | undefined;

export const markoAdapter: PrimitiveAdapter = {
  name: "marko",
  version: readPackageVersion("marko"),
  cases: {
    "create 1k rows": runCreateRows,
    "update every 10th in 10k rows": runUpdateEveryTenth,
    "keyed reverse 1k rows": runKeyedReverse,
    "text binding update 1k": runTextBindingUpdate,
  },
};

function runCreateRows({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const { rows: rowsTemplate } = getTemplates();
  const start = performance.now();
  const mounted = rowsTemplate.mount({ rows }, host, "beforeend");
  const duration = performance.now() - start;

  try {
    validateRows(host, rows);

    return { samples: [duration] };
  } finally {
    mounted.destroy();
  }
}

function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const { rows: rowsTemplate } = getTemplates();
  const mounted = rowsTemplate.mount({ rows }, host, "beforeend");

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.update({ rows: updatedRows });
    const duration = performance.now() - start;

    validateRows(host, updatedRows);

    return { samples: [duration] };
  } finally {
    mounted.destroy();
  }
}

function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const { rows: rowsTemplate } = getTemplates();
  const mounted = rowsTemplate.mount({ rows }, host, "beforeend");

  try {
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    mounted.update({ rows: [...rows].reverse() });
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);

    return { samples: [duration] };
  } finally {
    mounted.destroy();
  }
}

function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const { text: textTemplate } = getTemplates();
  const mounted = textTemplate.mount({ items, value: "0" }, host, "beforeend");

  try {
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    mounted.update({ items, value: "1" });
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");

    return { samples: [duration] };
  } finally {
    mounted.destroy();
  }
}

function getTemplates(): NonNullable<typeof templates> {
  templates ??= {
    rows: loadTemplate<{ rows: RowFixture[] }>("./marko-templates/rows.marko"),
    text: loadTemplate<{ items: number[]; value: string }>(
      "./marko-templates/text.marko",
    ),
  };

  return templates;
}

function installMarkoDomRequireHook(): void {
  const markoPackagePath = require.resolve("marko/package.json");
  const markoRequire = createRequire(markoPackagePath);
  const compiler = markoRequire("@marko/compiler") as MarkoCompiler;
  installMarkoBrowserInternalAliases(dirname(markoPackagePath));

  require.extensions[".marko"] = (module, filename) => {
    const { code } = compiler.compileFileSync(filename, {
      babelConfig: {
        babelrc: false,
        browserslistConfigFile: false,
        configFile: false,
      },
      meta: true,
      modules: "cjs",
      output: "dom",
      sourceMaps: false,
    });

    module._compile(code, filename);
  };
}

function installMarkoBrowserInternalAliases(markoPackageDir: string): void {
  const moduleResolver = Module as unknown as MutableModuleResolver;
  const originalResolveFilename = moduleResolver._resolveFilename.bind(Module);

  moduleResolver._resolveFilename = (request, parent, isMain, options) => {
    if (request.startsWith("@internal/")) {
      return join(
        markoPackageDir,
        "dist",
        "node_modules",
        request,
        "index-browser.js",
      );
    }

    return originalResolveFilename(request, parent, isMain, options);
  };
}

function loadTemplate<Input>(specifier: string): MarkoTemplate<Input> {
  const loaded = require(specifier) as MarkoTemplate<Input> | {
    default: MarkoTemplate<Input>;
  };

  return "default" in loaded ? loaded.default : loaded;
}

function updateEveryTenth(rows: readonly RowFixture[]): RowFixture[] {
  return rows.map((row, index) =>
    index % 10 === 0 ? { ...row, label: `${row.label} updated` } : row,
  );
}

function readTextNodes(host: Node, expectedCount: number): Text[] {
  const nodes = collectTextNodes(host);

  if (nodes.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} text nodes, received ${nodes.length}`);
  }

  return nodes;
}

function collectTextNodes(node: Node): Text[] {
  const nodes: Text[] = [];

  for (const child of node.childNodes) {
    if (child.nodeType === child.TEXT_NODE) {
      const text = child as Text;

      if (text.data.trim().length > 0) {
        nodes.push(text);
      }

      continue;
    }

    nodes.push(...collectTextNodes(child));
  }

  return nodes;
}
