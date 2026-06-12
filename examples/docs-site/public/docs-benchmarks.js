const benchmarkRoot = document.querySelector(".benchmark-results");

if (benchmarkRoot instanceof HTMLElement) {
  const filterButtons = [
    ...benchmarkRoot.querySelectorAll("[data-benchmark-filter]"),
  ].filter((button) => button instanceof HTMLButtonElement);
  const frameworkFilterInputs = [
    ...benchmarkRoot.querySelectorAll("[data-benchmark-framework-filter]"),
  ].filter((input) => input instanceof HTMLInputElement);
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

  benchmarkRoot.addEventListener("change", (event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.matches("[data-benchmark-framework-filter]")
    ) {
      applyBenchmarkFilter(benchmarkRoot.dataset.benchmarkActiveFilter ?? "all");
    }
  });

  applyBenchmarkFilter("all");

  function applyBenchmarkFilter(filter) {
    benchmarkRoot.dataset.benchmarkActiveFilter = filter;
    const frameworkFilters = selectedFrameworkFilters();

    for (const button of filterButtons) {
      const isActive = (button.dataset.benchmarkFilter ?? "all") === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    for (const panel of benchmarkPanels) {
      const badges = (panel.dataset.benchmarkBadges ?? "").split(" ");
      const categoryMatches = filter === "all" || badges.includes(filter);
      const visibleRows = updateBenchmarkRows(panel, categoryMatches, frameworkFilters);
      panel.hidden = !categoryMatches || visibleRows === 0;
    }

    for (const suite of benchmarkSuites) {
      const visiblePanel = suite.querySelector("[data-benchmark-badges]:not([hidden])");
      suite.hidden = visiblePanel === null;
    }
  }

  function selectedFrameworkFilters() {
    return frameworkFilterInputs
      .filter((input) => input.checked)
      .map((input) => input.dataset.benchmarkFrameworkFilter)
      .filter((filter) => typeof filter === "string" && filter.length > 0);
  }

  function updateBenchmarkRows(panel, categoryMatches, frameworkFilters) {
    const rows = [...panel.querySelectorAll("[data-benchmark-framework-groups]")].filter(
      (row) => row instanceof HTMLElement,
    );
    let visibleRows = 0;

    for (const row of rows) {
      const rowGroups = (row.dataset.benchmarkFrameworkGroups ?? "").split(" ");
      const frameworkMatches =
        frameworkFilters.length === 0 ||
        frameworkFilters.some((frameworkFilter) => rowGroups.includes(frameworkFilter));
      const isVisible = categoryMatches && frameworkMatches;
      row.hidden = !isVisible;

      if (isVisible) {
        visibleRows += 1;
      }
    }

    for (const countNode of panel.querySelectorAll("[data-benchmark-visible-count]")) {
      countNode.textContent = `${visibleRows} ${visibleRows === 1 ? "entry" : "entries"}`;
    }

    return visibleRows;
  }
}
