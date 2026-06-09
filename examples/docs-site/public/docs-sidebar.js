const sidebar = document.querySelector(".site-sidebar");
const scrollStorageKey = "mreact:docs:sidebar-scroll";

if (sidebar instanceof HTMLElement) {
  const currentLink = markCurrentNavLink(sidebar);
  const savedScrollTop = readSidebarScrollTop();
  let scrollSavePending = false;

  window.requestAnimationFrame(() => {
    if (savedScrollTop !== undefined) {
      sidebar.scrollTop = savedScrollTop;
      return;
    }

    currentLink?.scrollIntoView({ block: "nearest" });
  });

  sidebar.addEventListener(
    "scroll",
    () => {
      if (scrollSavePending) {
        return;
      }

      scrollSavePending = true;
      window.requestAnimationFrame(() => {
        scrollSavePending = false;
        writeSidebarScrollTop(sidebar.scrollTop);
      });
    },
    { passive: true },
  );

  window.addEventListener("pagehide", () => {
    writeSidebarScrollTop(sidebar.scrollTop);
  });
}

function markCurrentNavLink(root) {
  const currentPath = normalizedPath(window.location.pathname);
  const links = root.querySelectorAll(".nav-link");

  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) {
      continue;
    }

    link.removeAttribute("aria-current");

    if (normalizedPath(new URL(link.href).pathname) === currentPath) {
      link.setAttribute("aria-current", "page");
      return link;
    }
  }

  return undefined;
}

function normalizedPath(pathname) {
  const trimmedPath = pathname.replace(/\/+$/g, "");
  return trimmedPath === "" ? "/" : `${trimmedPath}/`;
}

function readSidebarScrollTop() {
  try {
    const storedValue = window.sessionStorage.getItem(scrollStorageKey);
    if (storedValue === null) {
      return undefined;
    }

    const parsedValue = Number.parseInt(storedValue, 10);
    return Number.isNaN(parsedValue) ? undefined : parsedValue;
  } catch {
    return undefined;
  }
}

function writeSidebarScrollTop(scrollTop) {
  try {
    window.sessionStorage.setItem(scrollStorageKey, String(Math.round(scrollTop)));
  } catch {
    // Ignore storage errors so navigation remains fully usable without this enhancement.
  }
}
