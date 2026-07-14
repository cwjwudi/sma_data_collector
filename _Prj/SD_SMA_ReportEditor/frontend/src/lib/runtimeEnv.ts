/** 运行环境：是否需局域网 AI Token、桌面壳能力。 */

const LAN_AI_TOKEN_KEY = "report-editor-lan-agent-token";

export function isElectronShell(): boolean {
  return Boolean(typeof window !== "undefined" && window.electronAPI);
}

export function isPageOnLoopback(): boolean {
  if (typeof window === "undefined") return true;
  const h = (window.location.hostname || "").trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/** 非 Electron 且非 loopback → 应用内 AI 须带 Agent Token。 */
export function needsRemoteAiAuth(): boolean {
  return !isElectronShell() && !isPageOnLoopback();
}

export function getLanAiAgentToken(): string {
  try {
    return (sessionStorage.getItem(LAN_AI_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setLanAiAgentToken(token: string): void {
  const t = (token || "").trim();
  try {
    if (t) sessionStorage.setItem(LAN_AI_TOKEN_KEY, t);
    else sessionStorage.removeItem(LAN_AI_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearLanAiAgentToken(): void {
  setLanAiAgentToken("");
}

/** 远程场景下附加到 AI / Pending / 相关 API 的 Authorization。 */
export function lanAiAuthHeaders(): Record<string, string> {
  if (!needsRemoteAiAuth()) return {};
  const token = getLanAiAgentToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** 路径是否属于须局域网鉴权的应用内 AI 相关接口。 */
export function isLanAiProtectedApiPath(path: string): boolean {
  const p = path.startsWith("/") ? path : `/${path}`;
  return (
    p.startsWith("/settings/ai/") ||
    p === "/settings/client_prefs/mirror" ||
    p.startsWith("/settings/client_prefs/mirror")
  );
}

export function desktopOnlyHint(): string {
  return "此功能仅桌面安装版可用；局域网浏览器请在本机 Electron 中操作。";
}
