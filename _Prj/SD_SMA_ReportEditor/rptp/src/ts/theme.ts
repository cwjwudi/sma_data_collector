export const THEME_KEY = "rptp-theme";

export type ThemeMode = "light" | "dark";

/** 首帧前调用：从 localStorage / 系统偏好设置 html[data-theme] */
export function initThemeFromStorage(): void {
  try {
    const k = localStorage.getItem(THEME_KEY);
    if (k === "light" || k === "dark") {
      document.documentElement.setAttribute("data-theme", k);
      return;
    }
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute(
    "data-theme",
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
}

export function applyTheme(theme: ThemeMode, persist = true): void {
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }
  const themeLight = document.querySelector<HTMLInputElement>("#theme-light");
  const themeDark = document.querySelector<HTMLInputElement>("#theme-dark");
  if (themeLight && themeDark) {
    themeLight.checked = theme === "light";
    themeDark.checked = theme === "dark";
  }
}

export function currentTheme(): ThemeMode {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
