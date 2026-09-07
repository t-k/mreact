import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A fixed production application measured by the client delivery report.
 *
 * Fixtures are ordinary app-router projects: a `src/app` route tree, a workspace `node_modules`
 * scope and nothing else. They are built with `buildApp` under `NODE_ENV=production`, served with
 * the normal production server and measured through the public delivery accounting helper, so the
 * numbers describe what a browser fetches rather than what a benchmark-only shortcut produces.
 */
export interface ClientDeliveryFixture {
  description: string;
  /** Route paths visited after the initial page, used for cumulative unique JavaScript. */
  sessionVisits: readonly string[];
  files: Readonly<Record<string, string>>;
  /** Route path measured as the initial page load. */
  initialPath: string;
  /** Additional route paths whose HTML payload is measured. */
  measuredHtmlPaths: readonly string[];
  name: string;
  /** Workspace package directories linked into the fixture's `node_modules/@reckona` scope. */
  workspacePackages: readonly string[];
}

const htmlLayout = `export default function Layout() {
  return (
    <html lang="en">
      <body>
        <Slot />
      </body>
    </html>
  );
}
`;

const counterPage = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);

  return (
    <main>
      <h1>Home</h1>
      <a href="/about">About</a>
      <button type="button" onClick={() => count.set((value) => value + 1)}>
        count: {count.get()}
      </button>
    </main>
  );
}
`;

const staticAboutPage = `export default function About() {
  return (
    <main>
      <h1>About</h1>
      <a href="/">Home</a>
    </main>
  );
}
`;

const keyedListPage = `import { cell } from "@reckona/mreact-reactive-core";

interface Row {
  id: number;
  label: string;
}

function buildRows(seed: number, size: number): Row[] {
  return Array.from({ length: size }, (_unused, index) => ({
    id: seed + index,
    label: \`row \${seed + index}\`,
  }));
}

export default function Page() {
  const rows = cell<readonly Row[]>(buildRows(1, 20));
  const selectedId = cell(-1);

  return (
    <main>
      <button type="button" onClick={() => rows.set(buildRows(Date.now() % 1000, 20))}>
        Replace rows
      </button>
      <button type="button" onClick={() => rows.set([])}>
        Clear rows
      </button>
      <ul>
        {rows.get().map((row) => (
          <li
            key={row.id}
            data-selected={selectedId.get() === row.id ? "true" : undefined}
            onClick={() => selectedId.set(row.id)}
          >
            {row.label}
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

const formsPage = `import { createForm } from "@reckona/mreact-forms";

interface ContactValues {
  email: string;
  name: string;
}

const contactForm = createForm<ContactValues>({
  initialValues: { email: "", name: "" },
  validate: {
    email: (value) => (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/u.test(value) ? undefined : "Enter a valid email."),
    name: (value) => (value.trim().length < 2 ? "Name must be at least 2 characters." : undefined),
  },
  validateOn: ["blur", "submit"],
});

export default function Page() {
  const name = contactForm.field("name");
  const email = contactForm.field("email");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void contactForm.submit(async () => undefined);
      }}
    >
      <input
        name="name"
        value={name.state.get().value}
        onInput={(event) => name.setValue(event.currentTarget.value)}
        onBlur={() => name.setTouched(true)}
      />
      <span>{name.state.get().errors.join(", ")}</span>
      <input
        name="email"
        value={email.state.get().value}
        onInput={(event) => email.setValue(event.currentTarget.value)}
        onBlur={() => email.setTouched(true)}
      />
      <span>{email.state.get().errors.join(", ")}</span>
      <button type="submit">Send</button>
    </form>
  );
}
`;

const queryPage = `import { createQuery, getQueryClient, type QueryKey } from "@reckona/mreact-query";
import type { LoaderContext } from "@reckona/mreact-router";

interface TimeData {
  value: string;
}

const timeKey: QueryKey = ["time"];
const staleTimeMs = 30_000;

async function fetchTime(): Promise<TimeData> {
  return { value: "2026-09-07T00:00:00.000Z" };
}

export async function loader(context: LoaderContext): Promise<TimeData> {
  return context.queryClient.fetchQuery({
    queryFn: fetchTime,
    queryKey: timeKey,
    staleTime: staleTimeMs,
  });
}

export default function Page(props: { data: TimeData }) {
  const observer = createQuery<TimeData>(getQueryClient(), {
    queryFn: fetchTime,
    queryKey: timeKey,
    staleTime: staleTimeMs,
  });

  return (
    <main>
      <p>{observer.result.get().data?.value ?? props.data.value}</p>
      <button type="button" onClick={() => void observer.refetch()}>
        Refresh
      </button>
    </main>
  );
}
`;

const reactCompatIsland = `import { useCallback, useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => {
    setCount((value) => value + 1);
  }, []);

  return (
    <button type="button" onClick={increment}>
      count: {count}
    </button>
  );
}
`;

const reactCompatPage = `import Counter from "./Counter.compat.js";

export default function Page() {
  return (
    <main>
      <h1>React compat</h1>
      <Counter />
    </main>
  );
}
`;

function sessionRoutePage(options: { next: string; shared: string; title: string }): string {
  return `import { cell } from "@reckona/mreact-reactive-core";
import { formatTitle } from ${JSON.stringify(options.shared)};

