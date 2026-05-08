import {
  applyTheme,
  clearStoredTheme,
  currentTheme,
  getSystemTheme,
  initThemeFromStorage,
  THEME_KEY,
  type ThemeMode,
} from "./theme";

initThemeFromStorage();
applyTheme(currentTheme(), false);

/** 已提交（与 localStorage 一致）的主题基准 */
let committedTheme: ThemeMode = currentTheme();

function commitThemePreferences(): void {
  const t = currentTheme();
  if (t === getSystemTheme()) {
    clearStoredTheme();
  } else {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
  }
  committedTheme = t;
}

const root = document.documentElement;
const sidebar = document.getElementById("sidebar")!;
const backdrop = document.getElementById("sidebarBackdrop")!;
const btnNav = document.getElementById("btnNavToggle")!;
const drawer = document.getElementById("drawerParams")!;
const resizer = document.getElementById("drawerResizer")!;
const btnDrawerToggle = document.getElementById("btnDrawerToggle")!;
const btnCollapse = document.getElementById("btnDrawerCollapse")!;
const edgeTab = document.getElementById("drawerEdgeTab")!;
const topTitle = document.getElementById("topTitle")!;
const pageHome = document.getElementById("page-home")!;
const pageSettings = document.getElementById("page-settings")!;
const themeLight = document.querySelector<HTMLInputElement>("#theme-light");
const themeDark = document.querySelector<HTMLInputElement>("#theme-dark");

const drawerPanelTool = document.getElementById("drawer-panel-tool");
const drawerPanelHint = document.getElementById("drawer-panel-settings-hint");
const drawerTitleText = document.getElementById("drawerTitleText");

const btnSettingsSave = document.getElementById("btn-settings-save");
const btnSettingsResetDefault = document.getElementById("btn-settings-reset-default");
const btnSettingsRevert = document.getElementById("btn-settings-revert");

themeLight?.addEventListener("change", () => {
  if (themeLight.checked) applyTheme("light", false);
});
themeDark?.addEventListener("change", () => {
  if (themeDark.checked) applyTheme("dark", false);
});

btnSettingsSave?.addEventListener("click", () => {
  commitThemePreferences();
});

btnSettingsResetDefault?.addEventListener("click", () => {
  applyTheme(getSystemTheme(), false);
});

btnSettingsRevert?.addEventListener("click", () => {
  applyTheme(committedTheme, false);
});

function syncDrawerContext(pageId: "home" | "settings"): void {
  if (!drawerPanelTool || !drawerPanelHint || !drawerTitleText) return;
  if (pageId === "settings") {
    drawerPanelTool.hidden = true;
    drawerPanelHint.hidden = false;
    drawerTitleText.textContent = "全局设置";
  } else {
    drawerPanelTool.hidden = false;
    drawerPanelHint.hidden = true;
    drawerTitleText.textContent = "当前工具参数";
  }
}

function showPage(pageId: "home" | "settings"): void {
  const wasSettings = pageSettings.classList.contains("is-visible");
  if (wasSettings && pageId !== "settings" && currentTheme() !== committedTheme) {
    applyTheme(committedTheme, false);
  }

  const settings = pageId === "settings";
  pageHome.classList.toggle("is-visible", !settings);
  pageSettings.classList.toggle("is-visible", settings);
  topTitle.textContent = settings ? "当前视图 · 全局设置" : "当前视图 · SQL 工作台";

  syncDrawerContext(pageId);
}

function setActiveNav(activeLink: HTMLElement | null): void {
  document.querySelectorAll("a.nav-item").forEach((a) => a.classList.remove("is-active"));
  activeLink?.classList.add("is-active");
}

document.querySelectorAll<HTMLAnchorElement>("a.nav-item[data-page]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const page = link.dataset.page === "settings" ? "settings" : "home";
    const d = link.closest("details");
    if (d) d.open = true;
    showPage(page);
    setActiveNav(link);
    if (window.innerWidth <= 768) closeSidebar();
  });
});

