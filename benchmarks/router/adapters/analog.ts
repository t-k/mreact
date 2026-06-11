import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDynamicAttrCells, type DynamicAttrCell } from "../dynamic-attr-cells.js";
import {
  createProductionAppAdapter,
  spawnAndWait,
  startCommandServer,
} from "./production-app-adapter.js";

export const analogAdapter = createProductionAppAdapter({
  name: "analog",
  packageName: "@analogjs/platform",
  fixturePrefix: "analog-fixture-",
  includeAsyncDataRoutes: false,
  async writeFixture(rootDir, nodeCount) {
    const items = Array.from({ length: nodeCount }, (_, index) => index);
    const arrayLiteral = JSON.stringify(items);
    const cells = buildDynamicAttrCells(200);

    await writeAnalogRootFiles(rootDir);
    await mkdir(join(rootDir, "src", "app", "pages"), { recursive: true });

    await writeAnalogNodePage(rootDir, "index.page.ts", "IndexPageComponent", arrayLiteral);
    await writeAnalogNodePage(rootDir, "stream-page.page.ts", "StreamPageComponent", arrayLiteral);
    await writeAnalogNodePage(rootDir, "static-page.page.ts", "StaticPageComponent", arrayLiteral);
    await writeAnalogRealStreamPage(rootDir, arrayLiteral);
    await writeAnalogWaterfallPage(rootDir);
    await writeAnalogDataGridPage(rootDir, cells);
    await writeAnalogServerOnlyPage(rootDir);
    await writeAnalogInteractivePage(rootDir, "interactive-bundle.page.ts", "InteractiveBundlePage");
    await writeAnalogInteractivePage(
      rootDir,
      "interactive-minimal-bundle.page.ts",
      "InteractiveMinimalBundlePage",
    );
  },
  build: async (rootDir) => {
    await spawnAndWait("pnpm", ["install", "--ignore-workspace", "--silent"], { cwd: rootDir });
    await spawnAndWait("pnpm", ["run", "build"], {
      cwd: rootDir,
      env: {
        NODE_ENV: "production",
      },
    });
  },
  buildOutputPaths: (rootDir) => [join(rootDir, "dist", "analog")],
  start: async (rootDir) => {
    const candidates = [
      join(rootDir, "dist", "analog", "server", "index.mjs"),
      join(rootDir, "dist", "analog", "server", "server.mjs"),
      join(rootDir, ".output", "server", "index.mjs"),
    ];
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        return startCommandServer(process.execPath, [candidate], { cwd: rootDir });
      }
    }
    throw new Error(`analog server output not found under ${rootDir}`);
  },
});

async function writeAnalogRootFiles(rootDir: string): Promise<void> {
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "mreact-bench-analog-fixture",
        private: true,
        type: "module",
        scripts: {
          build: "vite build",
        },
        dependencies: {
          "@analogjs/content": "2.6.0",
          "@analogjs/platform": "2.6.0",
          "@analogjs/router": "2.6.0",
          "@angular/animations": "20.3.25",
          "@angular/build": "20.3.25",
          "@angular/common": "20.3.25",
          "@angular/compiler": "20.3.25",
          "@angular/compiler-cli": "20.3.25",
          "@angular/core": "20.3.25",
          "@angular/platform-browser": "20.3.25",
          "@angular/platform-server": "20.3.25",
          "@angular/router": "20.3.25",
          rxjs: "7.8.2",
          tslib: "2.8.1",
          typescript: "5.9.3",
          vite: "8.0.11",
          "zone.js": "0.15.1",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(rootDir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import analog from "@analogjs/platform";

export default defineConfig({
  resolve: { mainFields: ["module"] },
  plugins: [
    analog({
      prerender: { routes: [] },
      nitro: { preset: "node-server" },
    }),
  ],
});
`,
  );
  await writeFile(
    join(rootDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          lib: ["ES2022", "DOM"],
          experimentalDecorators: true,
          useDefineForClassFields: false,
          strict: false,
          skipLibCheck: true,
          esModuleInterop: true,
          importHelpers: true,
          noEmit: false,
        },
        angularCompilerOptions: {
          strictTemplates: false,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(rootDir, "tsconfig.app.json"),
    JSON.stringify(
      {
        extends: "./tsconfig.json",
        compilerOptions: {
          outDir: "./dist/out-tsc",
          types: ["node"],
        },
        files: ["src/main.ts", "src/main.server.ts"],
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(rootDir, "index.html"),
    `<app-root></app-root><script type="module" src="/src/main.ts"></script>
`,
  );

  await mkdir(join(rootDir, "src", "app"), { recursive: true });
  await writeFile(
    join(rootDir, "src", "main.ts"),
    `import "zone.js";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

bootstrapApplication(AppComponent, appConfig).catch((error) => console.error(error));
`,
  );
  await writeFile(
    join(rootDir, "src", "main.server.ts"),
    `import "zone.js/node";
import { enableProdMode } from "@angular/core";
import { bootstrapApplication, type BootstrapContext } from "@angular/platform-browser";
import { renderApplication } from "@angular/platform-server";
import { provideServerContext } from "@analogjs/router/server";
import type { ServerContext } from "@analogjs/router/tokens";
import { AppComponent } from "./app/app.component";
import { config } from "./app/app.config.server";

enableProdMode();

export function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(AppComponent, config, context);
}

export default async function render(url: string, document: string, serverContext: ServerContext) {
  return await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });
}
`,
  );
  await writeFile(
    join(rootDir, "src", "app", "app.component.ts"),
    `import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  template: "<router-outlet />",
})
export class AppComponent {}
`,
  );
  await writeFile(
    join(rootDir, "src", "app", "app.config.ts"),
    `import { provideClientHydration } from "@angular/platform-browser";
