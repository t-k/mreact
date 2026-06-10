const searchRoot = document.querySelector(".site-search");
const currentScript = document.currentScript;

if (searchRoot instanceof HTMLElement && currentScript instanceof HTMLScriptElement) {
  const input = searchRoot.querySelector(".site-search-input");
  const status = searchRoot.querySelector(".site-search-status");
  const results = searchRoot.querySelector(".site-search-results");
  const pagefindModuleUrl = new URL("pagefind/pagefind.js", currentScript.src);
  let pagefindPromise;
  let searchTimer;
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
        if (focusSearchResult(0)) {
          event.preventDefault();
        }
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
    });
  }

  async function runSearch(query) {
    latestQuery = query;
    clearResults();

    if (query.length < 2) {
      setStatus("");
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
      return;
    }

    setStatus(`${resultData.length} result${resultData.length === 1 ? "" : "s"}.`);

    for (const result of resultData) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const title = document.createElement("span");
      const excerpt = document.createElement("span");

      item.className = "site-search-result";
      link.href = result.url;
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
    results.replaceChildren();
  }

  function focusAdjacentSearchResult(currentLink, direction) {
    const links = searchResultLinks();
    const currentIndex = links.indexOf(currentLink);
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0) {
      input.focus();
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

    link.focus();
    return true;
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
