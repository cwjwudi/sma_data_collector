#!/bin/bash
# SD_SMA_ReportEditor：双击在终端启动（macOS）。
# — 释放本机开发与 Electron 常用的 8000 / 5173
# — 安装依赖（如需）
# — 并行启动 Vite + Electron（8000 由 Electron 内嵌子进程拉起 uvicorn；关窗口即收回端口）

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND="$ROOT/frontend"

echo "━━━━━━━━ SD SMA Report Editor · 一键开发启动 ━━━━━━━━"
echo "仓库根目录: $ROOT"

free_port () {
  local port="$1"
  local label="$2"
  local pids
  pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[端口] ${label:-$port} (${port}) 占用 → 结束 PID: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "[端口] ${port} 仍占用，尝试 kill -9 …"
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 0.3
    fi
  else
    echo "[端口] ${label:-$port} (${port}) 空闲"
  fi
}

free_port 8000 "FastAPI 后端"
free_port 5173 "Vite 前端"

if [[ ! -d "$FRONTEND" ]]; then
  echo "[错误] 未找到 frontend 目录: $FRONTEND"
  read -r -p "按回车关闭… "
  exit 1
fi

cd "$FRONTEND" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "[错误] 找不到 npm，请安装 Node.js（建议使用 Homebrew: brew install node）。"
  read -r -p "按回车关闭… "
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "[依赖] 正在 npm install …"
  npm install || { read -r -p "npm install 失败，按回车关闭… "; exit 1; }
fi

echo "[启动] electron:dev:unix（Ctrl+C 可全部退出；正常退出 Electron 后本标签会自动关闭）"
echo ""

EXIT_CODE=0
# macOS 「终端」：为该标签打上唯一标题，便于进程正常结束后自动关掉本标签，避免卡在「进程已完成」。
LAUNCH_TAB_TITLE="ReportEditorDev_$$"
if [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]]; then
  /usr/bin/osascript -e "tell application \"Terminal\" to tell front window's selected tab to set custom title to \"${LAUNCH_TAB_TITLE}\"" 2>/dev/null || true
fi

npm run electron:dev:unix || EXIT_CODE=$?

# concurrently 旧版/未加 -s 时：Electron 先 0 退出，Vite 被 -k 发 SIGTERM → 整体可能为 143，仍应关标签。
should_close_tab=0
if [[ "$EXIT_CODE" -eq 0 ]] || [[ "$EXIT_CODE" -eq 130 ]] || [[ "$EXIT_CODE" -eq 143 ]]; then
  should_close_tab=1
fi

if [[ "$should_close_tab" -eq 1 ]] && [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]] && [[ -n "${LAUNCH_TAB_TITLE:-}" ]]; then
  osa_err=$(/usr/bin/osascript 2>&1 <<APPLESCRIPT
tell application "Terminal"
  try
    repeat with w in windows
      repeat with tb in tabs of w
        try
          if (custom title of tb) is "${LAUNCH_TAB_TITLE}" then
            close tb saving false
            return
          end if
        end try
      end repeat
    end repeat
  on error errMsg number errNum
    return "AppleScript error " & errNum & ": " & errMsg
  end try
end tell
APPLESCRIPT
)
  if [[ -n "$osa_err" ]]; then
    echo "[Terminal] 未能自动关闭本标签：${osa_err}"
    echo "[Terminal] 请手动 ⌘W；若反复失败，在「系统设置 › 隐私与安全性 › 自动化」中允许「终端」控制「终端」。"
  fi
fi

exit "$EXIT_CODE"
