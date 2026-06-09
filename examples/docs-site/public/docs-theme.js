const themeStorageKey = "mreact:docs:theme";
const themeToggle = document.querySelector("[data-theme-toggle]");
const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

if (themeToggle instanceof HTMLButtonElement) {
  themeToggle.addEventListener("click", () => {
    const nextTheme = resolvedTheme() === "dark" ? "light" : "dark";
    writeStoredTheme(nextTheme);
    applyTheme(nextTheme);
  });

  themeMediaQuery.addEventListener("change", () => {
    if (storedTheme() === undefined) {
      applyTheme(undefined);
    }
  });

  applyTheme(storedTheme());
}

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
    colorSchemeMeta?.setAttribute("content", theme);
  } else {
    delete document.documentElement.dataset.theme;
    colorSchemeMeta?.setAttribute("content", "light dark");
  }

  updateToggle(theme);
}

function updateToggle(theme) {
  if (!(themeToggle instanceof HTMLButtonElement)) {
    return;
  }

  const activeTheme = resolvedTheme();
  const nextTheme = activeTheme === "dark" ? "Light" : "Dark";
  themeToggle.textContent = `Theme: ${nextTheme}`;
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme.toLowerCase()} theme`);
  themeToggle.setAttribute("aria-pressed", theme === undefined ? "false" : "true");
}

function resolvedTheme() {
  const theme = storedTheme();
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  return themeMediaQuery.matches ? "dark" : "light";
}

function storedTheme() {
  try {
    const theme = window.localStorage.getItem(themeStorageKey);
    return theme === "light" || theme === "dark" ? theme : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredTheme(theme) {
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Ignore storage errors; the active page still changes theme for this session.
  }
}