import { ApplicationConfig } from "@angular/core";
import { provideFileRouter } from "@analogjs/router";
import { withComponentInputBinding, withNavigationErrorHandler } from "@angular/router";

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withComponentInputBinding(), withNavigationErrorHandler(console.error)),
    provideClientHydration(),
  ],
};
`,
  );
  await writeFile(
    join(rootDir, "src", "app", "app.config.server.ts"),
    `import { mergeApplicationConfig, type ApplicationConfig } from "@angular/core";
import { provideServerRendering } from "@angular/platform-server";
import { appConfig } from "./app.config";

const serverConfig: ApplicationConfig = { providers: [provideServerRendering()] };

export const config = mergeApplicationConfig(appConfig, serverConfig);
`,
  );
}

async function writeAnalogNodePage(
  rootDir: string,
  fileName: string,
  className: string,
  arrayLiteral: string,
): Promise<void> {
  await writeFile(
    join(rootDir, "src", "app", "pages", fileName),
    `import { Component } from "@angular/core";

@Component({
  standalone: true,
  template: \`<main>@for (index of items; track index) {<span>{{ index }}</span>}</main>\`,
})
export default class ${className} {
  items = ${arrayLiteral};
}
`,
  );
}

async function writeAnalogRealStreamPage(rootDir: string, arrayLiteral: string): Promise<void> {
  await writeFile(
    join(rootDir, "src", "app", "pages", "real-stream-page.server.ts"),
    `export async function load() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { items: ${arrayLiteral} };
}
`,
  );
  await writeFile(
    join(rootDir, "src", "app", "pages", "real-stream-page.page.ts"),
    `import { Component, Input } from "@angular/core";
import type { LoadResult } from "@analogjs/router";
import { load } from "./real-stream-page.server";

@Component({
  standalone: true,
  template: \`<main>@for (index of data.items; track index) {<span>{{ index }}</span>}</main>\`,
})
export default class RealStreamPageComponent {
  data: LoadResult<typeof load> = { items: [] };

  @Input() set load(value: LoadResult<typeof load>) {
    this.data = value;
  }
}
`,
  );
}

async function writeAnalogWaterfallPage(rootDir: string): Promise<void> {
  await writeFile(
    join(rootDir, "src", "app", "pages", "waterfall-page.server.ts"),
    `export async function load() {
  const [a, b] = await Promise.all([
    new Promise((resolve) => setTimeout(() => resolve("A"), 50)),
    new Promise((resolve) => setTimeout(() => resolve("B"), 50)),
  ]);
  return { a, b };
}
`,
  );
  await writeFile(
    join(rootDir, "src", "app", "pages", "waterfall-page.page.ts"),
    `import { Component, Input } from "@angular/core";
import type { LoadResult } from "@analogjs/router";
import { load } from "./waterfall-page.server";

@Component({
  standalone: true,
  template: \`<main><section [attr.data-a]="data.a">A:{{ data.a }}</section><section [attr.data-b]="data.b">B:{{ data.b }}</section></main>\`,
})
export default class WaterfallPageComponent {
  data: LoadResult<typeof load> = { a: "", b: "" };

  @Input() set load(value: LoadResult<typeof load>) {
    this.data = value;
  }
}
`,
  );
}

async function writeAnalogDataGridPage(
  rootDir: string,
  cells: readonly DynamicAttrCell[],
): Promise<void> {
  await writeFile(
    join(rootDir, "src", "app", "pages", "data-grid.page.ts"),
    `import { Component } from "@angular/core";

@Component({
  standalone: true,
  template: \`
    <main>
      @for (cell of cells; track cell.row + "-" + cell.col) {
        <div
          [class]="'cell ' + cell.kind"
          [attr.data-row]="cell.row"
          [attr.data-col]="cell.col"
          [attr.data-kind]="cell.kind"
          [title]="cell.title"
          [attr.aria-label]="cell.label"
          [style.background]="cell.bg"
          [style.color]="cell.fg"
        >{{ cell.text }}</div>
      }
    </main>
  \`,
})
export default class DataGridPageComponent {
  cells = ${JSON.stringify(cells)};
}
`,
  );
}

async function writeAnalogServerOnlyPage(rootDir: string): Promise<void> {
  await writeFile(
    join(rootDir, "src", "app", "pages", "server-only-bundle.page.ts"),
    `import { Component } from "@angular/core";

@Component({
  standalone: true,
  template: \`<main><p>server only</p></main>\`,
})
export default class ServerOnlyBundlePage {}
`,
  );
}

async function writeAnalogInteractivePage(
  rootDir: string,
  fileName: string,
  className: string,
): Promise<void> {
  await writeFile(
    join(rootDir, "src", "app", "pages", fileName),
    `import { Component, signal } from "@angular/core";

@Component({
  standalone: true,
  template: \`<main><button type="button" (click)="increment()">count: {{ count() }}</button></main>\`,
})
export default class ${className} {
  count = signal(0);
  increment() {
    this.count.update((value) => value + 1);
  }
}
`,
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
