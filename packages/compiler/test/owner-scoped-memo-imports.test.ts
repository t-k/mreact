import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

type InsertionMode = "lightweight" | "list-capable";

const ownerScopedConditional = (mode: InsertionMode): string =>
  mode === "lightweight"
    ? 'props.visible ? <MemoCard label="A" /> : null'
    : 'props.visible ? <MemoCard label="A" /> : props.rows.map((row) => <span key={row.id}>Row</span>)';

const locations = [
  {
    name: "direct intrinsic child",
    emitsCalls: true,
    wrap: (conditional: string) => `<main>{${conditional}}</main>`,
  },
  {
    name: "component children",
    emitsCalls: true,
    wrap: (conditional: string) => `<Frame><section>{${conditional}}</section></Frame>`,
  },
  {
    name: "JSX render prop",
    emitsCalls: true,
    wrap: (conditional: string) => `<Frame content={<section>{${conditional}}</section>} />`,
  },
  {
    name: "Await resolved branch",
    emitsCalls: true,
    wrap: (conditional: string) =>
      `<main><Await value={Promise.resolve(undefined)}>{() => <section>{${conditional}}</section>}</Await></main>`,
  },
  {
    name: "Await placeholder branch",
    emitsCalls: false,
    wrap: (conditional: string) =>
      `<main><Await value={Promise.resolve(undefined)} placeholder={<section>{${conditional}}</section>}>{() => <span>Loaded</span>}</Await></main>`,
  },
  {
    name: "Await catch branch",
    emitsCalls: false,
    wrap: (conditional: string) =>
      `<main><Await value={Promise.reject(new Error(\"failed\"))} catch={() => <section>{${conditional}}</section>}>{() => <span>Loaded</span>}</Await></main>`,
  },
] as const;

const modes = ["lightweight", "list-capable"] as const;

function sourceFor(root: string, moduleBindings = ""): string {
  return `import { memo } from "@reckona/mreact";

${moduleBindings}

const MemoCard = memo(function MemoCardView(props: { readonly label: string }) {
  return <article>{props.label}</article>;
});

function Frame(props: { readonly children?: unknown; readonly content?: unknown }) {
  return <main>{props.content ?? props.children}</main>;
}

export function App(props: {
  readonly visible: boolean;
  readonly rows: readonly { readonly id: string; readonly label: string }[];
}) {
  return ${root};
}`;
}

describe("owner-scoped memo helper imports", () => {
  test.each(
    locations.flatMap((location) =>
      modes.map((mode) => ({
        location: location.name,
        mode,
        emitsCalls: location.emitsCalls,
        root: location.wrap(ownerScopedConditional(mode)),
      })),
    ),
  )("imports helpers for $mode memo insertion in $location", ({ mode, emitsCalls, root }) => {
    const output = transform({
      code: sourceFor(root),
      filename: "App.tsx",
      target: "client",
      dev: false,
    });
    const insertionHelper = mode === "lightweight" ? "insertMemo" : "insertMemoDynamic";
    const internalImport = output.metadata.imports.find(
      (runtimeImport) => runtimeImport.source === "@reckona/mreact-reactive-dom/internal",
    );

    expect(output.diagnostics).toEqual([]);
    if (emitsCalls) {
      expect(output.code).toContain("createMemo(");
      expect(output.code).toContain(`${insertionHelper}(`);
    }
    expect(internalImport?.specifiers).toEqual(
      expect.arrayContaining(["createMemo", insertionHelper]),
    );
  });

  test("keeps nested memo helper imports and calls collision-free", () => {
    const conditional = ownerScopedConditional("list-capable");
    const output = transform({
      code: sourceFor(
        `<Frame><section>{${conditional}}</section></Frame>`,
        'const createMemo = "local-create";\nconst insertMemoDynamic = "local-insert";',
      ),
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toMatch(
      /import \{[^}]*createMemo as _createMemo[^}]*insertMemoDynamic as _insertMemoDynamic[^}]*\} from "@reckona\/mreact-reactive-dom\/internal"/u,
    );
    expect(output.code).toContain("_createMemo(");
    expect(output.code).toContain("_insertMemoDynamic(");
  });
});
