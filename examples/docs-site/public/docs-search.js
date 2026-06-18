const searchRoot = document.querySelector(".site-search");
const currentScript = document.currentScript;

if (searchRoot instanceof HTMLElement && currentScript instanceof HTMLScriptElement) {
  const input = searchRoot.querySelector(".site-search-input");
  const status = searchRoot.querySelector(".site-search-status");
  const results = searchRoot.querySelector(".site-search-results");
  const pagefindModuleUrl = new URL("pagefind/pagefind.js", currentScript.src);
  let pagefindPromise;
  let searchTimer;
  let activeResultIndex = -1;
  let latestQuery = "";

  if (
    input instanceof HTMLInputElement &&
    status instanceof HTMLElement &&
    results instanceof HTMLOListElement
  ) {
    input.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        void runSearch(input.value.trim());
      }, 120);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        if (setActiveSearchResult(activeResultIndex + 1)) {
          event.preventDefault();
        }
      }

      if (event.key === "ArrowUp") {
        if (setActiveSearchResult(activeResultIndex - 1)) {
          event.preventDefault();
        }
      }

      if (event.key === "Enter") {
        const link = activeSearchResultLink();
        if (link !== undefined) {
          event.preventDefault();
          link.click();
        }
      }

      if (event.key === "Escape") {
        closeResults();
      }
    });

    results.addEventListener("keydown", (event) => {
      const link = event.target instanceof HTMLAnchorElement ? event.target : null;
      if (link === null) {
        return;
      }

      if (event.key === "ArrowDown") {
        if (focusAdjacentSearchResult(link, 1)) {
          event.preventDefault();
        }
      }

      if (event.key === "ArrowUp") {
        if (focusAdjacentSearchResult(link, -1)) {
          event.preventDefault();
        }
      }

      if (event.key === "Escape") {
        closeResults();
        input.focus();
      }
    });
  }

  async function runSearch(query) {
    latestQuery = query;
    clearResults();

    if (query.length < 2) {
      setStatus("");
      closeResults();
      return;
    }

    setStatus("Searching...");

    try {
      const pagefind = await loadPagefind();
      const response = await pagefind.search(query);
      if (query !== latestQuery) {
        return;
      }

      const resultData = await Promise.all(response.results.slice(0, 8).map((result) => result.data()));
      if (query !== latestQuery) {
        return;
      }

      renderResults(resultData);
    } catch {
      setStatus("Search is available after the static docs build.");
    }
  }

  async function loadPagefind() {
    pagefindPromise ??= import(pagefindModuleUrl.href);
    return await pagefindPromise;
  }

  function renderResults(resultData) {
    clearResults();

    if (resultData.length === 0) {
      setStatus("No results.");
      closeResults();
      return;
    }

    setStatus(`${resultData.length} result${resultData.length === 1 ? "" : "s"}.`);
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");

    for (const [index, result] of resultData.entries()) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const title = document.createElement("span");
      const excerpt = document.createElement("span");

      item.className = "site-search-result";
      item.setAttribute("role", "none");
      link.href = result.url;
      link.id = `site-search-result-${index}`;
      link.setAttribute("role", "option");
      link.setAttribute("aria-selected", "false");
      link.dataset.searchResultLink = "";
      title.className = "site-search-result-title";
      title.textContent = result.meta?.title ?? result.url;
      excerpt.className = "site-search-result-excerpt";
      excerpt.textContent = textExcerpt(result.excerpt);

      link.append(title, excerpt);
      item.append(link);
      results.append(item);
    }
  }

  function textExcerpt(value) {
    return (value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }

  function clearResults() {
    activeResultIndex = -1;
    input.setAttribute("aria-activedescendant", "");
    input.setAttribute("aria-expanded", "false");
    results.hidden = true;
    results.replaceChildren();
  }

  function closeResults() {
    activeResultIndex = -1;
    input.setAttribute("aria-activedescendant", "");
    input.setAttribute("aria-expanded", "false");
    results.hidden = true;
    for (const link of searchResultLinks()) {
      link.setAttribute("aria-selected", "false");
    }
  }

  function focusAdjacentSearchResult(currentLink, direction) {
    const links = searchResultLinks();
    const currentIndex = links.indexOf(currentLink);
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0) {
      input.focus();
      closeResults();
      return true;
    }

    return focusSearchResult(nextIndex);
  }

  function focusSearchResult(index) {
    const links = searchResultLinks();
    const link = links[index];
    if (link === undefined) {
      return false;
    }

    activeResultIndex = index;
    updateActiveSearchResult();
    link.focus();
    return true;
  }

  function setActiveSearchResult(index) {
    const links = searchResultLinks();
    if (links.length === 0) {
      return false;
    }

    activeResultIndex = Math.max(0, Math.min(index, links.length - 1));
    updateActiveSearchResult();
    return true;
  }

  function updateActiveSearchResult() {
    const links = searchResultLinks();
    for (const [index, link] of links.entries()) {
      const selected = index === activeResultIndex;
      link.setAttribute("aria-selected", String(selected));
      if (selected) {
        input.setAttribute("aria-activedescendant", link.id);
      }
    }
  }

  function activeSearchResultLink() {
    return searchResultLinks()[activeResultIndex];
  }

  function searchResultLinks() {
    return [...results.querySelectorAll("[data-search-result-link]")].filter(
      (link) => link instanceof HTMLAnchorElement,
    );
  }

  function setStatus(message) {
    status.textContent = message;
  }
}
