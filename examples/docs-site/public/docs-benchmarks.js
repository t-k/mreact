const benchmarkRoot = document.querySelector(".benchmark-results");

if (benchmarkRoot instanceof HTMLElement) {
  const filterButtons = [
    ...benchmarkRoot.querySelectorAll("[data-benchmark-filter]"),
  ].filter((button) => button instanceof HTMLButtonElement);
  const benchmarkPanels = [
    ...benchmarkRoot.querySelectorAll("[data-benchmark-badges]"),
  ].filter((panel) => panel instanceof HTMLElement);
  const benchmarkSuites = [
    ...benchmarkRoot.querySelectorAll(".benchmark-ranking-suite"),
  ].filter((suite) => suite instanceof HTMLElement);

  benchmarkRoot.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element ? event.target.closest("[data-benchmark-filter]") : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const nextFilter = button.dataset.benchmarkFilter ?? "all";
    const activeFilter = benchmarkRoot.dataset.benchmarkActiveFilter ?? "all";
    applyBenchmarkFilter(nextFilter === activeFilter ? "all" : nextFilter);
  });

  applyBenchmarkFilter("all");

  function applyBenchmarkFilter(filter) {
    benchmarkRoot.dataset.benchmarkActiveFilter = filter;

    for (const button of filterButtons) {
      const isActive = (button.dataset.benchmarkFilter ?? "all") === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    for (const panel of benchmarkPanels) {
      const badges = (panel.dataset.benchmarkBadges ?? "").split(" ");
      panel.hidden = filter !== "all" && !badges.includes(filter);
    }

    for (const suite of benchmarkSuites) {
      const visiblePanel = suite.querySelector("[data-benchmark-badges]:not([hidden])");
      suite.hidden = filter !== "all" && visiblePanel === null;
    }
  }
}
