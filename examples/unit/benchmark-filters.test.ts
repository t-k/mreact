import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToString } from "@reckona/mreact";
import { Window } from "happy-dom";
import { describe, expect, test } from "vitest";
import { BenchmarkResults } from "../docs-site/src/ui/BenchmarkResults.js";

const root = process.cwd();
const docsSiteRoot = join(root, "examples", "docs-site");

describe("benchmark filters", () => {
  test("renders router benchmark suite before separated primitive suites", () => {
    const html = renderToString(BenchmarkResults);

    expect(html.indexOf("Router benchmarks")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Primitive DOM benchmarks")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Primitive reactivity microbenchmarks")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Router benchmarks")).toBeLessThan(
      html.indexOf("Primitive DOM benchmarks"),
    );
    expect(html.indexOf("Primitive DOM benchmarks")).toBeLessThan(
      html.indexOf("Primitive reactivity microbenchmarks"),
    );
  });

  test("renders framework filter controls and groups Mreact variants together", () => {
    const html = renderToString(BenchmarkResults);

    expect(html).toContain("<legend>Frameworks</legend>");
    expect(html).toContain('data-benchmark-framework-filter="mreact"');
    expect(html).toContain('data-benchmark-framework-filter="react"');
    expect(html).toContain('data-benchmark-framework-groups="mreact"');
    expect(html).toContain('mreact react-compat');
    expect(html).toContain('mreact-app-router');
  });

  test("links js-framework benchmark cards to the official upstream harness", () => {
    const html = renderToString(BenchmarkResults);

    expect(html).toContain("Official js-framework-benchmark harness");
    expect(html).toContain('href="https://github.com/krausest/js-framework-benchmark"');
  });

  test("renders benchmark timing rows with distinct total, script, and paint cells", () => {
    const html = renderToString(BenchmarkResults);

    expect(html).toContain('class="benchmark-total-value"');
    expect(html).toContain('class="benchmark-total-label"');
    expect(html).toContain('class="benchmark-breakdown-term"');
    expect(html).toContain('data-benchmark-metric="script"');
    expect(html).toContain('data-benchmark-metric="paint"');
  });

  test("filters benchmark rows by selected framework groups while preserving category filters", async () => {
    const script = await readDocsSite("public/docs-benchmarks.js");
    const window = new Window({ url: "https://docs.example.com/benchmarks/" });

    try {
      window.document.body.innerHTML = `
        <section class="benchmark-results">
          <button type="button" data-benchmark-filter="all" aria-pressed="true">All</button>
          <button type="button" data-benchmark-filter="interactivity" aria-pressed="false">Interactivity</button>
          <label><input type="checkbox" data-benchmark-framework-filter="mreact" />Mreact</label>
          <label><input type="checkbox" data-benchmark-framework-filter="react" />React</label>
          <section class="benchmark-ranking-suite">
            <section class="benchmark-panel" data-benchmark-badges="interactivity">
              <span data-benchmark-visible-count>3 entries</span>
              <div class="benchmark-chart">
                <div class="benchmark-bar-row" data-benchmark-framework-groups="mreact">mreact</div>
                <div class="benchmark-bar-row" data-benchmark-framework-groups="react">react</div>
                <div class="benchmark-bar-row" data-benchmark-framework-groups="mreact">mreact react-compat</div>
              </div>
            </section>
            <section class="benchmark-panel" data-benchmark-badges="ssr">
              <span data-benchmark-visible-count>1 entry</span>
              <div class="benchmark-chart">
                <div class="benchmark-bar-row" data-benchmark-framework-groups="solid">solid</div>
              </div>
            </section>
          </section>
        </section>
      `;

      window.eval(script);

      const rows = [
        ...window.document.querySelectorAll<HTMLElement>("[data-benchmark-framework-groups]"),
      ];
      const panels = [...window.document.querySelectorAll<HTMLElement>("[data-benchmark-badges]")];
      const mreact = frameworkInput(window, "mreact");
      const react = frameworkInput(window, "react");

      mreact.click();

      expect(rows.map((row) => row.hidden)).toEqual([false, true, false, true]);
      expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
      expect(panels[0]?.querySelector("[data-benchmark-visible-count]")?.textContent).toBe(
        "2 entries",
      );

      react.click();

      expect(rows.map((row) => row.hidden)).toEqual([false, false, false, true]);
      expect(panels[0]?.querySelector("[data-benchmark-visible-count]")?.textContent).toBe(
        "3 entries",
      );

      window.document.querySelector<HTMLButtonElement>('[data-benchmark-filter="interactivity"]')?.click();

      expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
    } finally {
      window.close();
    }
  });
});

function frameworkInput(window: Window, group: string): HTMLInputElement {
  const input = window.document.querySelector(
    `[data-benchmark-framework-filter="${group}"]`,
  );
  expect(input).toBeInstanceOf(window.HTMLInputElement);
  return input as HTMLInputElement;
}

async function readDocsSite(path: string): Promise<string> {
  return readFile(join(docsSiteRoot, path), "utf8");
}
