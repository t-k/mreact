const mobileMenuQuery = window.matchMedia("(max-width: 51.25rem)");
const menuToggle = document.querySelector("[data-menu-toggle]");
const menuPanel = document.querySelector("#site-sidebar-menu");

if (menuToggle instanceof HTMLButtonElement && menuPanel instanceof HTMLElement) {
  let menuOpen = false;

  menuToggle.addEventListener("click", () => {
    if (!mobileMenuQuery.matches) {
      return;
    }

    setMenuOpen(!menuOpen, { restoreFocus: menuOpen });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenuQuery.matches && menuOpen) {
      setMenuOpen(false, { restoreFocus: true });
    }
  });

  mobileMenuQuery.addEventListener("change", syncMenuForViewport);
  syncMenuForViewport();

  function syncMenuForViewport() {
    if (mobileMenuQuery.matches) {
      setMenuOpen(menuOpen);
      return;
    }

    menuPanel.hidden = false;
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Navigation");
  }

  function setMenuOpen(open, options = {}) {
    menuOpen = open;
    menuPanel.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");

    if (open) {
      menuPanel.focus();
      return;
    }

    if (options.restoreFocus === true) {
      menuToggle.focus();
    }
  }
}
