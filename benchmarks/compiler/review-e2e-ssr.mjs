import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [beforeRoot, afterRoot, output] = process.argv.slice(2);
if (!output)
  throw new Error("Usage: ssr-performance.mjs <before root> <after root> <new result.json>");
const variants = {};
for (const [label, root] of [
  ["before", beforeRoot],
  ["after", afterRoot],
]) {
  variants[label] = {
    root,
    compiler: await import(pathToFileURL(`${root}/packages/compiler/dist/index.js`)),
    compat: await import(pathToFileURL(`${afterRoot}/packages/react-compat/dist/index.js`)),
    server: await import(pathToFileURL(`${afterRoot}/packages/server/dist/index.js`)),
  };
}
const fixtures = [
  ["examples/selective-hydration/src/App.compat.tsx", "compat", "string"],
  ["examples/selective-hydration/src/App.compat.tsx", "compat", "stream"],
  ["examples/ssr-streaming/src/StreamPage.tsx", "reactive", "stream"],
];
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
  };
}
const results = [];
for (const [filename, mode, serverOutput] of fixtures) {
  const input = {
    filename,
    code: readFileSync(`${afterRoot}/${filename}`, "utf8"),
    mode,
    target: "server",
    serverOutput,
    serverHydration: mode === "compat",
    dev: false,
  };
  const render = {},
    samples = { before: [], after: [] },
    html = {};
  for (const label of ["before", "after"]) {
    const variant = variants[label];
    let code = variant.compiler.transform(input).code;
    const entries = [];
    for (const match of code.matchAll(/^import \{ ([^}]+) \} from "([^"]+)";/gm)) {
      const packageName = match[2].replace("@reckona/mreact-", "");
      const modulePath =
        packageName === "compat"
          ? "react-compat/dist/index.js"
          : `${packageName.split("/")[0]}/dist/${packageName.includes("/") ? packageName.split("/").slice(1).join("/") : "index"}.js`;
      const imported = await import(pathToFileURL(`${afterRoot}/packages/${modulePath}`));
      for (const specifier of match[1].split(", ")) {
        const [name, alias = name] = specifier.split(" as ");
        if (!(name in imported)) throw new Error(`Missing ${name} from ${modulePath}`);
        entries.push([alias, imported[name]]);
      }
    }
    code = code.replace(/^import .*;\n/gm, "").replace(/export (async )?function /g, "$1function ");
    const App = new Function(...entries.map(([name]) => name), code + "\nreturn App;")(
      ...entries.map(([, value]) => value),
    );
    render[label] =
      serverOutput === "string"
        ? () => variant.compat.renderToString(App)
        : async () => {
            const sink = variant.server.createStringSink();
            let task;
            variant.compat.renderToString(() => {
              task = App(sink);
              return "";
            });
            await task;
            await sink.drain();
            return sink.toString();
          };
    for (let i = 0; i < 5000; i++) await render[label]();
    html[label] = await render[label]();
  }
  if (html.before.replace(/<!--.*?-->/g, "") !== html.after.replace(/<!--.*?-->/g, ""))
    throw new Error(`Visible SSR differs: ${filename}`);
  for (let repeat = 0; repeat < 5; repeat++) {
    for (const label of ["before", "after", "after", "before"]) {
      for (let sample = 0; sample < 25; sample++) {
        const start = performance.now();
        for (let batch = 0; batch < 500; batch++) await render[label]();
        samples[label].push((performance.now() - start) / 500);
      }
    }
  }
  results.push({
    fixture: `${filename}:${serverOutput}`,
    before: stats(samples.before),
    after: stats(samples.after),
    htmlBytes: { before: Buffer.byteLength(html.before), after: Buffer.byteLength(html.after) },
  });
}
writeFileSync(
  output,
  JSON.stringify(
    {
      node: process.version,
      order:
        "ABBA repeated five times; same after-build SSR runtime; 5000 warmups; 250 batches of 500 renders per variant and fixture",
      results,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify(results, null, 2));