function pxNum(val: string): number {
  const n = parseFloat(String(val).trim());
  return Number.isFinite(n) ? n : 0;
}

function getDrawerWidth(): number {
  return pxNum(getComputedStyle(root).getPropertyValue("--drawer-width"));
}

function setDrawerWidth(w: number): void {
  const mn = pxNum(getComputedStyle(root).getPropertyValue("--drawer-min"));
  let mx = Math.min(pxNum(getComputedStyle(root).getPropertyValue("--drawer-max")), window.innerWidth * 0.55);
  if (!mx || mx < mn) mx = Math.min(480, window.innerWidth * 0.55);
  w = Math.round(Math.min(Math.max(w, mn), mx));
  root.style.setProperty("--drawer-width", `${w}px`);
}

function closeSidebar(): void {
  sidebar.classList.remove("is-open");
  backdrop.classList.remove("is-visible");
  btnNav.setAttribute("aria-expanded", "false");
}

function openSidebar(): void {
  sidebar.classList.add("is-open");
  backdrop.classList.add("is-visible");
  btnNav.setAttribute("aria-expanded", "true");
}

btnNav.addEventListener("click", () => {
  if (sidebar.classList.contains("is-open")) closeSidebar();
  else openSidebar();
});
backdrop.addEventListener("click", closeSidebar);
window.addEventListener("resize", () => {
  if (window.innerWidth > 768) closeSidebar();
});

function syncDrawerUi(collapsed: boolean): void {
  drawer.classList.toggle("is-collapsed", collapsed);
  drawer.setAttribute("aria-hidden", collapsed ? "true" : "false");
  btnDrawerToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  edgeTab.hidden = !collapsed;
}

btnDrawerToggle.addEventListener("click", () => {
  syncDrawerUi(!drawer.classList.contains("is-collapsed"));
});
btnCollapse.addEventListener("click", () => {
  syncDrawerUi(true);
});
edgeTab.addEventListener("click", () => {
  syncDrawerUi(false);
});

let dragging = false;
let startX = 0;
let startW = 0;

function onMove(clientX: number): void {
  if (!dragging) return;
  const delta = startX - clientX;
  setDrawerWidth(startW + delta);
}

resizer.addEventListener("mousedown", (e) => {
  if (drawer.classList.contains("is-collapsed")) return;
  e.preventDefault();
  dragging = true;
  startX = e.clientX;
  startW = drawer.getBoundingClientRect().width;
  document.body.classList.add("is-resizing");
});

window.addEventListener("mousemove", (e) => {
  onMove(e.clientX);
});

window.addEventListener("mouseup", () => {
  if (dragging) {
    dragging = false;
    document.body.classList.remove("is-resizing");
  }
});

resizer.addEventListener(
  "touchstart",
  (e) => {
    if (drawer.classList.contains("is-collapsed")) return;
    const t = e.touches[0];
    if (!t) return;
    dragging = true;
    startX = t.clientX;
    startW = drawer.getBoundingClientRect().width;
    document.body.classList.add("is-resizing");
  },
  { passive: true }
);

window.addEventListener(
  "touchmove",
  (e) => {
    const t = e.touches[0];
    if (!dragging || !t) return;
    onMove(t.clientX);
  },
  { passive: true }
);

window.addEventListener("touchend", () => {
  if (dragging) {
    dragging = false;
    document.body.classList.remove("is-resizing");
  }
});

resizer.addEventListener("keydown", (e) => {
  if (drawer.classList.contains("is-collapsed")) return;
  const step = e.shiftKey ? 24 : 8;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    setDrawerWidth(getDrawerWidth() + step);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    setDrawerWidth(getDrawerWidth() - step);
  }
});

setDrawerWidth(getDrawerWidth() || 280);
syncDrawerUi(false);
syncDrawerContext("home");