export default function Page() {
  const opened = cell(false);

  return (
    <main>
      <h1>{formatTitle(${JSON.stringify(options.title)})}</h1>
      <a href=${JSON.stringify(options.next)}>Next</a>
      <button type="button" onClick={() => opened.set((value) => !value)}>
        {opened.get() ? "Close" : "Open"}
      </button>
    </main>
  );
}
`;
}

/**
 * The fixed fixture set measured by `pnpm size:client`.
 *
 * Every entry stays a normal application: no benchmark-only build flags, no stripped runtimes and
 * no shared bundle that mixes unrelated frameworks into one entry.
 */
export const clientDeliveryFixtures: readonly ClientDeliveryFixture[] = [
  {
    description:
      "Interactive cell counter with client navigation enabled across an interactive and a server-only route.",
    files: {
      "src/app/about/page.tsx": staticAboutPage,
      "src/app/layout.tsx": htmlLayout,
      "src/app/page.tsx": counterPage,
    },
    initialPath: "/",
    measuredHtmlPaths: ["/about"],
    name: "native-counter",
    sessionVisits: ["/about", "/"],
    workspacePackages: ["reactive-core", "router"],
  },
  {
    description:
      "The same interactive cell counter with clientNavigation disabled, so no navigation runtime is delivered.",
    files: {
      "src/app/layout.tsx": htmlLayout,
      "src/app/page.tsx": `export const clientNavigation = false;

${counterPage}`,
    },
    initialPath: "/",
    measuredHtmlPaths: [],
    name: "native-counter-no-navigation",
    sessionVisits: [],
    workspacePackages: ["reactive-core", "router"],
  },
  {
    description: "Keyed list rendering with selection and replacement through reactive cells.",
    files: {
      "src/app/layout.tsx": htmlLayout,
      "src/app/page.tsx": keyedListPage,
    },
    initialPath: "/",
    measuredHtmlPaths: [],
    name: "keyed-list",
    sessionVisits: [],
    workspacePackages: ["reactive-core", "router"],
  },
  {
    description: "Reactive form state and per-field validation through @reckona/mreact-forms.",
    files: {
      "src/app/layout.tsx": htmlLayout,
      "src/app/page.tsx": formsPage,
    },
    initialPath: "/",
    measuredHtmlPaths: [],
    name: "forms",
    sessionVisits: [],
    workspacePackages: ["forms", "reactive-core", "router"],
  },
  {
    description:
      "Server prefetch and client hydration through @reckona/mreact-query, which adds a dehydrated query payload to the HTML.",
    files: {
      "src/app/layout.tsx": htmlLayout,
      "src/app/query/page.tsx": queryPage,
    },
    initialPath: "/query",
    measuredHtmlPaths: [],
    name: "query",
    sessionVisits: [],
    workspacePackages: ["query", "reactive-core", "router"],
  },
  {
    description:
      "React compatibility hooks in a .compat.tsx island, so React compat cost is reported apart from the native fixtures.",
    files: {
      "src/app/Counter.compat.tsx": reactCompatIsland,
      "src/app/layout.tsx": htmlLayout,
      "src/app/page.tsx": reactCompatPage,
    },
    initialPath: "/",
    measuredHtmlPaths: [],
    name: "react-compat",
    sessionVisits: [],
    workspacePackages: ["react-compat", "reactive-core", "reactive-dom", "router", "shared"],
  },
  {
    description:
      "Five interactive routes sharing one helper module, measured over a six-visit navigation session including a revisit.",
    files: {
      "src/app/about/page.tsx": sessionRoutePage({
        next: "/settings",
        shared: "../shared.js",
        title: "About",
      }),
      "src/app/help/page.tsx": sessionRoutePage({
        next: "/",
        shared: "../shared.js",
        title: "Help",
      }),
      "src/app/layout.tsx": htmlLayout,
      "src/app/page.tsx": sessionRoutePage({
        next: "/about",
        shared: "./shared.js",
        title: "Home",
      }),
      "src/app/reports/page.tsx": sessionRoutePage({
        next: "/help",
        shared: "../shared.js",
        title: "Reports",
      }),
      "src/app/settings/page.tsx": sessionRoutePage({
        next: "/reports",
        shared: "../shared.js",
        title: "Settings",
      }),
      "src/app/shared.ts": `export function formatTitle(title: string): string {
  return \`\${title} | mreact\`;
}
`,
    },
    initialPath: "/",
    measuredHtmlPaths: ["/about"],
    name: "multi-route-session",
    // The routes form a cycle, so the last visit returns to the initial page and proves a cached
    // revisit adds no bytes. A browser can walk the same order through the rendered "Next" links.
    sessionVisits: ["/about", "/settings", "/reports", "/help", "/"],
    workspacePackages: ["reactive-core", "router"],
  },
];

export interface MaterializedClientDeliveryFixture {
  appDir: string;
  outDir: string;
  projectRoot: string;
}

/**
 * Writes a fixture into `workDir` as a self-contained project.
 *
 * The `@reckona` scope is symlinked to the workspace packages so the fixture resolves runtime
 * imports exactly the way an installed application does.
 */
export async function materializeClientDeliveryFixture(
  fixture: ClientDeliveryFixture,
  workDir: string,
): Promise<MaterializedClientDeliveryFixture> {
  const projectRoot = join(workDir, fixture.name);
  await rm(projectRoot, { force: true, recursive: true });
  const scopeDir = join(projectRoot, "node_modules", "@reckona");
  await mkdir(scopeDir, { recursive: true });

  for (const packageDir of fixture.workspacePackages) {
    const packageRoot = join(repositoryRoot, "packages", packageDir);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      name: string;
    };
    await symlink(packageRoot, join(scopeDir, manifest.name.replace("@reckona/", "")), "dir");
  }

  for (const [file, content] of Object.entries(fixture.files)) {
    const target = join(projectRoot, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  return {
    appDir: join(projectRoot, "src", "app"),
    outDir: join(projectRoot, ".mreact"),
    projectRoot,
  };
}
